/* 埋もれ木 — 起動、目次、部屋の切り替え */
(function () {
  "use strict";
  const U = window.U;
  const GROUPS = ["聴く", "観る", "読む", "触れる", "残す"];
  const main = document.getElementById("main");
  const column = document.getElementById("column");
  const sections = new Map();
  let active = null;

  U.groups = GROUPS;

  function buildNav() {
    GROUPS.forEach((g) => {
      const rooms = U.rooms.filter((r) => r.group === g);
      if (!rooms.length) return;
      const grp = U.h("div", { class: "strata-group", role: "group", "aria-label": g }, U.h("p", { class: "strata-label" }, g));
      rooms.forEach((r) => grp.append(U.h("a", { class: "stratum", href: "#" + r.id, "data-room": r.id },
        U.h("span", { class: "stratum-lith", "data-lith": r.lith, "aria-hidden": "true" }),
        U.h("span", { class: "stratum-text" },
          U.h("span", { class: "stratum-name" }, r.name, r.id === "box" ? U.h("span", { class: "stratum-count", id: "nav-box-count" }) : null),
          U.h("span", { class: "stratum-desc" }, r.short)))));
      column.append(grp);
    });
    column.append(U.h("p", { class: "column-foot" }, "縞模様は地質図の凡例から。部屋ごとに、違う地層を掘る。"));
  }

  function show(def) {
    if (active === def.id) return;
    if (active) {
      const cur = sections.get(active);
      cur.el.hidden = true;
      if (cur.def.onHide) cur.def.onHide();
    }
    let s = sections.get(def.id);
    if (!s) {
      s = { def, el: U.h("section", { class: "room", "data-room": def.id, "aria-label": def.name }), mounted: false };
      main.append(s.el);
      sections.set(def.id, s);
    }
    s.el.hidden = false;
    active = def.id;
    if (!s.mounted) {
      s.mounted = true;
      try { def.mount(s.el); } catch (e) { console.error(e); s.el.append(U.notice("この部屋を開けなかった", String(e && e.message || e))); }
    }
    if (def.onShow) def.onShow();
    U.$$(".stratum", column).forEach((a) => {
      if (a.dataset.room === def.id) {
        a.setAttribute("aria-current", "page");
        if (window.matchMedia("(max-width: 900px)").matches) a.scrollIntoView({ block: "nearest", inline: "center" });
      } else a.removeAttribute("aria-current");
    });
    document.title = def.id === "home" ? "埋もれ木" : def.name + "｜埋もれ木";
    window.scrollTo(0, 0);
  }

  function route() {
    const id = decodeURIComponent((location.hash || "").replace(/^#/, "")) || "home";
    const def = U.rooms.find((r) => r.id === id) || U.rooms.find((r) => r.id === "home");
    show(def);
  }
  U.go = (id) => { if (location.hash === "#" + id) route(); else location.hash = "#" + id; };
  U.randomRoom = () => {
    const pool = U.rooms.filter((r) => r.group && r.id !== "box");
    U.go(U.pick(pool).id);
  };

  /* キー操作：N で次を掘る、K で拾う */
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const t = e.target;
    if (t && t.closest && t.closest("input, textarea, select, [contenteditable='true']")) return;
    const s = sections.get(active);
    if (!s || !s.def.digger) return;
    const dg = s.def.digger();
    if (!dg) return;
    if (e.key === "n" || e.key === "N") { e.preventDefault(); dg.run(); }
    else if (e.key === "k" || e.key === "K") { e.preventDefault(); dg.keep(); }
  });

  /* 「本文へ」：部屋の切り替えは # で行うので、# を書き換えずに本文へ焦点だけ移す */
  document.getElementById("skip-link").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("main").focus();
  });

  /* 明るさ */
  const themeBtn = document.getElementById("theme-btn");
  const darkMQ = window.matchMedia("(prefers-color-scheme: dark)");
  const currentTheme = () => document.documentElement.getAttribute("data-theme") || (darkMQ.matches ? "dark" : "light");
  function renderTheme() {
    const dark = currentTheme() === "dark";
    themeBtn.textContent = dark ? "地表へ" : "地中へ";
    themeBtn.title = dark ? "明るい表示にする" : "暗い表示にする";
    themeBtn.setAttribute("aria-label", themeBtn.title);
  }
  themeBtn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    U.store.set("theme", next);
    renderTheme();
  });
  if (darkMQ.addEventListener) darkMQ.addEventListener("change", renderTheme);

  /* 標本の数 */
  function renderCount() {
    const n = U.box.count();
    document.getElementById("box-count").textContent = n;
    const nb = document.getElementById("nav-box-count");
    if (nb) nb.textContent = n ? "  " + n : "";
  }
  U.on("box", renderCount);

  buildNav();
  renderTheme();
  renderCount();
  window.addEventListener("hashchange", route);
  route();
})();
