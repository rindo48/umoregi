/* 頁 — Wikipedia で、この30日いちばん読まれなかった頁 */
(function () {
  "use strict";
  const U = window.U;
  const D = window.UMO_DATA;
  const SRC = "Wikipedia";

  const api = (lang, params) => U.fetchJSON("https://" + lang + ".wikipedia.org/w/api.php?" + U.query(Object.assign({ format: "json", formatversion: 2, origin: "*" }, params)), { source: SRC, retries: 1 });
  const summary = (lang, title) => U.fetchJSON("https://" + lang + ".wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title.replace(/ /g, "_")), { source: SRC, retries: 1 });

  /* 閲覧数は20件ずつ問い合わせる（多すぎると途中で切られる） */
  async function pageviews(lang, titles) {
    const out = new Map();
    for (let i = 0; i < titles.length; i += 20) {
      const batch = titles.slice(i, i + 20);
      let cont = {};
      for (let k = 0; k < 5; k++) {
        const d = await api(lang, Object.assign({ action: "query", prop: "pageviews", pvipdays: 30, titles: batch.join("|"), redirects: 1 }, cont));
        ((d.query && d.query.pages) || []).forEach((p) => { if (p.pageviews && !p.missing) out.set(p.title, p.pageviews); });
        if (!d.continue || !d.continue.pvipcontinue) break;
        cont = d.continue;
      }
    }
    return out;
  }
  const total = (days) => Object.values(days || {}).reduce((a, v) => a + (v || 0), 0);

  async function categoryPool(lang, cat, depth) {
    const pool = [];
    let current = cat;
    for (let level = 0; level <= depth; level++) {
      const d = await api(lang, { action: "query", list: "categorymembers", cmtitle: current, cmlimit: 500, cmtype: "page|subcat" });
      const members = (d.query && d.query.categorymembers) || [];
      const pages = members.filter((m) => m.ns === 0).map((m) => m.title);
      const subs = members.filter((m) => m.ns === 14).map((m) => m.title);
      pool.push(...pages);
      if (!subs.length || (pool.length > 30 && Math.random() < 0.4)) break;
      current = U.pick(subs);
    }
    return Array.from(new Set(pool));
  }

  function spark(days) {
    const entries = Object.entries(days || {}).sort((a, b) => a[0].localeCompare(b[0]));
    const max = Math.max(1, ...entries.map(([, v]) => v || 0));
    const wrap = U.h("div", { "aria-hidden": "true" },
      U.h("div", { class: "spark" }, entries.map(([d, v]) => U.h("i", { class: v ? "" : "is-zero", title: d + "：" + (v || 0) + "回", style: { height: Math.max(2, ((v || 0) / max) * 34) + "px" } }))),
      U.h("div", { class: "spark-cap" }, U.h("span", null, entries.length ? entries[0][0].slice(5).replace("-", "/") : ""), U.h("span", null, "一日ごとの閲覧"), U.h("span", null, entries.length ? entries[entries.length - 1][0].slice(5).replace("-", "/") : "")));
    return wrap;
  }

  function km(lat1, lon1, lat2, lon2) {
    const R = 6371, toR = (x) => (x * Math.PI) / 180;
    const a = Math.sin(toR(lat2 - lat1) / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(toR(lon2 - lon1) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  U.wiki = { api, summary, pageviews, categoryPool, total };

  const VEINS = [
    { id: "ja", label: "でたらめ（日本語）", note: "日本語版の頁を20ほどでたらめに拾い、いちばん読まれていないものを残す。" },
    { id: "en", label: "でたらめ（英語）", note: "英語版から同じように拾う。" },
    { id: "topic", label: "主題から", note: "趣味、工芸、郷土料理……分類の奥へ潜って、読まれていない頁を探す。" },
    { id: "near", label: "近くの場所", note: "ある地点から10km以内の、誰も気に留めない場所の頁。" }
  ];
  const LEVELS = U.depthBands([3000, 300, 30, 3]);

  let dg = null;
  const def = {
    id: "pages", name: "頁", group: "読む", lith: "tuff",
    short: "読まれない頁",
    title: "誰にも読まれていない頁",
    lede: "Wikipedia の頁をいくつか拾い上げ、この30日でいちばん読まれなかったものを残す。誰かが書いて、ほとんど誰も読んでいない頁。",
    digger: () => dg,
    mount(el) {
      const st = {
        vein: U.prefs.get("pages", "vein", "ja"),
        depth: U.prefs.get("pages", "depth", 2),
        topic: U.prefs.get("pages", "topic", ""),
        place: U.prefs.get("pages", "place", null), thread: null
      };
      if (!VEINS.some((v) => v.id === st.vein)) st.vein = "ja";
      el.append(U.roomHead(def));
      const veins = U.veins({ items: VEINS, value: st.vein, onChange: (v) => { st.vein = v; st.thread = null; threadCtl.set(null); U.prefs.set("pages", "vein", v); syncRows(); if (v !== "near" || st.place) dg.run(); else showNearStart(); } });
      const depth = U.depth({ levels: LEVELS, value: st.depth, unit: "回", label: "深度", onChange: (i) => { st.depth = i; U.prefs.set("pages", "depth", i); dg.run(); } });
      const topicSel = U.h("select", { class: "select", id: "pages-topic", "aria-label": "主題" },
        U.h("option", { value: "", selected: !st.topic }, "でたらめ"),
        D.wikiTopics.map(([cat, label]) => U.h("option", { value: cat, selected: cat === st.topic }, label)));
      topicSel.addEventListener("change", () => { st.topic = topicSel.value; U.prefs.set("pages", "topic", st.topic); dg.run(); });
      const topicRow = U.h("div", { class: "control" }, U.h("span", { class: "label-cap" }, "主題"), U.h("div", { class: "control-body" }, U.h("div", { class: "field-row" }, topicSel)));
      const placeInput = U.h("input", { type: "text", class: "text-input", id: "pages-place", placeholder: "地名（例：尾道、小樽）", autocomplete: "off" });
      const placeNote = U.h("p", { class: "vein-note" });
      const placeRow = U.h("div", { class: "control" }, U.h("span", { class: "label-cap" }, "地点"), U.h("div", { class: "control-body" },
        U.h("form", { class: "field-row", on: { submit: (e) => { e.preventDefault(); setPlaceByName(placeInput.value.trim()); } } },
          U.btn("いまいる場所", () => setPlaceHere()), U.h("span", null, "または"), placeInput, U.h("button", { type: "submit", class: "btn" }, "この地名で")),
        placeNote));
      const threadCtl = U.threadControl(() => { st.thread = null; threadCtl.set(null); dg.run(); });
      function syncRows() { topicRow.hidden = st.vein !== "topic"; placeRow.hidden = st.vein !== "near"; }
      const stage = U.h("div", { class: "dig-site" });
      const trailHost = U.h("div");
      el.append(U.h("div", { class: "controls" }, veins, topicRow, placeRow, depth, threadCtl), stage, trailHost);
      syncRows();

      function showNearStart() {
        U.clear(stage).append(U.h("div", { class: "start-panel" },
          U.h("p", null, "今いる場所か、どこかの地名を決めると、そこから10km以内の頁の中で、いちばん読まれていないものを探す。"),
          U.h("div", { class: "field-row" }, U.btn("いまいる場所から", () => setPlaceHere(), "btn-dig"))));
      }
      function setPlaceHere() {
        if (!navigator.geolocation) { placeNote.textContent = "このブラウザでは現在地を使えない。地名で試してみて。"; return; }
        placeNote.textContent = "現在地を確かめています…";
        navigator.geolocation.getCurrentPosition((pos) => {
          st.place = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: "いまいる場所" };
          U.prefs.set("pages", "place", null);
          placeNote.textContent = "いまいる場所から探す（位置は覚えておかない）。";
          dg.run();
        }, () => { placeNote.textContent = "現在地が取れなかった。地名で試してみて。"; }, { timeout: 12000, maximumAge: 600000 });
      }
      async function setPlaceByName(name) {
        if (!name) return;
        placeNote.textContent = "「" + name + "」を探しています…";
        try {
          const d = await api("ja", { action: "query", generator: "search", gsrsearch: name, gsrlimit: 5, prop: "coordinates" });
          const p = ((d.query && d.query.pages) || []).sort((a, b) => (a.index || 0) - (b.index || 0)).find((x) => x.coordinates && x.coordinates[0]);
          if (!p) { placeNote.textContent = "「" + name + "」の位置がわからなかった。別の書き方で試してみて。"; return; }
          st.place = { lat: p.coordinates[0].lat, lon: p.coordinates[0].lon, name: p.title };
          U.prefs.set("pages", "place", st.place);
          placeNote.textContent = p.title + " を中心に探す。";
          dg.run();
        } catch (e) { placeNote.textContent = U.errorText(e); }
      }

      async function buildFind(lang, title, days, extraNote) {
        const s = await summary(lang, title);
        if (!s || s.type === "disambiguation" || /一覧$|^List of /.test(s.title || title)) return null;
        const views = total(days);
        const threads = [
          { label: "頁の中のリンクを一本たどる", value: title, run: () => { st.thread = { kind: "link", lang, title, label: "リンク", value: title }; threadCtl.set(st.thread); dg.run(); } },
          { label: "同じ分類の、読まれない頁", value: title, run: () => { st.thread = { kind: "cat", lang, title, label: "分類", value: title }; threadCtl.set(st.thread); dg.run(); } }
        ];
        let dist = "";
        if (st.vein === "near" && st.place && s.coordinates) dist = km(st.place.lat, st.place.lon, s.coordinates.lat, s.coordinates.lon).toFixed(1) + "km";
        const links = [];
        if (s.coordinates) links.push({ label: "地図で見る", url: "https://www.openstreetmap.org/?mlat=" + s.coordinates.lat + "&mlon=" + s.coordinates.lon + "#map=16/" + s.coordinates.lat + "/" + s.coordinates.lon });
        return {
          id: "wiki:" + lang + ":" + (s.title || title), room: "pages",
          kicker: [lang === "ja" ? "日本語版" : "英語版", s.description, dist ? st.place.name + "から" + dist : ""].filter(Boolean).join("／"),
          title: s.title || title,
          sub: "",
          image: s.thumbnail && s.thumbnail.source ? s.thumbnail.source : "",
          imageAlt: "",
          desc: s.extract || "",
          extra: U.h("div", null, extraNote ? U.h("p", { class: "room-note" }, extraNote) : null),
          metric: {
            value: views, unit: "回", label: "この30日間に開かれた回数",
            poem: views === 0 ? "この30日間、誰もこの頁を開いていない。" : views <= 10 ? "この30日間に開かれたのは、たった" + views + "回。" : "一日あたり、およそ" + (views / 30).toFixed(1) + "回。"
          },
          links,
          url: (s.content_urls && s.content_urls.desktop && s.content_urls.desktop.page) || "https://" + lang + ".wikipedia.org/wiki/" + encodeURIComponent(title),
          urlLabel: "Wikipedia で読む",
          threads,
          _spark: spark(days)
        };
      }

      /* 選んだ深さの帯に入る頁を、読まれていない順に並べる。帯になければ、帯より浅い（よく読まれている）
         頁のうち帯に近いものから。帯より深い頁には入らない。糸をたどっているときだけは、
         浅いほうにもなければ帯のすぐ下の頁へ（糸の先が途切れないように） */
      function loneliest(pv, lv, loose) {
        const scored = Array.from(pv.entries()).map(([t, days]) => ({ t, days, n: total(days) }));
        if (!scored.length) return null;
        scored.sort((a, b) => a.n - b.n || Math.random() - 0.5);
        const inBand = scored.filter((x) => U.inBand(x.n, lv));
        if (inBand.length) { const list = U.shuffle(inBand.slice(0, 3)).concat(inBand.slice(3)); return { list, pick: list[0], relaxed: false }; }
        const above = lv.max == null ? [] : scored.filter((x) => x.n > lv.max);
        if (above.length) return { list: above, pick: above[0], relaxed: true };
        if (loose && lv.min != null) { const below = scored.filter((x) => x.n <= lv.min).reverse(); if (below.length) return { list: below, pick: below[0], relaxed: true }; }
        return null;
      }
      /* 拾った頁がどれも選んだ帯より深かったとき（帯より深いところへは下りない） */
      function tooDeep(what) {
        const lv = LEVELS[st.depth];
        return { notice: U.notice(lv.label + "の頁が見つからなかった", what + "は、どれも" + lv.label + "（" + U.bandText(lv, "回") + "）より読まれていなかった。もう一度めくるか、深度を変えてみて。", [U.btn("もう一度", () => dg.run(), "btn-dig")]) };
      }
      /* 曖昧さ回避や一覧の頁を飛ばしながら、最初に形になった一頁を返す */
      async function firstGood(lang, r, note, stale) {
        for (const c of r.list.slice(0, 5)) {
          const f = await buildFind(lang, c.t, c.days, note);
          if (stale && stale()) return null;
          if (f) return f;
        }
        return null;
      }

      dg = U.digger({
        room: "pages", stage, trailHost,
        loadingText: () => (st.thread ? "糸をたどって頁をめくっています…" : "頁をめくっています…"),
        renderFind: (find, a) => {
          const card = U.findCard(find, { onNext: () => a.run() });
          const metric = U.$(".find-metric", card);
          if (metric && find._spark) metric.insertBefore(find._spark, U.$(".metric-poem", metric));
          return card;
        },
        dig: async (arg, stale) => {
          const lv = LEVELS[st.depth];
          if (st.thread && st.thread.kind === "link") {
            const d = await api(st.thread.lang, { action: "query", prop: "links", titles: st.thread.title, plnamespace: 0, pllimit: 500 });
            const links = (((d.query && d.query.pages) || [])[0] || {}).links || [];
            if (!links.length) return { notice: U.notice("この頁からは、どこにも行けなかった", "糸を切って、別の頁から。", [U.btn("糸を切る", () => { st.thread = null; threadCtl.set(null); dg.run(); }, "btn-dig")]) };
            const sample = U.shuffle(links.map((l) => l.title)).slice(0, 20);
            const pv = await pageviews(st.thread.lang, sample);
            if (stale()) return null;
            const r = loneliest(pv, lv, !!st.thread);
            const f = r && await firstGood(st.thread.lang, r, "「" + st.thread.title + "」の中のリンクを一本たどって来た。", stale);
            if (!f) return stale() ? null : { notice: U.notice("リンクの先に、読める頁がなかった", "糸を切って、別の頁から。", [U.btn("糸を切る", () => { st.thread = null; threadCtl.set(null); dg.run(); }, "btn-dig")]) };
            st.thread = { kind: "link", lang: st.thread.lang, title: f.title, label: "リンク", value: f.title };
            threadCtl.set(st.thread);
            return f;
          }
          if (st.thread && st.thread.kind === "cat") {
            const d = await api(st.thread.lang, { action: "query", prop: "categories", titles: st.thread.title, clshow: "!hidden", cllimit: 50 });
            const cats = (((d.query && d.query.pages) || [])[0] || {}).categories || [];
            if (!cats.length) return { notice: U.notice("この頁は、どの分類にも属していなかった", "", [U.btn("糸を切る", () => { st.thread = null; threadCtl.set(null); dg.run(); }, "btn-dig")]) };
            const cat = U.pick(cats).title;
            const pool = await categoryPool(st.thread.lang, cat, 0);
            const pv = await pageviews(st.thread.lang, U.shuffle(pool.filter((t) => t !== st.thread.title)).slice(0, 30));
            if (stale()) return null;
            const r = loneliest(pv, lv, !!st.thread);
            const f = r && await firstGood(st.thread.lang, r, "分類「" + cat.replace(/^Category:|^カテゴリ:/, "") + "」から。", stale);
            if (!f) return stale() ? null : { notice: U.notice("この分類には、ほかの頁がなかった", "", [U.btn("糸を切る", () => { st.thread = null; threadCtl.set(null); dg.run(); }, "btn-dig")]) };
            return f;
          }
          if (st.vein === "near") {
            if (!st.place) { showNearStart(); return null; }
            const d = await api("ja", { action: "query", list: "geosearch", gscoord: st.place.lat + "|" + st.place.lon, gsradius: 10000, gslimit: 100 });
            const titles = ((d.query && d.query.geosearch) || []).map((g) => g.title);
            if (!titles.length) return { notice: U.notice("近くに頁のある場所がなかった", "地名を変えて、もう一度。") };
            const pv = await pageviews("ja", U.shuffle(titles).slice(0, 60));
            if (stale()) return null;
            const r = loneliest(pv, lv, !!st.thread);
            if (!r && pv.size) return tooDeep("この辺りの頁");
            const f = r && await firstGood("ja", r, r.relaxed ? "この辺りには" + lv.label + "の頁がなかったので、それより少しよく読まれている頁を選んだ。" : "", stale);
            if (!f) return stale() ? null : { notice: U.notice("閲覧数が確かめられなかった", "少し待ってから、もう一度。", [U.btn("もう一度", () => dg.run(), "btn-dig")]) };
            return f;
          }
          if (st.vein === "topic") {
            const cat = "Category:" + (st.topic || U.pick(D.wikiTopics)[0]);
            const pool = await categoryPool("ja", cat, 2);
            if (stale()) return null;
            const pv = await pageviews("ja", U.shuffle(pool).slice(0, 40));
            if (stale()) return null;
            const r = loneliest(pv, lv, !!st.thread);
            if (!r && pv.size) return tooDeep("この分類から拾った頁");
            const f = r && await firstGood("ja", r, "分類「" + cat.replace("Category:", "") + "」の奥から。" + (r.relaxed ? lv.label + "の頁はなかったので、それより少しよく読まれている頁を選んだ。" : ""), stale);
            if (!f) return stale() ? null : { notice: U.notice("この分類には頁が見つからなかった", "もう一度掘ってみて。", [U.btn("もう一度", () => dg.run(), "btn-dig")]) };
            return f;
          }
          const lang = st.vein === "en" ? "en" : "ja";
          let best = null, seen = 0;
          for (let round = 0; round < 3; round++) {
            /* 曖昧さ回避の頁は最初から除いておく */
            const d = await api(lang, { action: "query", generator: "random", grnnamespace: 0, grnlimit: 20, prop: "pageprops", ppprop: "disambiguation" });
            const titles = ((d.query && d.query.pages) || []).filter((p) => !(p.pageprops && "disambiguation" in p.pageprops)).map((p) => p.title);
            const pv = await pageviews(lang, titles);
            if (stale()) return null;
            seen += pv.size;
            const r = loneliest(pv, lv, !!st.thread);
            if (r && !r.relaxed) {
              const f = await firstGood(lang, r, "", stale);
              if (stale()) return null;
              if (f) return f;
            }
            if (r && (!best || r.pick.n < best.list[0].n)) best = r;
          }
          if (!best && seen) return tooDeep("でたらめに拾った頁");
          const f = best && await firstGood(lang, best, best.relaxed ? lv.label + "の頁は見つからなかったので、拾った中でそれにいちばん近い、少しよく読まれている頁を選んだ。" : "", stale);
          return f || (stale() ? null : { notice: U.notice("読める頁が見つからなかった", "もう一度めくってみて。", [U.btn("もう一度", () => dg.run(), "btn-dig")]) });
        }
      });
      if (st.place) placeNote.textContent = st.place.name + " を中心に探す。";
      if (st.vein === "near" && !st.place) showNearStart(); else dg.run();
    }
  };
  U.room(def);
})();
