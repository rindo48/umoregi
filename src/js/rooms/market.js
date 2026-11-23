/* 市 — ありそうでない品を組み立てて、実在の市で探す */
(function () {
  "use strict";
  const U = window.U;
  const D = window.UMO_DATA;

  const MARKETS = [
    { name: "メルカリ", how: "新しく出品された順", url: (q) => "https://jp.mercari.com/search?keyword=" + encodeURIComponent(q) + "&sort=created_time&order=desc" },
    { name: "ヤフオク!", how: "新着順", url: (q) => "https://auctions.yahoo.co.jp/search/search?p=" + encodeURIComponent(q) + "&s1=new&o1=d" },
    { name: "Yahoo!フリマ", how: "新しく出品された順", url: (q) => "https://paypayfleamarket.yahoo.co.jp/search/" + encodeURIComponent(q) + "?sort=openTime&order=desc" },
    { name: "minne", how: "手作りの品", url: (q) => "https://minne.com/category/saleonly?q=" + encodeURIComponent(q) },
    { name: "Creema", how: "手作りの品", url: (q) => "https://www.creema.jp/listing?q=" + encodeURIComponent(q) },
    { name: "BOOTH", how: "個人の作り手・新着順", url: (q) => "https://booth.pm/ja/search/" + encodeURIComponent(q) + "?sort=new" }
  ];

  let api = null;
  const def = {
    id: "market", name: "市", group: "触れる", lith: "clay",
    short: "架空の品を実在の市で",
    title: "ありそうでない品を、実在の市で探す",
    lede: "素材と品物をでたらめに組み合わせた「ありそうでない品」を、手作りや中古の市で探す。新着順に並べれば、評判がつく前の品に出会える。",
    digger: () => api,
    mount(el) {
      const st = { q: null, m: null, o: null, lock: { q: false, m: false, o: false }, useQ: false };
      el.append(U.roomHead(def));

      const nameEl = U.h("p", { class: "item-name", "aria-live": "polite" });
      const linksEl = U.h("div", { class: "market-grid" });
      const queryEl = U.h("p", { class: "dice-note" });
      const useQ = U.h("input", { type: "checkbox", id: "market-useq" });
      useQ.addEventListener("change", () => { st.useQ = useQ.checked; render(); });

      function wordBtn(slot, text, cls) {
        return U.h("button", { type: "button", class: "word " + (cls || ""), "aria-pressed": String(st.lock[slot]), title: st.lock[slot] ? "固定を外す" : "この言葉を固定する",
          on: { click: () => { st.lock[slot] = !st.lock[slot]; render(); } } }, text);
      }
      function query() {
        const parts = [];
        if (st.useQ && st.q) parts.push(st.q.replace(/の$/, ""));
        parts.push(st.m, st.o);
        return parts.join(" ");
      }
      function render() {
        U.clear(nameEl);
        if (st.q) nameEl.append(wordBtn("q", st.q));
        nameEl.append(wordBtn("m", st.m), U.h("span", { class: "word-no" }, "の"), wordBtn("o", st.o));
        const q = query();
        queryEl.textContent = "検索する言葉：「" + q + "」。言葉を押すと固定され、振り直しても変わらない。";
        U.clear(linksEl);
        MARKETS.forEach((m) => linksEl.append(U.h("a", { class: "market-link", href: m.url(q), target: "_blank", rel: "noopener noreferrer" },
          U.h("span", null, m.name, U.h("span", { class: "sr-only" }, "（新しいタブで開く）")), U.h("small", null, m.how))));
      }
      function roll() {
        if (!st.lock.q) st.q = Math.random() < 0.6 ? U.pick(D.marketQualifiers) : null;
        if (!st.lock.m) st.m = U.pick(D.marketMaterials);
        if (!st.lock.o) st.o = U.pick(D.marketObjects);
        render();
      }

      el.append(
        U.h("div", { class: "dice-box" },
          U.h("p", { class: "eyebrow" }, "今日の品"),
          nameEl, queryEl,
          U.h("div", { class: "dice-row" },
            U.btn("振り直す", roll, "btn-dig"),
            U.h("label", { class: "field-row", for: "market-useq" }, useQ, "形容の言葉も検索に入れる"))),
        U.h("h2", { class: "section-title" }, "市へ探しに行く"),
        U.h("p", { class: "section-lede" }, "どの市でも、並べ方は「新しい順」か、そもそも評判で並べない場所を選んである。ぴったりの品が無くても、近いものの中に思いがけない一点がある。"),
        linksEl,
        U.h("p", { class: "room-note" }, "手に入れたもの、気になったものは標本箱に書き留められる。", " ",
          U.h("button", { type: "button", class: "link-btn", on: { click: () => U.openManual && U.openManual({ room: "market", title: (st.q || "") + st.m + "の" + st.o }) } }, "いま書き留める")));

      /* ---------- 伝統工芸の札 ---------- */
      const craftStage = U.h("div", { class: "dig-site" });
      const craftTrail = U.h("div");
      el.append(
        U.h("h2", { class: "section-title" }, "知らない工芸を一つ"),
        U.h("p", { class: "section-lede" }, "日本の伝統工芸品の中から、でたらめに一つ。作り手を探せば、量販店には並ばない品に手が届く。"),
        craftStage, craftTrail);
      const craftDg = U.digger({
        room: "market", stage: craftStage, trailHost: craftTrail,
        loadingText: () => "工房の戸を叩いています…",
        renderFind: (find, a) => U.findCard(find, { onNext: () => a.run(), nextLabel: "別の工芸" }),
        dig: async (arg, stale) => {
          if (!U.wiki) throw new Error("Wikipedia の道具が読み込まれていない");
          const pool = await U.wiki.categoryPool("ja", "Category:日本の伝統工芸品", 1);
          if (stale()) return null;
          const candidates = pool.filter((t) => !/一覧|伝統的工芸品$|^伝統工芸/.test(t));
          const title = U.pick(candidates.length ? candidates : pool);
          const s = await U.wiki.summary("ja", title);
          if (stale()) return null;
          const name = s.title || title;
          return {
            id: "craft:" + name, room: "market",
            kicker: ["伝統工芸", s.description].filter(Boolean).join("／"),
            title: name,
            image: s.thumbnail && s.thumbnail.source ? s.thumbnail.source : "",
            desc: s.extract || "",
            links: [
              { label: "minne で作り手を探す", url: "https://minne.com/category/saleonly?q=" + encodeURIComponent(name) },
              { label: "Creema で探す", url: "https://www.creema.jp/listing?q=" + encodeURIComponent(name) },
              { label: "メルカリ（新しい順）", url: "https://jp.mercari.com/search?keyword=" + encodeURIComponent(name) + "&sort=created_time&order=desc" }
            ],
            url: (s.content_urls && s.content_urls.desktop && s.content_urls.desktop.page) || "https://ja.wikipedia.org/wiki/" + encodeURIComponent(name),
            urlLabel: "Wikipedia で読む"
          };
        }
      });

      api = { run: roll, keep: () => craftDg.keep() };
      roll();
      craftDg.run();
    }
  };
  U.room(def);
})();
