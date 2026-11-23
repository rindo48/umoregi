/* 標本箱 — 自分の手で拾ったもの。理由は自分の言葉で */
(function () {
  "use strict";
  const U = window.U;
  let pendingManual = null;
  let openManualForm = null;

  U.openManual = (preset) => {
    pendingManual = preset || {};
    if (openManualForm) openManualForm(pendingManual);
    U.go("box");
  };

  const roomName = (id) => { const r = U.rooms.find((x) => x.id === id); return r ? r.name : "外"; };
  const roomLith = (id) => { const r = U.rooms.find((x) => x.id === id); return r ? r.lith : "grid"; };
  const noText = (n) => "No." + String(n || 0).padStart(4, "0");

  /* 自分の言葉から、よく使う言葉を掘り出す（形態素解析の代わりにブラウザの単語区切りを使う） */
  const STOP = new Set(["の", "に", "は", "を", "が", "と", "て", "で", "た", "だ", "し", "も", "な", "い", "う", "か", "ね", "よ", "から", "まで", "より", "こと", "もの", "これ", "それ", "あれ", "この", "その", "あの", "ある", "いる", "する", "ない", "よう", "ため", "ところ", "感じ", "ちょっと", "とても", "すごい", "なんか", "みたい", "けど", "けれど", "です", "ます", "でし", "だっ", "って", "the", "a", "an", "of", "and", "to", "is", "in", "it"]);
  function topWords(notes) {
    let seg = null;
    try { seg = new Intl.Segmenter("ja", { granularity: "word" }); } catch (e) { seg = null; }
    const counts = new Map();
    const HIRA = /^[぀-ゟ]+$/;
    const KANJI1 = /^[一-鿿]$/;
    const AUX = /^(して|した|しそう|ている|ていた|なかっ|だった|でした|ような|ように|みたい|という|けれど|ところ|ために|それで|だけど|ちょっと|なんだか)/;
    /* 一文字の漢字は、後ろに助詞や句読点が続くとき（名詞らしいとき）だけ数える。「読ま」「笑っ」のような動詞の頭は除く */
    const NOUNISH_NEXT = /^(?:$|[のがをにはでともやへ、。！？!?・」』）)\s]|みたい|っぽ|だ|です|まで|より|から)/;
    notes.forEach((n) => {
      const segs = seg ? Array.from(seg.segment(n)).filter((s) => s.isWordLike) : n.split(/[\s、。,.!?！？「」『』（）()]+/).map((w) => ({ segment: w, index: n.indexOf(w) }));
      const seen = new Set();
      segs.forEach((s) => {
        const w = s.segment.trim().toLowerCase();
        if (!w || STOP.has(w) || seen.has(w)) return;
        if (/^[\d\p{P}\p{S}]+$/u.test(w)) return;
        if (HIRA.test(w) && (w.length < 4 || AUX.test(w))) return;
        if (KANJI1.test(w) && !NOUNISH_NEXT.test(n.slice(s.index + s.segment.length, s.index + s.segment.length + 3))) return;
        if (w.length < 2 && !KANJI1.test(w)) return;
        seen.add(w);
        counts.set(w, (counts.get(w) || 0) + 1);
      });
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja")).slice(0, 30);
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = U.h("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const stampDate = () => { const d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); };
  function toMarkdown(list) {
    const lines = ["# 標本箱", "", "埋もれ木で拾ったもの。" + U.fmtDate(new Date().toISOString()) + " に書き出し。", ""];
    list.slice().reverse().forEach((s) => {
      lines.push("## " + noText(s.no) + "　" + s.title);
      if (s.sub) lines.push("- " + s.sub);
      lines.push("- 部屋：" + roomName(s.room));
      lines.push("- 拾った日：" + U.fmtDate(s.savedAt));
      if (s.metric) lines.push("- 拾ったとき：" + s.metric.label + " " + U.num(s.metric.value) + (s.metric.unit || ""));
      if (s.url) lines.push("- " + s.url);
      if (s.note) { lines.push(""); lines.push("> " + s.note.replace(/\n/g, "\n> ")); }
      lines.push("");
    });
    return lines.join("\n");
  }

  const def = {
    id: "box", name: "標本箱", group: "残す", lith: "grid",
    short: "自分の言葉で残したもの",
    title: "標本箱",
    lede: "自分の手で拾ったもの。星もいいねもない。残っているのは、拾ったときの深さと、あなたが書いた言葉だけ。",
    onShow() { if (pendingManual && openManualForm) openManualForm(pendingManual); },
    mount(el) {
      const st = { filter: "all", q: "" };
      el.append(U.roomHead(def));
      const stats = U.h("p", { class: "box-stats" });
      const filterRow = U.h("div", { class: "veins", role: "radiogroup", "aria-label": "部屋で絞る" });
      const search = U.h("input", { type: "search", class: "text-input", id: "box-search", placeholder: "言葉や名前で探す", autocomplete: "off" });
      search.addEventListener("input", () => { st.q = search.value.trim().toLowerCase(); renderGrid(); });
      const fileInput = U.h("input", { type: "file", accept: "application/json,.json", id: "box-import", hidden: true });
      fileInput.addEventListener("change", async () => {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        try {
          const data = JSON.parse(await f.text());
          const list = Array.isArray(data) ? data : data.specimens;
          if (!Array.isArray(list)) throw new Error("標本の並びが見つからない");
          const n = U.box.merge(list);
          U.toast(n + " 点を標本箱に加えた");
        } catch (e) { U.toast("読み込めなかった：" + e.message, "warn"); }
        fileInput.value = "";
      });

      /* 外で見つけたものを書き留める */
      const mRoom = U.h("select", { class: "select", id: "manual-room" },
        U.rooms.filter((r) => r.group && r.id !== "box").map((r) => U.h("option", { value: r.id }, r.name)),
        U.h("option", { value: "outside" }, "画面の外"));
      const mTitle = U.h("input", { type: "text", class: "text-input", id: "manual-title", required: true, maxlength: "120", placeholder: "名前（曲名、店の名前、見つけた物…）" });
      const mUrl = U.h("input", { type: "url", class: "text-input", id: "manual-url", placeholder: "住所（あれば）https://…" });
      const mNote = U.h("textarea", { class: "text-input", id: "manual-note", rows: "3", maxlength: "400", placeholder: "どこに惹かれた？ 自分の言葉で", style: { fontFamily: "var(--f-hand)", fontSize: "17px" } });
      const manual = U.h("form", { class: "keep-panel", hidden: true, style: { marginBottom: "20px" } },
        U.h("p", { class: "notice-title" }, "外で見つけたものを書き留める"),
        U.h("div", { class: "field-row" }, U.h("label", { for: "manual-room" }, "どこで"), mRoom),
        U.h("label", { class: "keep-label", for: "manual-title" }, "名前"), mTitle,
        U.h("label", { class: "keep-label", for: "manual-url" }, "住所"), mUrl,
        U.h("label", { class: "keep-label", for: "manual-note" }, "自分の言葉"), mNote,
        U.h("div", { class: "keep-row" },
          U.h("button", { type: "submit", class: "btn btn-primary" }, "標本箱に収める"),
          U.h("button", { type: "button", class: "btn", on: { click: () => { manual.hidden = true; } } }, "やめる")));
      manual.addEventListener("submit", (e) => {
        e.preventDefault();
        const title = mTitle.value.trim();
        if (!title) { mTitle.focus(); return; }
        const url = mUrl.value.trim();
        const s = U.box.add({
          id: "manual:" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          room: mRoom.value === "outside" ? "outside" : mRoom.value,
          title, sub: "", kicker: "自分で見つけた", image: "",
          url: /^https?:\/\//i.test(url) ? url : "",
          metric: null, note: mNote.value.trim()
        });
        manual.hidden = true;
        mTitle.value = ""; mUrl.value = ""; mNote.value = "";
        U.toast(noText(s.no) + " として収めた");
      });
      openManualForm = (preset) => {
        pendingManual = null;
        manual.hidden = false;
        if (preset.room && Array.from(mRoom.options).some((o) => o.value === preset.room)) mRoom.value = preset.room;
        if (preset.title) mTitle.value = preset.title;
        if (preset.url) mUrl.value = preset.url;
        setTimeout(() => { manual.scrollIntoView({ block: "center" }); (preset.title ? mNote : mTitle).focus(); }, 30);
      };

      const tools = U.h("div", { class: "box-tools" },
        search,
        U.btn("外で見つけたものを書き留める", () => openManualForm({}), "btn-keep"),
        U.btn("書き出す（控え）", () => {
          const list = U.box.all();
          download("umoregi-hyouhonbako-" + stampDate() + ".json", JSON.stringify({ app: "umoregi", version: 1, exportedAt: new Date().toISOString(), specimens: list }, null, 2), "application/json");
        }),
        U.btn("書き出す（読み物）", () => download("umoregi-hyouhonbako-" + stampDate() + ".md", toMarkdown(U.box.all()), "text/markdown")),
        U.h("label", { class: "btn", for: "box-import" }, "控えを読み込む"), fileInput);
      const grid = U.h("div", { class: "box-grid" });
      const aside = U.h("div", { class: "box-aside" });
      el.append(stats, U.h("div", { class: "controls" }, U.h("div", { class: "control" }, U.h("span", { class: "label-cap" }, "部屋"), U.h("div", { class: "control-body" }, filterRow))), tools, manual, grid, aside);

      function renderStats(list) {
        U.clear(stats);
        if (!list.length) return;
        const measured = list.filter((s) => s.metric && typeof s.metric.value === "number");
        const deepest = measured.slice().sort((a, b) => a.metric.value - b.metric.value)[0];
        const oldest = list.reduce((m, s) => (!m || String(s.savedAt) < String(m.savedAt) ? s : m), null);
        stats.append(U.h("span", null, U.h("b", null, U.num(list.length)), "点を収蔵"));
        if (deepest) stats.append(U.h("span", null, "いちばん深い拾い物：", U.h("b", null, U.num(deepest.metric.value)), deepest.metric.unit + "　" + U.truncate(deepest.title, 28)));
        if (oldest) stats.append(U.h("span", null, "最初の標本：" + U.fmtDate(oldest.savedAt)));
      }
      function renderFilters(list) {
        U.clear(filterRow);
        const rooms = Array.from(new Set(list.map((s) => s.room)));
        const items = [["all", "すべて", list.length], ...rooms.map((r) => [r, roomName(r), list.filter((s) => s.room === r).length])];
        if (!items.some(([id]) => id === st.filter)) st.filter = "all";
        items.forEach(([id, label, n]) => filterRow.append(U.h("button", { type: "button", class: "vein", role: "radio", "aria-checked": String(id === st.filter), on: { click: () => { st.filter = id; renderAll(); } } }, label + " " + n)));
      }
      function specCard(s) {
        const img = U.h("div", { class: "spec-img" });
        if (s.image) {
          const im = U.h("img", { src: s.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
          im.addEventListener("error", () => { im.remove(); img.append(U.h("span", { class: "lith-fill", "data-lith": roomLith(s.room) })); });
          img.append(im);
        } else img.append(U.h("span", { class: "lith-fill", "data-lith": roomLith(s.room) }));
        const note = U.h("p", { class: "spec-note" + (s.note ? "" : " is-empty") }, s.note || "（言葉はまだない）");
        const actions = U.h("div", { class: "spec-actions" });
        const body = U.h("div", { class: "spec-body" },
          U.h("p", { class: "spec-no" }, U.h("span", null, noText(s.no) + "／" + roomName(s.room)), U.h("span", null, U.fmtDate(s.savedAt))),
          U.h("h3", { class: "spec-title" }, s.title),
          s.sub ? U.h("p", { class: "spec-sub" }, U.truncate(s.sub, 80)) : null,
          s.metric ? U.h("p", { class: "spec-metric" }, "拾ったとき " + U.num(s.metric.value) + (s.metric.unit || "") + "（" + s.metric.label + "）") : null,
          note, actions);
        function renderActions() {
          U.clear(actions);
          if (s.url) actions.append(U.ext("開く", s.url));
          actions.append(
            U.h("button", { type: "button", class: "link-btn", on: { click: edit } }, "言葉を書き直す"),
            U.h("button", { type: "button", class: "link-btn", on: { click: confirmRemove } }, "埋め戻す"));
        }
        function edit() {
          const id = "edit-" + s.id.replace(/[^\w]/g, "").slice(-12) + Math.random().toString(36).slice(2, 5);
          const ta = U.h("textarea", { id, rows: "3", maxlength: "400", value: s.note || "" });
          const form = U.h("form", { class: "spec-edit" },
            U.h("label", { class: "keep-label", for: id }, "自分の言葉"), ta,
            U.h("div", { class: "keep-row" }, U.h("button", { type: "submit", class: "btn btn-primary" }, "書き直す"), U.h("button", { type: "button", class: "btn", on: { click: () => { form.replaceWith(note); renderActions(); } } }, "やめる")));
          form.addEventListener("submit", (e) => { e.preventDefault(); U.box.update(s.id, { note: ta.value.trim() }); });
          note.replaceWith(form);
          U.clear(actions);
          ta.focus();
        }
        function confirmRemove() {
          U.clear(actions).append(
            U.h("span", null, "埋め戻すと、この標本は消える。"),
            U.h("button", { type: "button", class: "link-btn", on: { click: () => { U.box.remove(s.id); U.toast(noText(s.no) + " を埋め戻した"); } } }, "埋め戻す"),
            U.h("button", { type: "button", class: "link-btn", on: { click: renderActions } }, "やめる"));
        }
        renderActions();
        return U.h("article", { class: "spec" }, img, body);
      }
      function renderGrid() {
        const list = U.box.all().filter((s) => (st.filter === "all" || s.room === st.filter) &&
          (!st.q || [s.title, s.sub, s.note, s.kicker].join(" ").toLowerCase().includes(st.q)));
        U.clear(grid);
        if (!U.box.count()) {
          grid.append(U.h("div", { class: "empty-box" },
            U.h("p", { class: "notice-title" }, "まだ何も収めていない"),
            U.h("p", null, "どこかの部屋で「拾う」を押して、ひとこと書く。それがここに並ぶ。"),
            U.h("div", { class: "notice-actions" }, U.btn("でたらめな部屋で掘る", () => U.randomRoom(), "btn-dig"), U.btn("外で見つけたものを書き留める", () => openManualForm({})))));
          return;
        }
        if (!list.length) { grid.append(U.h("p", { class: "room-note" }, "この条件に合う標本はない。")); return; }
        list.forEach((s) => grid.append(specCard(s)));
      }
      function renderAside(list) {
        U.clear(aside);
        const notes = list.map((s) => s.note).filter(Boolean);
        const words = topWords(notes);
        aside.append(U.h("div", null,
          U.h("h3", null, "言葉の地層"),
          U.h("p", null, notes.length >= 3 ? "拾うときに書いた言葉の中で、何度も出てくるもの。あなたが何に惹かれるのかは、この中に埋まっている。" : "拾うときに言葉を書いていくと、ここに、あなたがよく使う言葉が積もっていく。"),
          notes.length >= 3 && words.length ? U.h("ul", { class: "words" }, words.map(([w, n]) => U.h("li", null, w, n > 1 ? U.h("small", null, "×" + n) : null))) : null));
        aside.append(U.h("div", null,
          U.h("h3", null, "どこに保存されているか"),
          U.h("p", null, "標本はこのブラウザの中にだけ保存されている。ブラウザのデータを消すと標本も消えるので、ときどき「書き出す（控え）」で控えを取っておくと安心。別のブラウザやパソコンには「控えを読み込む」で移せる。")));
      }
      function renderAll() {
        const list = U.box.all();
        renderStats(list);
        renderFilters(list);
        renderGrid();
        renderAside(list);
      }
      U.on("box", renderAll);
      renderAll();
      if (pendingManual) openManualForm(pendingManual);
    }
  };
  U.room(def);
})();
