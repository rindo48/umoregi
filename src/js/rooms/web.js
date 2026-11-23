/* 片隅 — 誰かが自分のために作ったウェブへ、でたらめに漂着する */
(function () {
  "use strict";
  const U = window.U;
  const LIST_URL = "https://raw.githubusercontent.com/kagisearch/smallweb/main/smallweb.txt";
  let feeds = null;

  async function loadFeeds() {
    if (feeds) return feeds;
    const txt = await U.fetchJSON(LIST_URL, { as: "text", source: "Kagi Small Web の名簿", retries: 1, timeout: 30000 });
    feeds = txt.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
    return feeds;
  }
  /* フィードの住所から、その人のホームページらしき住所を推し量る */
  function homeOf(feed) {
    try {
      const u = new URL(feed);
      let p = u.pathname
        .replace(/\/[^/]*\.(xml|rss|atom|json|php)$/i, "/")
        .replace(/\/(feed|rss|atom)(\/(atom|rss2?|feed))?\/?$/i, "/");
      if (!p.endsWith("/")) p += "/";
      if (p.split("/").filter(Boolean).length > 2) p = "/";
      return { host: u.hostname.replace(/^www\./, ""), url: u.origin + p, path: p };
    } catch (e) { return null; }
  }

  const PORTALS = [
    { name: "Wiby の「サプライズ」", desc: "1990年代の手作りホームページのような、軽くて素朴なページへ飛ばしてくれる検索エンジン。", url: "https://wiby.me/surprise/" },
    { name: "Marginalia の「でたらめ探索」", desc: "広告や SEO から遠い、文章中心の小さなサイトを画像つきで並べる。", url: "https://marginalia-search.com/explore/random" },
    { name: "IndieWeb ウェブリング", desc: "自分のドメインで暮らす人たちの輪。押すたびに誰かの家の玄関へ。", url: "https://xn--sr8hvo.ws/random" },
    { name: "Neocities", desc: "個人が手で作ったサイトの棚。でたらめな順に並べてある。", url: "https://neocities.org/browse?sort_by=random" },
    { name: "Kagi Small Web", desc: "個人ブログの新しい記事を、一つずつでたらめに見せる。", url: "https://kagi.com/smallweb" }
  ];

  let api = null;
  const def = {
    id: "web", name: "片隅", group: "読む", lith: "coal",
    short: "誰かの個人サイトへ漂着",
    title: "ウェブの片隅",
    lede: "誰かが自分のために書いているブログや、手作りのホームページへ、でたらめに漂着する。検索の上位にも、おすすめ欄にも出てこない場所。",
    digger: () => api,
    mount(el) {
      el.append(U.roomHead(def));
      const stage = U.h("div", { class: "dig-site" });
      const trailHost = U.h("div");
      el.append(stage, trailHost);

      const dg = U.digger({
        room: "web", stage, trailHost,
        loadingText: () => (feeds ? "漂っています…" : "四万あまりの個人ブログの名簿を広げています…"),
        renderFind: (find, a) => {
          const card = U.findCard(find, { onNext: () => a.run(), nextLabel: "また漂う" });
          return card;
        },
        dig: async (arg, stale) => {
          const list = await loadFeeds();
          if (stale()) return null;
          let h = null;
          for (let i = 0; i < 6 && !h; i++) h = homeOf(U.pick(list));
          if (!h) return null;
          const n = list.length;
          return {
            id: "web:" + h.url, room: "web",
            kicker: U.num(n) + " の個人ブログのうちの一つ",
            title: h.host,
            sub: h.path !== "/" ? h.path : "",
            media: null,
            desc: "どんな人が何を書いているのかは、まだわからない。開いてみるまで、ここには何も表示しない。",
            extra: U.h("p", { class: "room-note" }, "名簿は Kagi Small Web が集めている、広告のない個人サイトの一覧。多くは英語。"),
            url: h.url, urlLabel: "訪ねる"
          };
        }
      });
      api = dg;

      el.append(
        U.h("h2", { class: "section-title" }, "ほかの漂着口"),
        U.h("p", { class: "section-lede" }, "押すたびに、行き先が変わる入口。どこに着くかは誰にも決められていない。"),
        U.h("div", { class: "portal-list" }, PORTALS.map((p) => U.h("a", { class: "portal", href: p.url, target: "_blank", rel: "noopener noreferrer" },
          U.h("span", { class: "portal-name" }, p.name, U.h("span", { class: "sr-only" }, "（新しいタブで開く）")),
          U.h("span", { class: "portal-desc" }, p.desc)))),
        U.h("p", { class: "room-note" }, "気に入ったページは、標本箱の「外で見つけたものを書き留める」から残せる。", " ",
          U.h("button", { type: "button", class: "link-btn", on: { click: () => U.openManual && U.openManual({ room: "web" }) } }, "いま書き留める")));
      dg.run();
    }
  };
  U.room(def);
})();
