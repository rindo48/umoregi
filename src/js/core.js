/* 埋もれ木 — 共通の道具。部屋（rooms/*.js）はここにある部品を組み合わせて作る。 */
(function () {
  "use strict";
  const U = (window.U = {});

  /* ---------- DOM ---------- */
  U.h = function (tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
        else if (k === "style" && typeof v === "object") {
          for (const [sk, sv] of Object.entries(v)) {
            if (sk.startsWith("--")) el.style.setProperty(sk, sv);
            else el.style[sk] = sv;
          }
        } else if (k === "value" || k === "checked" || k === "hidden" || k === "disabled" || k === "selected") el[k] = v;
        else el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };
  U.clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };
  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------- 偶然 ---------- */
  U.rand = (n) => Math.floor(Math.random() * n);
  U.randInt = (a, b) => a + U.rand(b - a + 1);
  U.pick = (a) => a[U.rand(a.length)];
  U.shuffle = (a) => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = U.rand(i + 1); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  };
  U.seeded = (seed) => {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.todaySeed = () => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };

  /* ---------- 通信 ---------- */
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  class NetError extends Error {
    constructor(message, status, source) { super(message); this.status = status; this.source = source; }
  }
  U.NetError = NetError;
  const RETRYABLE = [0, 429, 500, 502, 503, 504];
  U.fetchJSON = async function (url, opt) {
    const o = Object.assign({ timeout: 16000, retries: 1, retryDelay: 1400, source: "", as: "json" }, opt || {});
    let lastErr = null;
    for (let i = 0; i <= o.retries; i++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), o.timeout);
      try {
        const res = await fetch(url, { signal: ctl.signal, headers: o.headers, cache: o.cache || "default" });
        clearTimeout(timer);
        if (!res.ok) throw new NetError("HTTP " + res.status, res.status, o.source);
        return o.as === "text" ? await res.text() : await res.json();
      } catch (e) {
        clearTimeout(timer);
        lastErr = e instanceof NetError ? e : new NetError(e.name === "AbortError" ? "timeout" : (e.message || "network"), 0, o.source);
        if (i < o.retries && RETRYABLE.includes(lastErr.status)) { await U.sleep(o.retryDelay * (i + 1)); continue; }
        throw lastErr;
      }
    }
    throw lastErr;
  };
  /* 配列は key[]=a&key[]=b のように繰り返す */
  U.query = (params) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v == null || v === "") continue;
      if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
      else sp.append(k, v);
    }
    return sp.toString();
  };

  /* ---------- 保存（このブラウザの中だけ） ---------- */
  const NS = "umoregi.";
  U.store = {
    get(k, d) { try { const v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  U.prefs = {
    get(room, key, d) { const p = U.store.get("prefs", {}); return p[room] && key in p[room] ? p[room][key] : d; },
    set(room, key, v) { const p = U.store.get("prefs", {}); (p[room] = p[room] || {})[key] = v; U.store.set("prefs", p); }
  };

  /* ---------- 出来事 ---------- */
  const bus = new Map();
  U.on = (ev, fn) => { if (!bus.has(ev)) bus.set(ev, new Set()); bus.get(ev).add(fn); return () => bus.get(ev).delete(fn); };
  U.emit = (ev, data) => { (bus.get(ev) || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); };

  /* ---------- 標本箱 ---------- */
  const BOX_KEY = "box.v1";
  let box = U.store.get(BOX_KEY, []);
  if (!Array.isArray(box)) box = [];
  function saveBox() {
    const ok = U.store.set(BOX_KEY, box);
    U.emit("box", box);
    if (!ok) U.toast("このブラウザには保存できなかった。標本箱の「書き出す」で控えを取っておいて。", "warn");
  }
  U.box = {
    all: () => box.slice(),
    count: () => box.length,
    has: (id) => box.some((s) => s.id === id),
    get: (id) => box.find((s) => s.id === id),
    add(spec) {
      const found = box.find((s) => s.id === spec.id);
      if (found) return found;
      const no = box.reduce((m, s) => Math.max(m, s.no || 0), 0) + 1;
      const s = Object.assign({}, spec, { no, savedAt: new Date().toISOString() });
      box.unshift(s);
      saveBox();
      return s;
    },
    update(id, patch) {
      const s = box.find((x) => x.id === id);
      if (!s) return null;
      Object.assign(s, patch);
      saveBox();
      return s;
    },
    remove(id) { box = box.filter((s) => s.id !== id); saveBox(); },
    merge(list) {
      let added = 0;
      let next = box.reduce((m, s) => Math.max(m, s.no || 0), 0);
      list.forEach((s) => {
        if (!s || !s.id || !s.title) return;
        if (box.some((x) => x.id === s.id)) return;
        const copy = Object.assign({}, s);
        if (!copy.no || box.some((x) => x.no === copy.no)) copy.no = ++next;
        else next = Math.max(next, copy.no);
        if (!copy.savedAt) copy.savedAt = new Date().toISOString();
        box.push(copy);
        added++;
      });
      box.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
      saveBox();
      return added;
    }
  };
  window.addEventListener("storage", (e) => {
    if (e.key === NS + BOX_KEY) { box = U.store.get(BOX_KEY, []); U.emit("box", box); }
  });

  /* ---------- 小さな知らせ ---------- */
  U.toast = (msg, tone) => {
    const host = document.getElementById("toasts");
    if (!host) return;
    const t = U.h("div", { class: "toast" + (tone ? " is-" + tone : ""), role: "status" }, msg);
    host.append(t);
    setTimeout(() => t.classList.add("is-out"), 3600);
    setTimeout(() => t.remove(), 4200);
  };

  /* ---------- 書式 ---------- */
  U.num = (n) => Number(n || 0).toLocaleString("ja-JP");
  U.fmtDate = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  };
  U.stripHTML = (html) => {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(String(html).replace(/<br\s*\/?>/gi, " ").replace(/<\/p>/gi, " "), "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  };
  U.truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s || "");
  U.list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  U.first = (v) => U.list(v)[0];
  U.joinList = (v, sep) => U.list(v).filter(Boolean).join(sep || "、");
  let regionNames = null;
  U.region = (cc) => {
    if (!cc) return "";
    try { regionNames = regionNames || new Intl.DisplayNames(["ja"], { type: "region" }); return regionNames.of(String(cc).toUpperCase()) || cc; } catch (e) { return cc; }
  };
  let langNames = null;
  U.language = (code) => {
    if (!code) return "";
    try { langNames = langNames || new Intl.DisplayNames(["ja"], { type: "language" }); return langNames.of(code) || code; } catch (e) { return code; }
  };
  /* Internet Archive の言語欄は "eng" "English" "jpn" などが混ざっている */
  const IA_LANGS = {
    eng: "英語", english: "英語", jpn: "日本語", japanese: "日本語", spa: "スペイン語", spanish: "スペイン語",
    fre: "フランス語", fra: "フランス語", french: "フランス語", ger: "ドイツ語", deu: "ドイツ語", german: "ドイツ語",
    ita: "イタリア語", italian: "イタリア語", por: "ポルトガル語", portuguese: "ポルトガル語", rus: "ロシア語", russian: "ロシア語",
    chi: "中国語", zho: "中国語", chinese: "中国語", kor: "韓国語", korean: "韓国語", dan: "デンマーク語", danish: "デンマーク語",
    swe: "スウェーデン語", swedish: "スウェーデン語", nor: "ノルウェー語", norwegian: "ノルウェー語", dut: "オランダ語", nld: "オランダ語", dutch: "オランダ語",
    pol: "ポーランド語", polish: "ポーランド語", cze: "チェコ語", ces: "チェコ語", czech: "チェコ語", hun: "ハンガリー語", hungarian: "ハンガリー語",
    gre: "ギリシャ語", ell: "ギリシャ語", greek: "ギリシャ語", heb: "ヘブライ語", hebrew: "ヘブライ語", yid: "イディッシュ語", yiddish: "イディッシュ語",
    ara: "アラビア語", arabic: "アラビア語", tur: "トルコ語", turkish: "トルコ語", fin: "フィンランド語", finnish: "フィンランド語",
    hin: "ヒンディー語", ind: "インドネシア語", tha: "タイ語", vie: "ベトナム語", ukr: "ウクライナ語", rum: "ルーマニア語", ron: "ルーマニア語",
    lat: "ラテン語", latin: "ラテン語", zxx: "言葉なし", mul: "複数の言語", und: ""
  };
  U.iaLang = (v) => Array.from(new Set(U.list(v).flatMap((x) => String(x).split(/[;,]\s*/)).map((x) => {
    const k = x.trim().toLowerCase();
    if (k in IA_LANGS) return IA_LANGS[k];
    if (/^[a-z]{2,3}$/.test(k)) { const n = U.language(k); return n && n !== k ? n : x.trim(); }
    return x.trim();
  }).filter(Boolean))).join("、");
  U.duration = (sec) => {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
  };
  U.parseLength = (len) => {
    if (len == null) return 0;
    const s = String(len);
    if (s.includes(":")) return s.split(":").reduce((acc, x) => acc * 60 + Number(x || 0), 0);
    return Number(s) || 0;
  };
  U.errorText = (e) => {
    const src = (e && e.source) || "相手先";
    if (e && e.status === 0) return src + " に届かなかった。回線か相手の調子が悪いのかもしれない。";
    if (e && (e.status === 429 || e.status === 503)) return src + " が混み合っている。少し間を置いてから、もう一度。";
    if (e && e.status) return src + " から返事がなかった（" + e.status + "）。";
    return "掘っている途中で何かが崩れた。" + (e && e.message ? "（" + e.message + "）" : "");
  };

  /* ---------- 同時に鳴る音はひとつだけ ---------- */
  document.addEventListener("play", (e) => {
    U.$$("audio, video").forEach((m) => { if (m !== e.target && !m.paused) m.pause(); });
    U.emit("media-play", e.target);
  }, true);

  /* ---------- 部品：外へのリンク ---------- */
  U.ext = (label, url, cls) => U.h("a", { class: cls || "ext", href: url, target: "_blank", rel: "noopener noreferrer" }, label, U.h("span", { class: "sr-only" }, "（新しいタブで開く）"));

  /* ---------- 部品：鉱脈（どこを掘るか） ---------- */
  U.veins = function ({ items, value, onChange, label }) {
    const wrap = U.h("div", { class: "control" });
    const group = U.h("div", { class: "veins", role: "radiogroup", "aria-label": label || "鉱脈" });
    const note = U.h("p", { class: "vein-note" });
    const buttons = items.map((it) => U.h("button", {
      type: "button", class: "vein", role: "radio", "aria-checked": String(it.id === value),
      on: { click: () => { if (it.id === value) return; set(it.id); onChange(it.id); } }
    }, it.label));
    group.append(...buttons);
    function set(id) {
      value = id;
      buttons.forEach((b, i) => b.setAttribute("aria-checked", String(items[i].id === id)));
      const it = items.find((x) => x.id === id);
      note.textContent = (it && it.note) || "";
      note.hidden = !note.textContent;
    }
    wrap.append(U.h("span", { class: "label-cap" }, label || "鉱脈"), U.h("div", { class: "control-body" }, group, note));
    set(value);
    wrap.set = set;
    return wrap;
  };

  /* ---------- 部品：深度 ---------- */
  U.depth = function ({ levels, value, onChange, unit, label }) {
    const wrap = U.h("div", { class: "control" });
    const track = U.h("div", { class: "depth", role: "radiogroup", "aria-label": label || "深度" });
    let buttons = [];
    function render() {
      U.clear(track);
      buttons = levels.map((lv, i) => U.h("button", {
        type: "button", class: "depth-stop", role: "radio", style: { "--i": i },
        "aria-checked": String(i === value),
        on: { click: () => { if (i === value) return; set(i); onChange(i); } }
      }, U.h("span", { class: "depth-name" }, lv.label), U.h("span", { class: "depth-max" }, lv.text || (lv.max == null ? "制限なし" : (lv.prefix || "") + U.num(lv.max) + (unit || "") + "以下"))));
      track.append(...buttons);
    }
    function set(i) { value = i; buttons.forEach((b, j) => b.setAttribute("aria-checked", String(j === i))); }
    wrap.append(U.h("span", { class: "label-cap" }, label || "深度"), U.h("div", { class: "control-body" }, track));
    render();
    wrap.set = set;
    wrap.setLevels = (lv, v) => { levels = lv; value = v == null ? Math.min(value, lv.length - 1) : v; render(); };
    wrap.get = () => value;
    return wrap;
  };

  /* ---------- 部品：たどっている糸 ---------- */
  U.threadControl = function (onClear) {
    const body = U.h("div", { class: "control-body" });
    const wrap = U.h("div", { class: "control", hidden: true }, U.h("span", { class: "label-cap" }, "糸"), body);
    wrap.set = (thread) => {
      U.clear(body);
      wrap.hidden = !thread;
      if (!thread) return;
      body.append(U.h("span", { class: "thread-chip" },
        U.h("span", null, thread.label + "：" + U.truncate(thread.value || "", 48)),
        U.h("button", { type: "button", class: "link-btn", on: { click: () => onClear() } }, "糸を切る")));
    };
    return wrap;
  };
  /* Lucene の語句として安全に包む */
  U.luceneQuote = (s) => '"' + String(s).replace(/["\\]/g, "\\$&") + '"';

  /* ---------- 部品：深さの目盛り（対数） ---------- */
  const GAUGE_TICKS = [[0, "0"], [10, "10"], [100, "100"], [1000, "1千"], [10000, "1万"], [100000, "10万"]];
  U.gauge = function (value, label) {
    const max = 100000, L = Math.log10(max + 1);
    const pos = (v) => Math.min(1, Math.log10(Math.max(0, v) + 1) / L) * 100;
    return U.h("div", { class: "gauge", role: "img", "aria-label": (label || "") + " " + U.num(value) },
      U.h("div", { class: "gauge-bar" }, U.h("span", { class: "gauge-mark", style: { left: pos(value) + "%" } })),
      U.h("div", { class: "gauge-ticks", "aria-hidden": "true" }, GAUGE_TICKS.map(([v, t]) => U.h("span", { style: { left: pos(v) + "%" } }, t))),
      U.h("div", { class: "gauge-ends", "aria-hidden": "true" }, U.h("span", null, "深い・知られていない"), U.h("span", null, "地表・よく知られている"))
    );
  };

  /* ---------- 部品：掘っている最中 ---------- */
  U.digging = (text) => U.h("div", { class: "digging", role: "status", "aria-live": "polite" },
    U.h("div", { class: "drill", "aria-hidden": "true" }),
    U.h("p", { class: "digging-text" }, text || "掘っています…"));

  U.notice = function (title, body, actions) {
    return U.h("div", { class: "notice" },
      U.h("p", { class: "notice-title" }, title),
      body ? U.h("p", { class: "notice-body" }, body) : null,
      actions && actions.length ? U.h("div", { class: "notice-actions" }, actions) : null);
  };

  U.btn = (label, onClick, cls, extra) => U.h("button", Object.assign({ type: "button", class: "btn " + (cls || ""), on: { click: onClick } }, extra || {}), label);

  /* ---------- 標本にする ---------- */
  U.toSpecimen = (find, note) => ({
    id: find.id, room: find.room, title: find.title, sub: find.sub || "", kicker: find.kicker || "",
    image: find.image || "", url: find.url || "",
    metric: find.metric ? { value: find.metric.value, unit: find.metric.unit || "", label: find.metric.label || "" } : null,
    note: (note || "").trim()
  });

  /* ---------- 部品：見つけたもの ---------- */
  U.findCard = function (find, opts) {
    opts = opts || {};
    const card = U.h("article", { class: "find" + (find.media || find.image ? "" : " no-media") + (find.wide ? " is-wide" : ""), "data-room": find.room });
    if (find.media || find.image) {
      const media = U.h("div", { class: "find-media" });
      if (find.media) media.append(find.media);
      else {
        const img = U.h("img", { src: find.image, alt: find.imageAlt || "", loading: "lazy", referrerpolicy: "no-referrer", decoding: "async" });
        img.addEventListener("error", () => { media.classList.add("is-broken"); img.remove(); media.append(U.h("p", { class: "img-missing" }, "画像は届かなかった")); });
        media.append(img);
      }
      if (find.mediaCaption) media.append(U.h("p", { class: "media-caption" }, find.mediaCaption));
      card.append(media);
    }
    const body = U.h("div", { class: "find-body" });
    if (find.kicker) body.append(U.h("p", { class: "find-kicker" }, find.kicker));
    body.append(U.h("h2", { class: "find-title" }, find.title || "（題名なし）"));
    if (find.sub) body.append(U.h("p", { class: "find-sub" }, find.sub));
    if (find.meta && find.meta.length) {
      const dl = U.h("dl", { class: "find-meta" });
      find.meta.filter((m) => m && m[1]).forEach(([k, v]) => dl.append(U.h("dt", null, k), U.h("dd", null, v)));
      body.append(dl);
    }
    if (find.tags && find.tags.length) body.append(U.h("p", { class: "find-tags" }, find.tags.slice(0, 10).map((t) => U.h("span", { class: "tag" }, t))));
    if (find.desc) {
      const full = find.desc;
      const short = U.truncate(full, 220);
      const p = U.h("p", { class: "find-desc" }, short);
      if (short !== full) {
        const more = U.h("button", { type: "button", class: "link-btn", on: { click: () => { p.textContent = full; } } }, "続きを読む");
        p.append(" ", more);
      }
      body.append(p);
    }
    if (find.extra) body.append(find.extra);
    if (find.metric) {
      const m = find.metric;
      body.append(U.h("div", { class: "find-metric" },
        U.h("div", { class: "metric-line" },
          U.h("span", { class: "metric-value" }, U.num(m.value), U.h("small", null, m.unit || "")),
          U.h("span", { class: "metric-label" }, m.label)),
        U.gauge(m.value, m.label),
        m.poem ? U.h("p", { class: "metric-poem" }, m.poem) : null));
    }
    if (find.links && find.links.length) {
      body.append(U.h("div", { class: "find-links" }, find.links.map((l) => U.ext(l.label, l.url, "chip-link"))));
    }
    card.append(body);

    /* 行動 */
    const actions = U.h("div", { class: "find-actions" });
    const keepBtn = U.h("button", { type: "button", class: "btn btn-keep", "data-action": "keep" });
    const keepPanel = U.h("form", { class: "keep-panel", hidden: true });
    const noteInput = U.h("input", { type: "text", id: "keep-note-" + Math.random().toString(36).slice(2, 8), maxlength: "160", placeholder: "どこに惹かれた？ ひとことで（空でもいい）", autocomplete: "off" });
    keepPanel.append(
      U.h("label", { class: "keep-label", for: noteInput.id }, "拾う理由を、自分の言葉で"),
      noteInput,
      U.h("div", { class: "keep-row" },
        U.h("button", { type: "submit", class: "btn btn-primary" }, "標本箱に収める"),
        U.h("button", { type: "button", class: "btn", on: { click: () => { keepPanel.hidden = true; keepBtn.focus(); } } }, "やめる"))
    );
    keepPanel.addEventListener("submit", (e) => {
      e.preventDefault();
      const s = U.box.add(U.toSpecimen(find, noteInput.value));
      keepPanel.hidden = true;
      refreshKeep();
      stampIt(s);
      U.toast("標本 No." + String(s.no).padStart(4, "0") + " として収めた");
      if (opts.onKept) opts.onKept(s);
    });
    keepPanel.addEventListener("keydown", (e) => { if (e.key === "Escape") { keepPanel.hidden = true; keepBtn.focus(); } });
    function refreshKeep() {
      const s = U.box.get(find.id);
      U.clear(keepBtn);
      if (s) {
        keepBtn.append("収蔵済み No." + String(s.no).padStart(4, "0"));
        keepBtn.classList.add("is-kept");
        keepBtn.onclick = () => { location.hash = "#box"; };
      } else {
        keepBtn.append("拾う", U.h("span", { class: "kbd", "aria-hidden": "true" }, "K"));
        keepBtn.classList.remove("is-kept");
        keepBtn.onclick = () => { keepPanel.hidden = !keepPanel.hidden; if (!keepPanel.hidden) noteInput.focus(); };
      }
    }
    function stampIt(s) {
      U.$$(".stamp", card).forEach((x) => x.remove());
      card.append(U.h("div", { class: "stamp", "aria-hidden": "true" }, "標本 No." + String(s.no).padStart(4, "0")));
    }
    refreshKeep();
    const existing = U.box.get(find.id);
    if (existing) stampIt(existing);
    actions.append(keepBtn);
    if (opts.onNext) actions.append(U.h("button", { type: "button", class: "btn btn-dig", "data-action": "next", on: { click: opts.onNext } }, opts.nextLabel || "次を掘る", U.h("span", { class: "kbd", "aria-hidden": "true" }, "N")));
    if (find.threads && find.threads.length) {
      const menu = U.h("details", { class: "threads" },
        U.h("summary", { class: "btn" }, "糸をたどる"),
        U.h("div", { class: "threads-menu" }, find.threads.map((t) => U.h("button", {
          type: "button", class: "thread-opt",
          on: { click: (e) => { e.currentTarget.closest("details").open = false; t.run(); } }
        }, U.h("span", { class: "thread-k" }, t.label), U.h("span", { class: "thread-v" }, U.truncate(t.value || "", 40))))));
      actions.append(menu);
    }
    if (find.url) actions.append(U.ext(find.urlLabel || "原典を開く", find.url, "btn btn-ghost"));
    if (opts.actionsExtra) actions.append(opts.actionsExtra);
    card.append(actions, keepPanel);
    card.openKeep = () => { if (!U.box.has(find.id)) { keepPanel.hidden = false; noteInput.focus(); } };
    return card;
  };

  /* ---------- 掘る係（読み込み・失敗・足跡をまとめて扱う） ---------- */
  U.digger = function ({ room, stage, trailHost, dig, loadingText, renderFind, onRestore }) {
    const trail = [];
    let token = 0, current = null, currentEl = null;
    const api = {};
    const trailBox = U.h("div", { class: "trail", hidden: true },
      U.h("p", { class: "trail-head" }, "足跡", U.h("span", null, "このページを閉じると消える")),
      U.h("div", { class: "trail-list" }));
    if (trailHost) trailHost.append(trailBox);
    function renderTrail() {
      const list = U.$(".trail-list", trailBox);
      U.clear(list);
      trail.forEach((f, i) => list.append(U.h("button", { type: "button", class: "trail-item", title: f.title, on: { click: () => { token++; trail.splice(i, 1); show(f); if (onRestore) onRestore(f); } } }, f.title)));
      trailBox.hidden = trail.length === 0;
    }
    function show(find) {
      if (current && current !== find) {
        trail.unshift(current);
        if (trail.length > 14) trail.pop();
        renderTrail();
      }
      current = find;
      U.clear(stage);
      currentEl = renderFind ? renderFind(find, api) : U.findCard(find, { onNext: () => api.run() });
      stage.append(currentEl);
    }
    api.run = async function (arg) {
      const my = ++token;
      U.clear(stage).append(U.digging(typeof loadingText === "function" ? loadingText(arg) : loadingText));
      stage.setAttribute("aria-busy", "true");
      try {
        const find = await dig(arg, () => my !== token);
        if (my !== token) return;
        stage.removeAttribute("aria-busy");
        if (!find) return;
        if (find.notice) { U.clear(stage).append(find.notice); return; }
        show(find);
      } catch (e) {
        if (my !== token) return;
        console.error(e);
        stage.removeAttribute("aria-busy");
        U.clear(stage).append(U.notice("掘りきれなかった", U.errorText(e), [U.btn("もう一度掘る", () => api.run(arg), "btn-dig")]));
      }
    };
    api.show = show;
    api.current = () => current;
    api.keep = () => { if (currentEl && currentEl.openKeep) currentEl.openKeep(); };
    api.cancel = () => { token++; };
    api.room = room;
    return api;
  };

  /* ---------- 部屋の登録 ---------- */
  U.rooms = [];
  U.room = (def) => { U.rooms.push(def); };

  /* 部屋の見出し（目次の縞模様と同じ凡例を使う） */
  U.roomHead = (def) => U.h("header", { class: "room-head" },
    U.h("p", { class: "eyebrow" }, U.h("span", { class: "lith-chip", "data-lith": def.lith, "aria-hidden": "true" }), def.group + " ／ " + def.name),
    U.h("h1", { class: "room-title" }, def.title),
    U.h("p", { class: "room-lede" }, def.lede));
})();
