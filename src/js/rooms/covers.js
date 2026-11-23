/* ジャケ — 名前も評判も伏せたジャケットから、一枚を選ぶ */
(function () {
  "use strict";
  const U = window.U;
  const MB = "https://musicbrainz.org/ws/2/";
  const CAA = "https://coverartarchive.org/";

  /* MusicBrainz は1秒に1回まで。順番待ちの列をつくる */
  let chain = Promise.resolve(), last = 0;
  function mb(path) {
    const run = async () => {
      const wait = Math.max(0, last + 1150 - Date.now());
      if (wait) await U.sleep(wait);
      last = Date.now();
      return U.fetchJSON(MB + path + (path.includes("?") ? "&" : "?") + "fmt=json", { source: "MusicBrainz", retries: 3, retryDelay: 1800, timeout: 20000 });
    };
    const p = chain.then(run, run);
    chain = p.catch(() => {});
    return p;
  }

  const DECADES = [["", "でたらめ"], ["1950", "1950年代"], ["1960", "1960年代"], ["1970", "1970年代"], ["1980", "1980年代"], ["1990", "1990年代"], ["2000", "2000年代"], ["2010", "2010年代"]];
  const COUNTRIES = ["JP", "US", "GB", "DE", "FR", "IT", "ES", "PT", "NL", "BE", "SE", "FI", "PL", "CZ", "HU", "GR", "TR", "IR", "EG", "NG", "GH", "SN", "ET", "ZA", "IN", "ID", "TH", "PH", "KR", "TW", "HK", "BR", "AR", "MX", "CO", "PE", "CU", "JM", "CA", "AU"];
  const FORMATS = [["", "でたらめ"], ["vinyl", "レコード"], ["cassette", "カセット"], ["cd", "CD"]];

  function loadImage(url, timeout) {
    return new Promise((resolve) => {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; img.src = ""; resolve(null); } }, timeout || 9000);
      img.onload = () => { if (done) return; done = true; clearTimeout(t); resolve(img.naturalWidth > 20 ? url : null); };
      img.onerror = () => { if (done) return; done = true; clearTimeout(t); resolve(null); };
      img.src = url;
    });
  }
  async function coverOf(r) {
    const a = await loadImage(CAA + "release/" + r.id + "/front-250");
    if (a) return { thumb: a, big: CAA + "release/" + r.id + "/front-500" };
    if (r["release-group"] && r["release-group"].id) {
      const b = await loadImage(CAA + "release-group/" + r["release-group"].id + "/front-250");
      if (b) return { thumb: b, big: CAA + "release-group/" + r["release-group"].id + "/front-500" };
    }
    return null;
  }
  /* 並列に試し、want 枚そろったら打ち切る */
  async function collectCovers(releases, want, stale, onFound) {
    const found = [];
    let i = 0;
    async function worker() {
      while (i < releases.length && found.length < want && !stale()) {
        const r = releases[i++];
        const c = await coverOf(r);
        if (c && found.length < want && !stale()) { found.push({ r, c }); onFound(found.length); }
      }
    }
    await Promise.all(Array.from({ length: 8 }, worker));
    return found;
  }

  const artistOf = (r) => (r["artist-credit"] || []).map((a) => (a.name || (a.artist && a.artist.name) || "") + (a.joinphrase || "")).join("").trim();

  let api = null;
  const def = {
    id: "covers", name: "ジャケ", group: "聴く", lith: "lime",
    short: "名前を伏せた盤を選ぶ",
    title: "ジャケットだけで選ぶ",
    lede: "名前も評判も伏せたレコードやカセットのジャケットが並ぶ。目に留まった一枚を選んでから、正体を知る。",
    digger: () => api,
    mount(el) {
      const st = {
        decade: U.prefs.get("covers", "decade", ""),
        country: U.prefs.get("covers", "country", ""),
        format: U.prefs.get("covers", "format", ""),
        thread: null, crate: [], chosen: null
      };
      el.append(U.roomHead(def));

      const decadeSel = U.h("select", { class: "select", id: "covers-decade", "aria-label": "年代" }, DECADES.map(([v, l]) => U.h("option", { value: v, selected: v === st.decade }, l)));
      const countrySel = U.h("select", { class: "select", id: "covers-country", "aria-label": "国" },
        U.h("option", { value: "", selected: !st.country }, "でたらめ"),
        COUNTRIES.map((c) => U.h("option", { value: c, selected: c === st.country }, U.region(c))));
      const formatSel = U.h("select", { class: "select", id: "covers-format", "aria-label": "形" }, FORMATS.map(([v, l]) => U.h("option", { value: v, selected: v === st.format }, l)));
      const onSel = () => {
        st.decade = decadeSel.value; st.country = countrySel.value; st.format = formatSel.value;
        U.prefs.set("covers", "decade", st.decade); U.prefs.set("covers", "country", st.country); U.prefs.set("covers", "format", st.format);
      };
      [decadeSel, countrySel, formatSel].forEach((s) => s.addEventListener("change", onSel));
      const threadCtl = U.threadControl(() => { st.thread = null; threadCtl.set(null); api.run(); });
      const controls = U.h("div", { class: "controls" },
        U.h("div", { class: "control" }, U.h("span", { class: "label-cap" }, "箱"),
          U.h("div", { class: "control-body" },
            U.h("div", { class: "field-row" },
              U.h("label", { for: "covers-decade" }, "年代"), decadeSel,
              U.h("label", { for: "covers-country" }, "国"), countrySel,
              U.h("label", { for: "covers-format" }, "形"), formatSel,
              U.btn("箱を替える", () => api.run(), "btn-dig")),
            U.h("p", { class: "vein-note" }, "MusicBrainz に記録された世界中の盤から、条件に合うものをでたらめに並べる。人気も売上も関係ない。"))),
        threadCtl);
      const msg = U.h("p", { class: "crate-msg", "aria-live": "polite" });
      const crate = U.h("div", { class: "crate" });
      const reveal = U.h("div", { class: "reveal" });
      el.append(controls, msg, crate, reveal);

      let token = 0;
      function buildQuery() {
        if (st.thread) return st.thread.q;
        const parts = [];
        /* 検索は先頭500件までしかめくれないので、年を一年に絞って棚を小さくする */
        const dec = st.decade || U.pick(DECADES.slice(1))[0];
        parts.push("date:" + (Number(dec) + U.rand(10)));
        const cc = st.country || U.pick(COUNTRIES);
        parts.push("country:" + cc);
        if (st.format) parts.push("format:" + st.format);
        return parts.join(" AND ");
      }
      function describe(q) {
        if (st.thread) return st.thread.label + "：" + st.thread.value;
        const y = (q.match(/date:\[?(\d{4})/) || [])[1];
        const c = (q.match(/country:(\w+)/) || [])[1];
        const f = (q.match(/format:(\w+)/) || [])[1];
        return [c ? U.region(c) : "", y ? y + "年" : "", f ? (FORMATS.find((x) => x[0] === f) || ["", f])[1] : ""].filter(Boolean).join("・");
      }

      async function run() {
        const my = ++token;
        const stale = () => my !== token;
        st.chosen = null;
        U.clear(crate); U.clear(reveal);
        crate.append(U.digging("箱を探しています…"));
        msg.textContent = "";
        try {
          let releases = [], label = "";
          for (let attempt = 0; attempt < 4 && releases.length < 12; attempt++) {
            const q = buildQuery();
            label = describe(q);
            msg.textContent = label + " の棚を探しています…";
            const head = await mb("release/?query=" + encodeURIComponent(q) + "&limit=100&offset=0");
            if (stale()) return;
            const count = head.count || 0;
            if (count < 6 && !st.thread) continue;
            let list = head.releases || [];
            if (count > 100) {
              const off = U.rand(Math.min(count, 500) - 100 + 1);
              const page = await mb("release/?query=" + encodeURIComponent(q) + "&limit=100&offset=" + off);
              if (stale()) return;
              list = page.releases || list;
            }
            releases = U.shuffle(list);
            if (st.thread) break;
          }
          if (!releases.length) {
            U.clear(crate).append(U.notice("この棚は空っぽだった", "条件を少しゆるめて、もう一度。", [U.btn("箱を替える", () => api.run(), "btn-dig")]));
            msg.textContent = "";
            return;
          }
          msg.textContent = label + " の棚から、ジャケットのある盤を拾い出しています…";
          U.clear(crate);
          const found = await collectCovers(releases, 12, stale, (n) => { msg.textContent = label + " の棚から " + n + " 枚"; });
          if (stale()) return;
          if (!found.length) {
            U.clear(crate).append(U.notice("ジャケットの写真が一枚もなかった", "写真の残っていない盤ばかりの棚だった。箱を替えてみて。", [U.btn("箱を替える", () => api.run(), "btn-dig")]));
            msg.textContent = "";
            return;
          }
          st.crate = found;
          msg.textContent = label + " の棚から " + found.length + " 枚。名前は伏せてある。気になった一枚を選んで。";
          found.forEach(({ r, c }, i) => {
            const b = U.h("button", { type: "button", class: "sleeve", "aria-label": "ジャケット " + (i + 1) + " を選ぶ", on: { click: () => choose(i) } },
              U.h("img", { src: c.thumb, alt: "", referrerpolicy: "no-referrer" }));
            crate.append(b);
          });
        } catch (e) {
          if (stale()) return;
          console.error(e);
          msg.textContent = "";
          U.clear(crate).append(U.notice("箱を開けられなかった", U.errorText(e), [U.btn("もう一度", () => api.run(), "btn-dig")]));
        }
      }

      function choose(i) {
        const { r, c } = st.crate[i];
        st.chosen = i;
        U.$$(".sleeve", crate).forEach((b, j) => { b.classList.toggle("is-dim", j !== i); b.classList.toggle("is-chosen", j === i); });
        const artist = artistOf(r);
        const media = r.media || [];
        const fmt = Array.from(new Set(media.map((m) => m.format).filter(Boolean))).join("、");
        const tracks = media.reduce((n, m) => n + (m["track-count"] || 0), 0);
        const li = (r["label-info"] || []).find((x) => x.label) || (r["label-info"] || [])[0] || null;
        const labelName = li && li.label ? li.label.name : "";
        const rg = r["release-group"] || {};
        const q = (artist + " " + r.title).trim();
        const threads = [];
        const art = (r["artist-credit"] || [])[0];
        if (art && art.artist && art.artist.id && !/various artists/i.test(art.artist.name)) threads.push({ label: "同じアーティストの別の盤", value: art.artist.name, run: () => follow({ label: "アーティスト", value: art.artist.name, q: "arid:" + art.artist.id }) });
        if (li && li.label && li.label.id) threads.push({ label: "同じレーベルの別の盤", value: labelName, run: () => follow({ label: "レーベル", value: labelName, q: "laid:" + li.label.id }) });
        if (r.date && r.country) threads.push({ label: "同じ年・同じ国の箱", value: r.date.slice(0, 4) + "年 " + U.region(r.country), run: () => follow({ label: "年と国", value: r.date.slice(0, 4) + "年 " + U.region(r.country), q: "date:" + r.date.slice(0, 4) + " AND country:" + r.country }) });
        const find = {
          id: "mb:" + r.id, room: "covers",
          kicker: [U.region(r.country), (r.date || "").slice(0, 4), fmt].filter(Boolean).join("／"),
          title: r.title, sub: artist,
          image: c.thumb,
          media: U.h("img", { src: c.big, alt: r.title + " のジャケット", referrerpolicy: "no-referrer", on: { error: (e) => { e.target.src = c.thumb; } } }),
          meta: [["発売", r.date], ["国", U.region(r.country)], ["レーベル", labelName + (li && li["catalog-number"] ? "（" + li["catalog-number"] + "）" : "")], ["形", fmt], ["曲数", tracks ? tracks + "曲" : ""], ["種類", [rg["primary-type"], ...(rg["secondary-types"] || [])].filter(Boolean).join(" / ")], ["状態", r.status]],
          desc: "",
          extra: U.h("p", { class: "room-note" }, "選んだ理由は、ジャケットだけ。聴いてみて、思っていた音と同じだったか確かめてみて。"),
          links: [
            { label: "YouTubeで聴く", url: "https://www.youtube.com/results?search_query=" + encodeURIComponent(q) },
            { label: "Bandcamp", url: "https://bandcamp.com/search?q=" + encodeURIComponent(q) },
            { label: "Discogs", url: "https://www.discogs.com/search/?type=all&q=" + encodeURIComponent(q) },
            { label: "Spotify", url: "https://open.spotify.com/search/" + encodeURIComponent(q) },
            { label: "Apple Music", url: "https://music.apple.com/jp/search?term=" + encodeURIComponent(q) },
            { label: "ニコニコ", url: "https://www.nicovideo.jp/search/" + encodeURIComponent(q) }
          ],
          url: "https://musicbrainz.org/release/" + r.id, urlLabel: "MusicBrainz で見る",
          threads
        };
        st.current = find;
        U.clear(reveal);
        const card = U.findCard(find, { onNext: () => api.run(), nextLabel: "箱を替える" });
        reveal.append(card);
        api.cardEl = card;
        reveal.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      }
      function follow(thread) { st.thread = thread; threadCtl.set(thread); api.run(); }

      api = { run, keep: () => { if (api.cardEl && api.cardEl.openKeep) api.cardEl.openKeep(); }, cardEl: null };
      run();
    }
  };
  U.room(def);
})();
