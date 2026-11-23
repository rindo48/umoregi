/* 映像 — アーカイブの古い映像と、誰かが撮ったまま投稿した動画 */
(function () {
  "use strict";
  const U = window.U;

  const VEINS = [
    { id: "vhs", label: "VHSの山", note: "家庭や会社で録られたビデオテープを、誰かが取り込んだもの。", q: "collection:vhsvault", levels: [1000, 100, 20, 5] },
    { id: "home", label: "誰かのホームムービー", note: "8ミリや16ミリで撮られた、どこかの家族の記録。", q: "collection:(prelingerhomemovies OR home_movies OR centerforhomemovies OR memoriestolight)", levels: [2000, 300, 80, 30] },
    { id: "cm", label: "古いテレビCM", note: "放送の合間に流れて、消えていった広告。", q: "collection:(classic_tv_commercials OR vhscommercials OR classic_tv_commercials_emperor)", levels: [2000, 300, 60, 20] },
    { id: "pa", label: "町のケーブルテレビ", note: "アメリカの小さな町の、住民がつくる公共チャンネル。", q: "collection:(bptvpa OR lpama OR apatvme OR pandatv23ny OR wehoca OR pacbny)", levels: [500, 50, 10, 2] },
    { id: "eph", label: "記録映画", note: "教育映画や企業のPR映画。プリンガー・アーカイブより。", q: "collection:prelinger", levels: [5000, 1000, 300, 100] },
    { id: "community", label: "誰かの動画", note: "誰でも動画を預けられる棚。何が出るかわからない。", q: "collection:opensource_movies", levels: [1000, 50, 5, 0] }
  ];
  const DEPTH_NAMES = ["浅層", "中層", "深層", "最深部"];
  const levelsOf = (v) => v.levels.map((max, i) => ({ label: DEPTH_NAMES[i], max }));
  const VIDEO_FORMATS = ["h.264", "MPEG4", "512Kb MPEG4", "h.264 IA", "H.264", "Ogg Video", "WebM"];

  function pickVideo(files) {
    const vids = files.filter((f) => VIDEO_FORMATS.includes(f.format) && /\.(mp4|m4v|ogv|webm)$/i.test(f.name));
    vids.sort((a, b) => VIDEO_FORMATS.indexOf(a.format) - VIDEO_FORMATS.indexOf(b.format) || (Number(a.size) || 0) - (Number(b.size) || 0));
    return vids[0] || null;
  }

  /* ---------- 骰子：カメラやスマホが自動でつける名前 ---------- */
  const pad = (n, w) => String(n).padStart(w, "0");
  function stamp() {
    const y = U.randInt(2009, 2024), m = U.randInt(1, 12), d = U.randInt(1, 28);
    const h = U.randInt(0, 23), mi = U.randInt(0, 59), s = U.randInt(0, 59);
    return { y, m: pad(m, 2), d: pad(d, 2), h: pad(h, 2), mi: pad(mi, 2), s: pad(s, 2) };
  }
  const NAMERS = [
    ["iPhone", () => "IMG " + pad(U.randInt(1, 9999), 4)],
    ["iPhone", () => "IMG_" + pad(U.randInt(1, 9999), 4) + " MOV"],
    ["Android", () => { const t = stamp(); return "VID " + t.y + t.m + t.d + " " + t.h + t.mi + t.s; }],
    ["Galaxy", () => { const t = stamp(); return t.y + t.m + t.d + " " + t.h + t.mi + t.s; }],
    ["Pixel", () => { const t = stamp(); return "PXL " + t.y + t.m + t.d + " " + t.h + t.mi + t.s + pad(U.randInt(0, 999), 3); }],
    ["キヤノンのデジカメ", () => "MVI " + pad(U.randInt(1, 9999), 4)],
    ["ニコンやソニーのカメラ", () => "DSC " + pad(U.randInt(1, 9999), 4)],
    ["古いデジカメ", () => "DSCN" + pad(U.randInt(1, 9999), 4)],
    ["GoPro", () => "GOPR" + pad(U.randInt(1, 9999), 4)],
    ["ドローン", () => "DJI " + pad(U.randInt(1, 999), 4)],
    ["Windows のカメラ", () => { const t = stamp(); return "WIN " + t.y + t.m + t.d + " " + t.h + " " + t.mi + " " + t.s + " Pro"; }],
    ["Mac の画面収録", () => { const t = stamp(); return "画面収録 " + t.y + "-" + t.m + "-" + t.d; }],
    ["iPhone の画面収録", () => "RPReplay Final" + (1500000000 + U.rand(200000000))]
  ];

  let dg = null, mode = "archive";
  const def = {
    id: "video", name: "映像", group: "観る", lith: "cong",
    short: "誰も見ていない映像",
    title: "誰も見ていない映像",
    lede: "アーカイブに預けられたまま見られていない映像と、誰かが撮ってそのまま投稿した動画を掘る。",
    digger: () => (mode === "archive" ? dg : null),
    mount(el) {
      const st = { vein: U.prefs.get("video", "vein", "vhs"), depth: U.prefs.get("video", "depth", 2), thread: null };
      if (!VEINS.some((v) => v.id === st.vein)) st.vein = "vhs";
      const veinOf = () => VEINS.find((v) => v.id === st.vein);
      el.append(U.roomHead(def));

      const tabArchive = U.h("button", { type: "button", class: "subtab", role: "tab", "aria-selected": "true", id: "video-tab-a", "aria-controls": "video-panel-a" }, "アーカイブの映像");
      const tabDice = U.h("button", { type: "button", class: "subtab", role: "tab", "aria-selected": "false", id: "video-tab-d", "aria-controls": "video-panel-d" }, "誰かが撮ったままの動画");
      const panelA = U.h("div", { id: "video-panel-a", role: "tabpanel", "aria-labelledby": "video-tab-a" });
      const panelD = U.h("div", { id: "video-panel-d", role: "tabpanel", "aria-labelledby": "video-tab-d", hidden: true });
      function setTab(m) {
        mode = m;
        tabArchive.setAttribute("aria-selected", String(m === "archive"));
        tabDice.setAttribute("aria-selected", String(m === "dice"));
        panelA.hidden = m !== "archive"; panelD.hidden = m !== "dice";
        U.prefs.set("video", "tab", m);
      }
      tabArchive.addEventListener("click", () => setTab("archive"));
      tabDice.addEventListener("click", () => setTab("dice"));
      el.append(U.h("div", { class: "subtabs", role: "tablist" }, tabArchive, tabDice), panelA, panelD);

      /* ---------- アーカイブ ---------- */
      const veins = U.veins({ items: VEINS, value: st.vein, onChange: (v) => { st.vein = v; st.thread = null; threadCtl.set(null); U.prefs.set("video", "vein", v); depth.setLevels(levelsOf(veinOf()), st.depth); dg.run(); } });
      const depth = U.depth({ levels: levelsOf(veinOf()), value: st.depth, unit: "回", onChange: (i) => { st.depth = i; U.prefs.set("video", "depth", i); dg.run(); } });
      const threadCtl = U.threadControl(() => { st.thread = null; threadCtl.set(null); dg.run(); });
      const stage = U.h("div", { class: "dig-site" });
      const trailHost = U.h("div");
      panelA.append(U.h("div", { class: "controls" }, veins, depth, threadCtl), stage, trailHost);

      async function buildFind(doc, vein) {
        const id = doc.identifier;
        const meta = await U.ia.meta(id);
        if (!meta || !meta.files || meta.is_dark) return null;
        const vf = pickVideo(meta.files);
        if (!vf) return null;
        const md = meta.metadata || {};
        const title = U.first(md.title) || U.first(doc.title) || id;
        const year = U.first(md.year) || (U.first(md.date) || "").slice(0, 4);
        const poster = U.ia.image(id, meta.files) || U.ia.base + "/services/img/" + encodeURIComponent(id);
        const video = U.h("video", { class: "video-frame", controls: true, preload: "metadata", playsinline: true, poster, src: U.ia.fileURL(id, vf.name) });
        const shelves = U.list(md.collection).filter((c) => !U.ia.BIG.test(c));
        const subjects = U.list(md.subject).flatMap((s) => String(s).split(/;\s*/)).filter(Boolean).slice(0, 5);
        const downloads = Number(doc.downloads || 0);
        const threads = [];
        const add = (label, value, q) => threads.push({ label, value, run: () => { st.thread = { label, value, q }; threadCtl.set(st.thread); dg.run(); } });
        if (md.creator) add("同じ作り手", U.first(md.creator), "creator:" + U.luceneQuote(U.first(md.creator)));
        if (/^\d{4}$/.test(year)) add("同じ年", year + "年", "year:" + year);
        if (shelves[0]) add("同じ小さな棚", shelves[0], "collection:" + U.luceneQuote(shelves[0]));
        if (subjects[0]) add("同じ主題", subjects[0], "subject:" + U.luceneQuote(subjects[0]));
        return {
          id: "ia:" + id, room: "video", wide: true,
          kicker: [vein.label, year, U.iaLang(md.language)].filter(Boolean).join("／"),
          title, sub: U.joinList(md.creator),
          media: video, image: poster,
          meta: [["年", year], ["長さ", vf.length ? U.duration(U.parseLength(vf.length)) : ""], ["主題", subjects.join("、")], ["棚", shelves.slice(0, 3).join("、")]],
          desc: U.truncate(U.stripHTML(U.first(md.description)), 900),
          metric: { value: downloads, unit: "回", label: "archive.org での再生・ダウンロード", poem: downloads === 0 ? "まだ誰にも見られていない。最初の観客は、あなた。" : (downloads + 1) + "人目の観客は、あなた。" },
          url: U.ia.base + "/details/" + encodeURIComponent(id), urlLabel: "Internet Archive で開く",
          threads
        };
      }

      dg = U.digger({
        room: "video", stage, trailHost,
        loadingText: () => (st.thread ? "糸をたどって掘っています…" : veinOf().label + "の" + DEPTH_NAMES[st.depth] + "を掘っています…"),
        renderFind: (find, api) => U.findCard(find, { onNext: () => api.run() }),
        dig: async (arg, stale) => {
          const vein = veinOf();
          const base = st.thread ? "mediatype:movies AND " + st.thread.q : vein.q;
          for (let di = st.depth; di >= -1; di--) {
            const max = di >= 0 ? vein.levels[di] : null;
            const q = base + (max != null ? " AND downloads:[0 TO " + max + "]" : "") + " AND NOT title:(iptv OR m3u)";
            for (let attempt = 0; attempt < 2; attempt++) {
              const { n, docs } = await U.ia.randomDocs(q, "");
              if (stale()) return null;
              if (!n) break;
              const cands = U.shuffle(docs.filter((d) => !U.ia.JUNK.test(String(U.first(d.title) || d.identifier))));
              for (const doc of cands.slice(0, 4)) {
                const find = await buildFind(doc, vein);
                if (stale()) return null;
                if (find) {
                  if (di !== st.depth) find.extra = U.h("p", { class: "room-note" }, di >= 0 ? DEPTH_NAMES[st.depth] + "には何も埋まっていなかったので、" + DEPTH_NAMES[di] + "から掘り出した。" : "どの深さにも見つからなかったので、深さを問わずに掘り出した。");
                  return find;
                }
              }
            }
          }
          return { notice: U.notice("何も掘り出せなかった", "この鉱脈は今、手応えがない。別の鉱脈か、浅い層で試してみて。", [U.btn("もう一度掘る", () => dg.run(), "btn-dig")]) };
        }
      });

      /* ---------- 骰子 ---------- */
      const nameEl = U.h("p", { class: "dice-name", "aria-live": "polite" });
      const whoEl = U.h("p", { class: "dice-note" });
      const ytLink = U.h("a", { class: "btn btn-dig", target: "_blank", rel: "noopener noreferrer" }, "YouTube でこの名前を探す", U.h("span", { class: "sr-only" }, "（新しいタブで開く）"));
      const wordEl = U.h("p", { class: "dice-name" });
      const nicoLink = U.h("a", { class: "btn btn-dig", target: "_blank", rel: "noopener noreferrer" }, "ニコニコで、再生の少ない順に見る", U.h("span", { class: "sr-only" }, "（新しいタブで開く）"));
      function rollName() {
        const [who, fn] = U.pick(NAMERS);
        const name = fn();
        nameEl.textContent = name;
        whoEl.textContent = who + " が撮った動画に、自動でつく名前。名前を変えずに投稿された動画は、たいてい撮った本人と家族くらいしか見ていない。";
        ytLink.href = "https://www.youtube.com/results?search_query=" + encodeURIComponent('"' + name + '"');
      }
      function rollWord() {
        const w = U.pick(window.UMO_DATA.everydayWords);
        wordEl.textContent = w;
        nicoLink.href = "https://www.nicovideo.jp/search/" + encodeURIComponent(w) + "?sort=v&order=a";
      }
      panelD.append(
        U.h("div", { class: "dice-box" },
          U.h("p", { class: "eyebrow" }, "骰子 一 ／ 撮ったままの名前"),
          nameEl, whoEl,
          U.h("div", { class: "dice-row" }, ytLink, U.btn("もう一度振る", rollName))),
        U.h("div", { class: "dice-box", style: { marginTop: "16px" } },
          U.h("p", { class: "eyebrow" }, "骰子 二 ／ ありふれた言葉"),
          wordEl,
          U.h("p", { class: "dice-note" }, "ありふれた言葉でニコニコ動画を探し、再生数の少ない順に並べる。一番上には、まだ誰も再生していない動画がある。"),
          U.h("div", { class: "dice-row" }, nicoLink, U.btn("もう一度振る", rollWord))),
        U.h("p", { class: "room-note" }, "見つけた動画は、標本箱の「外で見つけたものを書き留める」から残せる。", " ",
          U.h("button", { type: "button", class: "link-btn", on: { click: () => U.openManual && U.openManual({ room: "video" }) } }, "いま書き留める")));
      rollName(); rollWord();

      setTab(U.prefs.get("video", "tab", "archive"));
      dg.run();
    }
  };
  U.room(def);
})();
