/* 音盤 — Internet Archive に眠る、再生の少ない録音 */
(function () {
  "use strict";
  const U = window.U;
  const IA = "https://archive.org";
  const SRC = "Internet Archive";

  /* ---------- Internet Archive を掘る共通の道具（映像の部屋でも使う） ---------- */
  const countCache = new Map();
  const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
  const IA_FIELDS = ["identifier", "title", "creator", "year", "date", "downloads", "collection", "publisher", "language", "subject"];

  async function iaCount(q) {
    if (countCache.has(q)) return countCache.get(q);
    const d = await U.fetchJSON(IA + "/advancedsearch.php?" + U.query({ q, "fl[]": "identifier", rows: 0, output: "json" }), { source: SRC, retries: 2 });
    const n = (d.response && d.response.numFound) || 0;
    countCache.set(q, n);
    return n;
  }
  async function iaPage(q, rows, page) {
    const d = await U.fetchJSON(IA + "/advancedsearch.php?" + U.query({ q, "fl[]": IA_FIELDS, rows, page, output: "json" }), { source: SRC, retries: 2 });
    return (d.response && d.response.docs) || [];
  }
  /* 検索結果は先頭の1万件までしかめくれない。多すぎるときは識別子の頭文字で地層を切り分けてから、でたらめな頁を開く */
  async function iaRandomDocs(q, prefix) {
    const ROWS = 40;
    const n = await iaCount(q);
    if (!n) return { n: 0, docs: [] };
    let qq = q, nn = n;
    if (n > 10000) {
      for (let i = 0; i < 4; i++) {
        const c = U.pick(CHARS);
        let q2 = q + " AND identifier:" + (prefix || "") + c + "*";
        let n2 = await iaCount(q2);
        if (n2 > 10000) {
          const q3 = q + " AND identifier:" + (prefix || "") + c + U.pick(CHARS) + "*";
          const n3 = await iaCount(q3);
          if (n3 > 0) { q2 = q3; n2 = n3; }
        }
        if (n2 > 0) { qq = q2; nn = n2; break; }
      }
    }
    const pages = Math.max(1, Math.min(Math.ceil(Math.min(nn, 10000) / ROWS), Math.floor(10000 / ROWS)));
    const docs = await iaPage(qq, ROWS, 1 + U.rand(pages));
    return { n, docs };
  }
  async function iaMeta(id) {
    return U.fetchJSON(IA + "/metadata/" + encodeURIComponent(id), { source: SRC, retries: 2 });
  }
  const iaFileURL = (id, name) => IA + "/download/" + encodeURIComponent(id) + "/" + String(name).split("/").map(encodeURIComponent).join("/");
  function iaImage(id, files) {
    /* 音声から自動で作られた波形の PNG（derivative）は写真ではないので除く */
    const ok = (f) => !/thumb|spectrogram|waveform|_spec\b|\.gif$/i.test(f.name) && !(f.source === "derivative" && /PNG|Spectrogram/i.test(f.format || ""));
    const pick = (re) => files.find((f) => re.test(f.format || "") && ok(f));
    const f = pick(/^Item Image$/) || pick(/^JPEG$/) || pick(/^PNG$/) || files.find((f) => /\.(jpe?g|png)$/i.test(f.name) && ok(f));
    return f ? iaFileURL(id, f.name) : "";
  }
  const BIG_COLLECTIONS = /^(78rpm|georgeblood|audio_music|opensource_audio|audio|folksoundomy|oldtimeradio|etree|netlabels|cassettetapes|cassettetaperecordings|opensource_movies|vhsvault|movies|prelinger|community|fav-.*|audio_foreign|audio_bookspoetry|audio_religion|hamiltonbioacousticsfieldrecordings|luis-antero-field-recordings|green-field-recordings|vhscommercials|classic_tv_commercials.*|prelingerhomemovies|home_movies|centerforhomemovies|memoriestolight|bptvpa|lpama|apatvme|pandatv23ny|wehoca|pacbny)$/i;
  const JUNK = /iptv|m3u|tiktok|gta audio story|^\s*$|^[\w-]{11}$|^[0-9a-f-]{20,}$|^[0-9a-f]{8}-[0-9a-f]{4}|^untitled$/i;

  U.ia = { count: iaCount, randomDocs: iaRandomDocs, meta: iaMeta, fileURL: iaFileURL, image: iaImage, BIG: BIG_COLLECTIONS, JUNK, base: IA };

  /* ---------- 再生器 ---------- */
  const ICON_PLAY = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3.5v13l11-6.5z" fill="currentColor"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 3.5h4v13h-4zM11.5 3.5h4v13h-4z" fill="currentColor"/></svg>';
  U.audioPlayer = function ({ tracks, image, spin, alt, label }) {
    const wrap = U.h("div", { class: "player-wrap" });
    let disc = null;
    if (spin && !image && label) {
      /* 盤面の写真がないSP盤には、無地のレーベルを描いて題名を書き入れる */
      disc = U.h("div", { class: "disc", role: "img", "aria-label": label.title + " のレコード（写真なし）" },
        U.h("div", { class: "disc-label", "aria-hidden": "true" },
          U.h("span", { class: "disc-top" }, U.h("span", { class: "disc-title" }, U.truncate(label.title, 40))),
          U.h("span", { class: "disc-bottom" },
            label.sub ? U.h("span", { class: "disc-sub" }, U.truncate(label.sub, 40)) : null,
            U.h("span", { class: "disc-rpm" }, "78 R.P.M."))));
      wrap.append(disc);
    } else if (image) {
      if (spin) {
        const img = U.h("img", { src: image, alt: alt || "", referrerpolicy: "no-referrer" });
        disc = U.h("div", { class: "disc" }, img);
        img.addEventListener("error", () => img.remove());
        wrap.append(disc);
      } else {
        const img = U.h("img", { src: image, alt: alt || "", referrerpolicy: "no-referrer", class: "cover-img" });
        img.addEventListener("error", () => img.remove());
        wrap.append(img);
      }
    }
    const audio = U.h("audio", { preload: "none" });
    const playBtn = U.h("button", { type: "button", class: "play-btn", "aria-label": "再生" });
    playBtn.innerHTML = ICON_PLAY;
    const seekId = "seek-" + Math.random().toString(36).slice(2, 8);
    const seek = U.h("input", { type: "range", class: "seek", id: seekId, min: "0", max: "1000", value: "0", "aria-label": "再生位置" });
    const time = U.h("span", { class: "time" }, "0:00");
    const status = U.h("p", { class: "player-status", "aria-live": "polite" });
    const list = tracks.length > 1 ? U.h("div", { class: "tracks" }) : null;
    let idx = 0, loaded = false;
    const lenOf = (i) => (isFinite(audio.duration) && audio.duration > 0 ? audio.duration : tracks[i].length || 0);
    function mark() {
      if (list) U.$$(".track", list).forEach((b, j) => b.setAttribute("aria-current", String(j === idx)));
    }
    function load(i, autoplay) {
      idx = i; loaded = true;
      audio.src = tracks[i].url;
      seek.value = "0";
      mark();
      status.textContent = tracks.length > 1 ? (i + 1) + " / " + tracks.length + "　" + tracks[i].title : "";
      if (autoplay) audio.play().catch(() => { status.textContent = "再生できなかった。原典のページで試してみて。"; });
    }
    playBtn.addEventListener("click", () => {
      if (!loaded) { load(idx, true); return; }
      if (audio.paused) audio.play().catch(() => { status.textContent = "再生できなかった。原典のページで試してみて。"; });
      else audio.pause();
    });
    audio.addEventListener("play", () => { playBtn.innerHTML = ICON_PAUSE; playBtn.setAttribute("aria-label", "一時停止"); if (disc) disc.classList.add("is-spinning"); });
    audio.addEventListener("pause", () => { playBtn.innerHTML = ICON_PLAY; playBtn.setAttribute("aria-label", "再生"); if (disc) disc.classList.remove("is-spinning"); });
    audio.addEventListener("waiting", () => { status.textContent = "針を落としています…"; });
    audio.addEventListener("playing", () => { status.textContent = tracks.length > 1 ? (idx + 1) + " / " + tracks.length + "　" + tracks[idx].title : ""; });
    audio.addEventListener("timeupdate", () => {
      const L = lenOf(idx);
      if (document.activeElement !== seek && L) seek.value = String(Math.round((audio.currentTime / L) * 1000));
      time.textContent = U.duration(audio.currentTime) + " / " + (L ? U.duration(L) : "--:--");
    });
    audio.addEventListener("ended", () => { if (idx + 1 < tracks.length) load(idx + 1, true); });
    audio.addEventListener("error", () => { if (loaded) status.textContent = "この音源は今は届かないか、このブラウザでは鳴らせない形式。原典のページで試してみて。"; });
    seek.addEventListener("input", () => {
      if (!loaded) return;
      const L = lenOf(idx);
      if (L) audio.currentTime = (Number(seek.value) / 1000) * L;
    });
    if (tracks[0] && tracks[0].length) time.textContent = "0:00 / " + U.duration(tracks[0].length);
    if (list) tracks.forEach((t, i) => list.append(U.h("button", { type: "button", class: "track", "aria-current": String(i === 0), on: { click: () => load(i, true) } },
      U.h("span", null, t.title), U.h("span", { class: "track-len" }, t.length ? U.duration(t.length) : ""))));
    wrap.append(U.h("div", { class: "player" }, playBtn, seek, time, status, list), audio);
    wrap.audio = audio;
    return wrap;
  };

  /* ---------- 音の鉱脈 ---------- */
  const VEINS = [
    { id: "sp", label: "SP盤", note: "1900〜50年代の78回転レコード。盤面を写した写真つき。", q: "collection:78rpm", prefix: "78_", levels: [1000, 200, 80, 45], spin: true },
    { id: "cassette", label: "名もなきカセット", note: "ラベルのないテープ、誰かの宅録、ラジオの録音。", q: "collection:(cassettetaperecordings OR cassettetapes)", levels: [3000, 500, 150, 60] },
    { id: "otr", label: "古いラジオ", note: "1930〜50年代のラジオドラマや番組。", q: "collection:oldtimeradio", levels: [1000, 100, 20, 3] },
    { id: "field", label: "野の音", note: "鳥、虫、水、街。誰かがその場で録った音。", q: "collection:(hamiltonbioacousticsfieldrecordings OR luis-antero-field-recordings OR green-field-recordings)", levels: [1000, 100, 30, 10] },
    { id: "live", label: "誰かのライブ", note: "Live Music Archive に預けられた、無名のバンドの演奏。", q: "collection:etree", levels: [1000, 100, 20, 3] },
    { id: "netlabel", label: "ネットレーベル", note: "2000年代に無料で配られていた音楽。", q: "collection:netlabels", levels: [3000, 500, 120, 40] },
    { id: "folk", label: "音の図書館", note: "誰でも音を預けられる棚。玉石混交。", q: "collection:folksoundomy", levels: [1000, 100, 20, 3] },
    { id: "jp", label: "日本語の音", note: "日本語で語られ、歌われた録音。", q: "mediatype:audio AND language:(jpn OR japanese OR Japanese)", levels: [1000, 100, 30, 5] }
  ];
  const DEPTH_NAMES = ["浅層", "中層", "深層", "最深部"];
  const levelsOf = (vein) => vein.levels.map((max, i) => ({ label: DEPTH_NAMES[i], max }));

  const AUDIO_FORMATS = ["VBR MP3", "128Kbps MP3", "MP3", "64Kbps MP3", "Ogg Vorbis", "Opus", "Flac", "24bit Flac", "WAVE"];
  function pickTracks(files, vein) {
    let playable = files.filter((f) => AUDIO_FORMATS.includes(f.format));
    if (vein && vein.id === "sp") {
      const friendly = playable.filter((f) => !/\d(\.\d)?\s?mil|truncat|elliptical|eliptical|conical|_restored_/i.test(f.name));
      if (friendly.length) playable = friendly;
    }
    const groups = new Map();
    for (const f of playable) {
      const key = (f.source === "derivative" && f.original ? f.original : f.name).replace(/\.[^.]+$/, "");
      const rank = AUDIO_FORMATS.indexOf(f.format);
      const cur = groups.get(key);
      if (!cur || rank < cur.rank) groups.set(key, { f, rank });
    }
    const tracks = Array.from(groups.values()).map((g) => g.f);
    tracks.sort((a, b) => (parseInt(a.track, 10) || 9999) - (parseInt(b.track, 10) || 9999) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    return tracks.slice(0, 60);
  }

  function poemFor(n) {
    return n === 0 ? "まだ一度も再生されていない。最初の聴き手は、あなた。" : (n + 1) + "回目の再生は、あなた。";
  }

  async function buildFind(doc, vein, st) {
    const id = doc.identifier;
    const meta = await iaMeta(id);
    if (!meta || !meta.files || meta.is_dark) return null;
    const tracks = pickTracks(meta.files, vein);
    if (!tracks.length) return null;
    const md = meta.metadata || {};
    const title = U.first(md.title) || U.first(doc.title) || id;
    const creator = Array.from(new Set(U.list(md.creator).map((c) => String(c).trim()))).filter(Boolean).join("、");
    const year = U.first(md.year) || (U.first(md.date) || "").slice(0, 4);
    const publisher = U.first(md.publisher);
    const language = U.iaLang(md.language);
    const subjects = U.list(md.subject).flatMap((s) => String(s).split(/;\s*/)).filter((s) => s && !/^78rpm$/i.test(s)).slice(0, 5);
    const shelves = U.list(md.collection).filter((c) => !BIG_COLLECTIONS.test(c));
    const downloads = Number(doc.downloads || 0);
    const image = iaImage(id, meta.files);
    const spin = !!vein.spin;
    const player = U.audioPlayer({
      tracks: tracks.map((f) => ({ url: iaFileURL(id, f.name), title: f.title || f.name.replace(/\.[^.]+$/, "").replace(/^.*\//, ""), length: U.parseLength(f.length) })),
      image, spin, alt: title + " の写真", label: { title, sub: U.first(md.creator) || publisher || "" }
    });
    const threads = [];
    const add = (label, value, q) => threads.push({ label, value, run: () => st.follow({ label, value, q }) });
    if (creator) add("同じ演者・作り手", U.first(md.creator), "creator:" + U.luceneQuote(U.first(md.creator)));
    if (year && /^\d{4}$/.test(year)) add("同じ年", year + "年", "year:" + year);
    if (publisher) add("同じレーベル・発行元", publisher, "publisher:" + U.luceneQuote(publisher));
    if (shelves[0]) add("同じ小さな棚", shelves[0], "collection:" + U.luceneQuote(shelves[0]));
    if (subjects[0]) add("同じ主題", subjects[0], "subject:" + U.luceneQuote(subjects[0]));
    return {
      id: "ia:" + id, room: "audio",
      kicker: [vein.label, year, language].filter(Boolean).join("／"),
      title, sub: creator,
      meta: [["年", year], ["レーベル", publisher], ["言語", language], ["主題", subjects.join("、")], ["棚", shelves.slice(0, 3).join("、")], ["曲数", tracks.length > 1 ? tracks.length + "曲" : ""]],
      desc: U.truncate(U.stripHTML(U.first(md.description)), 900),
      media: player, image,
      metric: { value: downloads, unit: "回", label: "archive.org での再生・ダウンロード", poem: poemFor(downloads) },
      url: IA + "/details/" + encodeURIComponent(id), urlLabel: "Internet Archive で開く",
      threads
    };
  }

  let dg = null;
  const def = {
    id: "audio", name: "音盤", group: "聴く", lith: "sand",
    short: "再生の少ない録音",
    title: "誰も聴いていない録音",
    lede: "Internet Archive に預けられた録音から、再生された回数の少ないものを一枚ずつ掘り出す。",
    digger: () => dg,
    mount(el) {
      const st = {
        vein: U.prefs.get("audio", "vein", "sp"),
        depth: U.prefs.get("audio", "depth", 2),
        thread: null
      };
      if (!VEINS.some((v) => v.id === st.vein)) st.vein = "sp";
      const veinOf = () => VEINS.find((v) => v.id === st.vein);
      el.append(U.roomHead(def));
      const veins = U.veins({
        items: VEINS, value: st.vein,
        onChange: (v) => { st.vein = v; st.thread = null; threadCtl.set(null); U.prefs.set("audio", "vein", v); depth.setLevels(levelsOf(veinOf()), st.depth); dg.run(); }
      });
      const depth = U.depth({
        levels: levelsOf(veinOf()), value: st.depth, unit: "回",
        onChange: (i) => { st.depth = i; U.prefs.set("audio", "depth", i); dg.run(); }
      });
      const threadCtl = U.threadControl(() => { st.thread = null; threadCtl.set(null); dg.run(); });
      st.follow = (thread) => { st.thread = thread; threadCtl.set(thread); dg.run(); };
      const stage = U.h("div", { class: "dig-site" });
      const trailHost = U.h("div");
      el.append(U.h("div", { class: "controls" }, veins, depth, threadCtl), stage, trailHost);

      dg = U.digger({
        room: "audio", stage, trailHost,
        loadingText: () => (st.thread ? "糸をたどって掘っています…" : veinOf().label + "の" + DEPTH_NAMES[st.depth] + "を掘っています…"),
        dig: async (arg, stale) => {
          const vein = veinOf();
          const base = st.thread ? "mediatype:audio AND " + st.thread.q : vein.q;
          for (let di = st.depth; di >= -1; di--) {
            const max = di >= 0 ? vein.levels[di] : null;
            const q = base + (max != null ? " AND downloads:[0 TO " + max + "]" : "") + " AND NOT title:(iptv OR m3u OR tiktok)";
            for (let attempt = 0; attempt < 2; attempt++) {
              const { n, docs } = await iaRandomDocs(q, st.thread ? "" : vein.prefix);
              if (stale()) return null;
              if (!n) break;
              const cands = U.shuffle(docs.filter((d) => !JUNK.test(String(U.first(d.title) || d.identifier))));
              for (const doc of cands.slice(0, 4)) {
                const find = await buildFind(doc, vein, st);
                if (stale()) return null;
                if (find) {
                  if (di !== st.depth) find.extra = U.h("p", { class: "room-note" }, di >= 0
                    ? DEPTH_NAMES[st.depth] + "には何も埋まっていなかったので、" + DEPTH_NAMES[di] + "から掘り出した。"
                    : "どの深さにも見つからなかったので、深さを問わずに掘り出した。");
                  return find;
                }
              }
            }
          }
          return { notice: U.notice("何も掘り出せなかった", st.thread ? "この糸の先には、鳴らせる録音が見つからなかった。糸を切って、もう一度。" : "この鉱脈は今、手応えがない。別の鉱脈か、浅い層で試してみて。",
            [U.btn("もう一度掘る", () => dg.run(), "btn-dig")]) };
        }
      });
      dg.run();
    }
  };
  U.room(def);
})();
