/* はじめに */
(function () {
  "use strict";
  const U = window.U;

  const PROMISES = [
    ["学習しない", "あなたの好みを記録して、次に見せるものを選ぶことはしない。"],
    ["少ない順に掘る", "人気順の逆。再生や閲覧の少ないものほど、深い層に眠っている。"],
    ["流れてこない", "自分で「次を掘る」を押したときだけ、一つずつ現れる。"],
    ["星もいいねもない", "残るのは、拾うときにあなたが書いた一行だけ。"],
    ["この中だけに残る", "標本箱はこのブラウザの中に保存され、どこにも送られない。"]
  ];

  U.room({
    id: "home", name: "はじめに",
    mount(el) {
      const hero = U.h("div", { class: "home-hero" },
        U.h("h1", { class: "home-title" }, "アルゴリズムの届かない深さまで、自分の手で掘る。"),
        U.h("p", { class: "home-lede" },
          "埋もれ木は、何もおすすめしない。あなたが決めるのは、どこを、どれくらい深く掘るかだけ。出てくるのは、再生や閲覧の少ないものから、でたらめに一つずつ。心が動いたら、その理由を自分の言葉で書いて標本箱に収める。"),
        U.h("div", { class: "home-actions" },
          U.btn("でたらめな部屋で掘りはじめる", () => U.randomRoom(), "btn-dig"),
          U.h("a", { class: "btn", href: "#cards" }, "今日の札を引く")));

      const promises = U.h("div", { class: "promises" }, PROMISES.map(([b, s]) => U.h("div", { class: "promise" }, U.h("b", null, b), U.h("span", null, s))));

      const strata = U.h("div", { class: "home-strata" });
      U.groups.forEach((g) => {
        const rooms = U.rooms.filter((r) => r.group === g);
        if (!rooms.length) return;
        strata.append(U.h("div", null,
          U.h("p", { class: "home-group-label" }, g),
          U.h("div", { class: "home-rooms" }, rooms.map((r) => U.h("a", { class: "home-room", href: "#" + r.id },
            U.h("span", { class: "stratum-lith", "data-lith": r.lith, "aria-hidden": "true" }),
            U.h("span", { class: "home-room-text" },
              U.h("span", { class: "home-room-name" }, r.name),
              U.h("span", { class: "home-room-desc" }, r.lede)))))));
      });

      const foot = U.h("p", { class: "home-foot" },
        "掘る相手：Internet Archive、Radio Browser、MusicBrainz と Cover Art Archive、Wikipedia、ジャパンサーチ、メトロポリタン美術館、クリーブランド美術館、Kagi Small Web。問い合わせはそれぞれに直接届き、送るのはでたらめに選んだ検索語だけ。キー操作：N で次を掘る、K で拾う。");

      el.append(hero, promises, strata, foot);
    }
  });
})();
