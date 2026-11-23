/* 収蔵庫 — 美術館や博物館の、いま展示されていないもの */
(function () {
  "use strict";
  const U = window.U;
  const D = window.UMO_DATA;
  const JPS = "https://jpsearch.go.jp/api/";
  const MET = "https://collectionapi.metmuseum.org/public/collection/";
  const CMA = "https://openaccess-api.clevelandart.org/api/";

  const SOURCES = [
    { id: "jp", label: "日本の収蔵品", note: "ジャパンサーチ。全国の博物館・美術館・図書館・文書館の所蔵品を横断する。" },
    { id: "met", label: "メトロポリタン美術館", note: "ニューヨーク。今は展示室に出ていないものだけを選ぶ。" },
    { id: "cma", label: "クリーブランド美術館", note: "オハイオ州。今は展示室に出ていないものだけを選ぶ。" }
  ];

  const dbNames = new Map();
  async function dbName(db) {
    if (!db) return "";
    if (dbNames.has(db)) return dbNames.get(db);
    try {
      const d = await U.fetchJSON(JPS + "database/" + encodeURIComponent(db), { source: "ジャパンサーチ", retries: 0, timeout: 8000 });
      const n = (d.name && (d.name.ja || d.name.en)) || db;
      dbNames.set(db, n);
      return n;
    } catch (e) { return db; }
  }
  const isImg = (u) => /\.(jpe?g|png|gif|webp)(\?|$)/i.test(u || "") || /\/iiif\/|\/media\/|image/i.test(u || "");

  let dg = null;
  const def = {
    id: "storage", name: "収蔵庫", group: "観る", lith: "granite",
    short: "展示されていない収蔵品",
    title: "収蔵庫で眠っているもの",
    lede: "でたらめな鍵語で、美術館や博物館の収蔵品から一点を引き出す。多くは今、誰の目にも触れていない。",
    digger: () => dg,
    mount(el) {
      const st = { src: U.prefs.get("storage", "src", "jp"), era: U.prefs.get("storage", "era", ""), keyword: "", lockKeyword: false, thread: null };
      if (!SOURCES.some((s) => s.id === st.src)) st.src = "jp";
      el.append(U.roomHead(def));
      const srcCtl = U.veins({ items: SOURCES, value: st.src, label: "収蔵先", onChange: (v) => { st.src = v; st.thread = null; threadCtl.set(null); U.prefs.set("storage", "src", v); eraRow.hidden = v !== "jp"; dg.run(); } });
      const eraSel = U.h("select", { class: "select", id: "storage-era", "aria-label": "時代" }, D.jpsEras.map(([v, l]) => U.h("option", { value: v, selected: v === st.era }, l)));
      eraSel.addEventListener("change", () => { st.era = eraSel.value; U.prefs.set("storage", "era", st.era); dg.run(); });
      const kwInput = U.h("input", { type: "text", class: "text-input", id: "storage-kw", placeholder: "空欄なら、でたらめな鍵語", autocomplete: "off", style: { width: "14em" } });
      const kwForm = U.h("form", { class: "field-row", on: { submit: (e) => { e.preventDefault(); st.lockKeyword = !!kwInput.value.trim(); st.keyword = kwInput.value.trim(); dg.run(); } } },
        U.h("label", { for: "storage-kw", class: "sr-only" }, "鍵語"), kwInput, U.h("button", { type: "submit", class: "btn" }, "この言葉で引き出す"));
      const eraRow = U.h("div", { class: "control", hidden: st.src !== "jp" }, U.h("span", { class: "label-cap" }, "時代"), U.h("div", { class: "control-body" }, U.h("div", { class: "field-row" }, eraSel)));
      const threadCtl = U.threadControl(() => { st.thread = null; threadCtl.set(null); dg.run(); });
      const stage = U.h("div", { class: "dig-site" });
      const trailHost = U.h("div");
      el.append(U.h("div", { class: "controls" }, srcCtl, eraRow,
        U.h("div", { class: "control" }, U.h("span", { class: "label-cap" }, "鍵語"), U.h("div", { class: "control-body" }, kwForm,
          U.h("p", { class: "vein-note" }, "空にしておくと、毎回ちがう言葉で引き出す。海外の収蔵庫に自分で鍵語を入れるときは英語で（例：moon、spoon）。"))),
        threadCtl), stage, trailHost);

      /* ---------- 日本：ジャパンサーチ ---------- */
      async function digJP(stale) {
        for (let attempt = 0; attempt < 4; attempt++) {
          const kw = st.thread && st.thread.kw ? st.thread.kw : (st.lockKeyword ? st.keyword : U.pick(D.jpsKeywords));
          const params = { keyword: kw, "f-contents": "image", size: 20 };
          if (st.era && !(st.thread && st.thread.db)) params["f-tempo"] = st.era;
          if (st.thread && st.thread.db) params["f-db"] = st.thread.db;
          const base = JPS + "item/search/jps-cross?" + U.query(params);
          const first = await U.fetchJSON(base + "&from=0", { source: "ジャパンサーチ", retries: 1 });
          if (stale()) return null;
          const hit = first.hit || 0;
          if (!hit) { if (st.lockKeyword || (st.thread && st.thread.kw)) break; continue; }
          const maxFrom = Math.max(0, Math.min(hit, 1000) - 20);
          const from = U.rand(maxFrom + 1);
          const d = from === 0 ? first : await U.fetchJSON(base + "&from=" + from, { source: "ジャパンサーチ", retries: 1 });
          if (stale()) return null;
          const items = U.shuffle((d.list || []).filter((it) => it.common && (U.first(it.common.thumbnailUrl) || isImg(U.first(it.common.contentsUrl)))));
          if (!items.length) continue;
          const it = items[0], c = it.common;
          const big = U.list(c.contentsUrl).find((u) => /\.(jpe?g|png)(\?|$)/i.test(u));
          const image = big || U.first(c.thumbnailUrl);
          const museum = await dbName(c.database);
          if (stale()) return null;
          const contributors = U.list(c.contributor).filter((x) => !/^(By |Gift of )/.test(x)).slice(0, 4);
          const threads = [
            { label: "同じ鍵語でもう一点", value: kw, run: () => { st.thread = { label: "鍵語", value: kw, kw }; threadCtl.set(st.thread); dg.run(); } }
          ];
          if (c.database) threads.push({ label: "同じ館・同じ棚から", value: museum, run: () => { st.thread = { label: "収蔵先", value: museum, db: c.database, kw }; threadCtl.set(st.thread); dg.run(); } });
          return {
            id: "jps:" + it.id, room: "storage",
            kicker: [museum, U.joinList(c.temporal)].filter(Boolean).join("／"),
            title: c.title || "（名前のない収蔵品）",
            sub: contributors.join("、"),
            image, imageAlt: c.title || "",
            meta: [["時代", U.joinList(c.temporal)], ["収蔵先", museum], ["鍵語", kw]],
            desc: U.truncate(U.stripHTML(c.description), 900),
            extra: U.h("p", { class: "room-note" }, "鍵語「" + kw + "」で" + U.num(hit) + "点が見つかり、そのうちの" + (from + 1) + "番目あたりから引き出した。"),
            links: c.linkUrl ? [{ label: "所蔵館のページ", url: c.linkUrl }] : [],
            url: "https://jpsearch.go.jp/item/" + encodeURIComponent(it.id), urlLabel: "ジャパンサーチで開く",
            threads
          };
        }
        return { notice: U.notice("この言葉では何も出てこなかった", "鍵語や時代を変えて、もう一度。", [U.btn("もう一度引き出す", () => dg.run(), "btn-dig")]) };
      }

      /* ---------- メトロポリタン美術館 ---------- */
      async function digMet(stale) {
        for (let attempt = 0; attempt < 3; attempt++) {
          const [kw, ja] = st.thread && st.thread.mkw ? st.thread.mkw : (st.lockKeyword ? [st.keyword, st.keyword] : U.pick(D.museumKeywords));
          const s1 = await U.fetchJSON(MET + "v1.1/search?" + U.query({ q: kw, hasImages: "true", limit: 40, offset: 0 }), { source: "メトロポリタン美術館", retries: 1 });
          if (stale()) return null;
          const total = s1.total || 0;
          if (!total) { if (st.lockKeyword) break; continue; }
          const off = U.rand(Math.max(0, Math.min(total, 9960) - 40) + 1);
          const s2 = off ? await U.fetchJSON(MET + "v1.1/search?" + U.query({ q: kw, hasImages: "true", limit: 40, offset: off }), { source: "メトロポリタン美術館", retries: 1 }) : s1;
          if (stale()) return null;
          const ids = U.shuffle(s2.objectIDs || s1.objectIDs || []).slice(0, 10);
          let fallback = null;
          for (const id of ids) {
            let o;
            try { o = await U.fetchJSON(MET + "v1/objects/" + id, { source: "メトロポリタン美術館", retries: 0, timeout: 10000 }); } catch (e) { continue; }
            if (stale()) return null;
            if (!o || !o.primaryImageSmall) continue;
            if (!o.GalleryNumber) return metFind(o, kw, ja, total, false);
            if (!fallback) fallback = o;
          }
          if (fallback) return metFind(fallback, kw, ja, total, true);
        }
        return { notice: U.notice("収蔵庫の扉が開かなかった", "もう一度引き出してみて。", [U.btn("もう一度引き出す", () => dg.run(), "btn-dig")]) };
      }
      function metFind(o, kw, ja, total, onView) {
        const since = o.accessionYear && /^\d{4}$/.test(o.accessionYear) ? new Date().getFullYear() - Number(o.accessionYear) : null;
        return {
          id: "met:" + o.objectID, room: "storage",
          kicker: ["メトロポリタン美術館", o.department].filter(Boolean).join("／"),
          title: o.title || "（名前のない収蔵品）",
          sub: [o.artistDisplayName, o.culture].filter(Boolean).join("、"),
          image: o.primaryImageSmall, imageAlt: o.title || "",
          meta: [["年代", o.objectDate], ["文化", o.culture], ["素材", o.medium], ["大きさ", U.truncate(o.dimensions || "", 80)], ["収蔵", o.accessionYear ? o.accessionYear + "年" + (since ? "（" + since + "年前）" : "") : ""], ["鍵語", ja === kw ? kw : kw + "（" + ja + "）"]],
          desc: o.creditLine ? "来歴：" + o.creditLine : "",
          extra: U.h("p", { class: "metric-poem" }, onView ? "これは今、展示室に出ている。収蔵庫の作品は今回は見つからなかった。" : "今は展示室に出ていない。収蔵庫の棚で眠っている。"),
          url: o.objectURL, urlLabel: "美術館のページで見る",
          threads: [{ label: "同じ鍵語でもう一点", value: kw, run: () => { st.thread = { label: "鍵語", value: kw, mkw: [kw, ja] }; threadCtl.set(st.thread); dg.run(); } }]
        };
      }

      /* ---------- クリーブランド美術館 ---------- */
      async function digCMA(stale) {
        for (let attempt = 0; attempt < 3; attempt++) {
          const [kw, ja] = st.thread && st.thread.mkw ? st.thread.mkw : (st.lockKeyword ? [st.keyword, st.keyword] : U.pick(D.museumKeywords));
          const q = (skip) => CMA + "artworks/?" + U.query({ q: kw, has_image: 1, limit: 40, skip });
          const first = await U.fetchJSON(q(0), { source: "クリーブランド美術館", retries: 2, timeout: 26000 });
          if (stale()) return null;
          const total = (first.info && first.info.total) || 0;
          if (!total) { if (st.lockKeyword) break; continue; }
          const skip = U.rand(Math.max(1, total - 40) + 1);
          const d = skip === 0 ? first : await U.fetchJSON(q(skip), { source: "クリーブランド美術館", retries: 2, timeout: 26000 });
          if (stale()) return null;
          const all = (d.data || []).filter((x) => x.images && x.images.web && x.images.web.url);
          const asleep = U.shuffle(all.filter((x) => !x.current_location));
          const o = asleep[0] || U.shuffle(all)[0];
          if (!o) continue;
          const onView = !!o.current_location;
          const creators = (o.creators || []).map((c) => c.description).filter(Boolean).slice(0, 3).join("、");
          return {
            id: "cma:" + o.id, room: "storage",
            kicker: ["クリーブランド美術館", o.department].filter(Boolean).join("／"),
            title: o.title || "（名前のない収蔵品）",
            sub: creators || U.joinList(o.culture),
            image: o.images.web.url, imageAlt: o.title || "",
            meta: [["年代", o.creation_date], ["文化", U.joinList(o.culture)], ["技法・素材", U.truncate(o.technique || "", 120)], ["種類", o.type], ["大きさ", U.truncate(o.measurements || "", 80)], ["鍵語", kw === ja ? kw : kw + "（" + ja + "）"]],
            desc: U.truncate(o.wall_description || o.description || (o.creditline ? "来歴：" + o.creditline : ""), 900),
            extra: U.h("p", { class: "metric-poem" }, onView ? "これは今、展示室に出ている（" + o.current_location + "）。" : "今は展示室に出ていない。収蔵庫の棚で眠っている。"),
            url: o.url, urlLabel: "美術館のページで見る",
            threads: [{ label: "同じ鍵語でもう一点", value: kw, run: () => { st.thread = { label: "鍵語", value: kw, mkw: [kw, ja] }; threadCtl.set(st.thread); dg.run(); } }]
          };
        }
        return { notice: U.notice("収蔵庫の扉が開かなかった", "もう一度引き出してみて。", [U.btn("もう一度引き出す", () => dg.run(), "btn-dig")]) };
      }

      dg = U.digger({
        room: "storage", stage, trailHost,
        loadingText: () => "収蔵庫の棚を探しています…",
        renderFind: (find, api) => U.findCard(find, { onNext: () => api.run(), nextLabel: "次を引き出す" }),
        dig: (arg, stale) => (st.src === "met" ? digMet(stale) : st.src === "cma" ? digCMA(stale) : digJP(stale))
      });
      dg.run();
    }
  };
  U.room(def);
})();
