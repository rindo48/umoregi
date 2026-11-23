/* 札 — 画面の外で掘るための札と、漂流 */
(function () {
  "use strict";
  const U = window.U;
  const D = window.UMO_DATA;

  U.todayCard = () => {
    const rnd = U.seeded(U.todaySeed());
    return D.cards[Math.floor(rnd() * D.cards.length)];
  };
  const todayText = () => { const d = new Date(); return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日"; };

  function makeWalk() {
    const W = D.walk;
    const dir = U.pick(W.dirs);
    const steps = [U.pick(W.starts).replace("{dir}", dir)];
    const order = [W.moves, W.looks, W.moves, W.acts, W.moves, W.looks, W.moves];
    const n = U.randInt(5, 7);
    const used = new Set(steps);
    for (let i = 0; i < n; i++) {
      const pool = order[i % order.length].filter((s) => !used.has(s));
      const s = U.pick(pool.length ? pool : order[i % order.length]);
      used.add(s);
      steps.push(s);
    }
    steps.push(...W.ends);
    return { steps, minutes: U.pick([30, 45, 60, 90]) };
  }

  let api = null;
  const def = {
    id: "cards", name: "札", group: "触れる", lith: "ash",
    short: "画面の外で掘る",
    title: "発見の札",
    lede: "画面の外で掘るための札。一日に一枚、決まった札が出る。気が向かなければ引き直してもいい。",
    digger: () => api,
    mount(el) {
      el.append(U.roomHead(def));
      const stage = U.h("div", { class: "card-stage" });
      const fudaHost = U.h("div");
      const side = U.h("div", { class: "walk" });
      stage.append(fudaHost, side);
      el.append(stage);
      let current = null;

      function showCard(card, isToday) {
        current = card;
        U.clear(fudaHost).append(U.h("article", { class: "fuda", "aria-label": "札：" + card.t },
          U.h("p", { class: "fuda-k" }, "札 ／ " + card.k),
          U.h("h2", { class: "fuda-t" }, card.t),
          U.h("div", null,
            U.h("p", { class: "fuda-b" }, card.b),
            U.h("p", { class: "fuda-date" }, isToday ? todayText() + "の札" : "引き直した札"))));
      }
      function draw() {
        let c;
        do { c = U.pick(D.cards); } while (current && c.t === current.t);
        showCard(c, false);
      }
      showCard(U.todayCard(), true);
      side.append(
        U.h("p", { class: "room-lede" }, "札に書いてあることを、今日か、今週のうちにやってみる。何を見つけたかは誰にも見せなくていい。残したくなったら、標本箱に書き留める。"),
        U.h("div", { class: "dice-row" },
          U.btn("もう一枚引く", draw, "btn-dig"),
          U.btn("この札で見つけたものを書き留める", () => U.openManual && U.openManual({ room: "cards", title: current ? current.t + "で見つけたもの" : "" }), "btn-keep")),
        U.h("p", { class: "room-note" }, "今日の札は日付で決まる。明日になれば、別の札が出る。"));

      /* ---------- 漂流 ---------- */
      const walkBox = U.h("div", { class: "walk" });
      el.append(
        U.h("h2", { class: "section-title" }, "漂流"),
        U.h("p", { class: "section-lede" }, "行き先を決めずに歩くための手順書。地図アプリは閉じて、一つずつ従う。手順と手順のあいだは、気が済むまで歩いていい。"),
        walkBox);
      let walk = null, idx = -1;
      function renderWalk() {
        U.clear(walkBox);
        if (!walk) {
          walkBox.append(U.h("div", { class: "start-panel" },
            U.h("p", null, "所要はおよそ30分から90分。歩きやすい靴で。"),
            U.btn("漂流をはじめる", () => { walk = makeWalk(); idx = 0; renderWalk(); }, "btn-dig")));
          return;
        }
        const ol = U.h("ol", { class: "walk-steps" }, walk.steps.map((s, i) => U.h("li", { class: i < idx ? "is-done" : i === idx ? "is-now" : "" }, s)));
        const done = idx >= walk.steps.length - 1;
        walkBox.append(
          U.h("p", { class: "dice-note" }, "目安はおよそ" + walk.minutes + "分。" + (idx >= 0 ? (idx + 1) + " / " + walk.steps.length + " 番目の手順。" : "")),
          ol,
          U.h("div", { class: "dice-row" },
            done ? U.btn("見つけたものを書き留める", () => U.openManual && U.openManual({ room: "cards", title: "漂流で見つけたもの" }), "btn-keep")
              : U.btn("次の手順へ", () => { idx++; renderWalk(); }, "btn-dig"),
            U.btn("別の漂流にする", () => { walk = makeWalk(); idx = 0; renderWalk(); })));
      }
      renderWalk();
      api = { run: draw, keep: () => U.openManual && U.openManual({ room: "cards", title: current ? current.t + "で見つけたもの" : "" }) };
    }
  };
  U.room(def);
})();
