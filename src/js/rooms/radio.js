/* 電波 — 経度のダイヤルを回して、今日まだ誰も合わせていない局を探す */
(function () {
  "use strict";
  const U = window.U;
  const SRC = "Radio Browser";
  const SERVERS = ["https://de1.api.radio-browser.info", "https://de2.api.radio-browser.info", "https://fi1.api.radio-browser.info"];
  let server = SERVERS[0];

  async function rb(path, opt) {
    let lastErr;
    for (const s of [server, ...SERVERS.filter((x) => x !== server)]) {
      try {
        const d = await U.fetchJSON(s + path, Object.assign({ source: SRC, retries: 0, timeout: 14000, cache: "no-store" }, opt || {}));
        server = s;
        return d;
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  const MODES = [
    { id: "dial", label: "経度のダイヤル", note: "針の下を通る経線の上にある国から、局を一つ選ぶ。" },
    { id: "jp", label: "日本の小さな局", note: "コミュニティFMや個人の配信局を含む、国内の局から。" },
    { id: "any", label: "どこでもない", note: "国も経度も問わず、世界中からでたらめに。" }
  ];
  const LEVELS = [
    { label: "浅層", min: 30, max: null, text: "今日31人以上" },
    { label: "中層", min: 5, max: 30, text: "今日6〜30人" },
    { label: "深層", min: 0, max: 5, text: "今日1〜5人" },
    { label: "最深部", min: null, max: 0, text: "今日まだ誰も" }
  ];
  const playable = (s) => s && s.url_resolved && /^https?:/i.test(s.url_resolved) && !s.hls && !/\.(m3u8?|pls|asx|xspf)(\?|$)/i.test(s.url_resolved)
    && (location.protocol !== "https:" || /^https:/i.test(s.url_resolved));
  const lonText = (lon) => (Math.abs(lon) < 0.05 ? "経度 0°" : (lon > 0 ? "東経 " : "西経 ") + Math.abs(lon).toFixed(1) + "°");
  const lonDiff = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  /* ---------- ザーという音 ---------- */
  function Static() {
    let ctx = null, noise = null, whistle = null, master = null;
    const api = {
      start() {
        if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          let v = (Math.random() * 2 - 1) * 0.55;
          if (Math.random() < 0.0006) v += (Math.random() * 2 - 1) * 1.4;
          data[i] = v;
        }
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1700; bp.Q.value = 0.55;
        noise = ctx.createGain(); noise.gain.value = 0;
        src.connect(bp).connect(noise).connect(master);
        src.start();
        const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = 900;
        whistle = ctx.createGain(); whistle.gain.value = 0;
        osc.connect(whistle).connect(master);
        osc.start();
        api.osc = osc;
      },
      level(v, t) { if (!ctx) return; noise.gain.cancelScheduledValues(ctx.currentTime); noise.gain.setTargetAtTime(v, ctx.currentTime, t || 0.15); },
      whistle(v, freq) {
        if (!ctx) return;
        whistle.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
        if (freq) api.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
      },
      volume(v) { if (master) master.gain.value = v * 0.7; },
      stop() { if (!ctx) return; api.level(0, 0.05); api.whistle(0); }
    };
    return api;
  }

  let dg = null;
  const def = {
    id: "radio", name: "電波", group: "聴く", lith: "shale",
    short: "誰も合わせていない局",
    title: "世界のどこかの、小さなラジオ",
    lede: "ダイヤルを回して経度を選ぶ。その線の上のどこかで、今日まだ誰も合わせていない放送局を探す。",
    digger: () => dg,
    onHide() {},
    mount(el) {
      const st = {
        mode: U.prefs.get("radio", "mode", "dial"),
        depth: U.prefs.get("radio", "depth", 3),
        lon: U.prefs.get("radio", "lon", 139.7),
        on: false, thread: null, current: null, tried: new Set()
      };
      if (!MODES.some((m) => m.id === st.mode)) st.mode = "dial";
      const stat = Static();
      const stream = U.h("audio", { preload: "none" });
      let countries = [];
      const byCountry = new Map();

      el.append(U.roomHead(def));
      const modes = U.veins({ items: MODES, value: st.mode, label: "探し方", onChange: (m) => { st.mode = m; U.prefs.set("radio", "mode", m); clearThread(); renderDialState(); if (st.on) dg.run(); } });
      const depth = U.depth({ levels: LEVELS, value: st.depth, onChange: (i) => { st.depth = i; U.prefs.set("radio", "depth", i); if (st.on) dg.run(); } });
      const threadCtl = U.threadControl(() => { clearThread(); if (st.on) dg.run(); });
      function clearThread() { st.thread = null; threadCtl.set(null); }

      /* ---------- 受信機 ---------- */
      const lonEl = U.h("span", { class: "radio-lon" });
      const nearEl = U.h("span", { class: "radio-near" });
      const power = U.h("button", { type: "button", class: "btn power", "aria-pressed": "false" }, "電源を入れる");
      const spin = U.btn("でたらめに回す", () => spinTo(-180 + Math.random() * 360), "");
      const volId = "radio-vol";
      const vol = U.h("input", { type: "range", id: volId, min: "0", max: "100", value: String(U.prefs.get("radio", "vol", 80)) });
      const dial = U.h("div", { class: "dial", role: "slider", tabindex: "0", "aria-label": "経度のダイヤル", "aria-valuemin": "-180", "aria-valuemax": "180" });
      const glow = U.h("div", { class: "dial-glow" });
      const needle = U.h("div", { class: "dial-needle" });
      const statusEl = U.h("span", { class: "radio-status" }, "電源が切れている");
      const set = U.h("div", { class: "radio-set" },
        U.h("div", { class: "radio-top" },
          U.h("div", { class: "radio-readout" }, lonEl, nearEl),
          U.h("div", { class: "radio-buttons" }, power, spin,
            U.h("label", { class: "vol", for: volId }, U.h("span", null, "音量"), vol))),
        dial,
        U.h("div", { class: "radio-bottom" }, statusEl));
      dial.append(glow, needle);
      [-180, -120, -60, 0, 60, 120, 180].forEach((d) => {
        const t = d === 0 ? "0°" : Math.abs(d) === 180 ? "180°" : Math.abs(d) + (d > 0 ? "°E" : "°W");
        dial.append(U.h("span", { class: "dial-deg" + (d === -180 ? " is-first" : d === 180 ? " is-last" : ""), style: { left: ((d + 180) / 360) * 100 + "%" } }, t));
      });

      const stage = U.h("div", { class: "dig-site" });
      const trailHost = U.h("div");
      el.append(U.h("div", { class: "controls" }, modes, depth, threadCtl), set, stage, trailHost, stream);
      stage.append(U.h("div", { class: "start-panel" },
        U.h("p", null, "電源を入れると、ダイヤルの針の下で局を探しはじめる。針は引っぱるか、矢印キーで動かせる。"),
        U.btn("電源を入れる", () => togglePower(true), "btn-dig")));

      function status(text, live) { statusEl.textContent = text; statusEl.classList.toggle("is-live", !!live); }
      function nearList(lon) {
        return countries.map((c) => ({ c, d: lonDiff(c.lon, lon) })).filter((x) => x.d <= 6).sort((a, b) => a.d - b.d).map((x) => x.c);
      }
      function renderDialState() {
        const x = ((st.lon + 180) / 360) * 100;
        needle.style.left = x + "%";
        glow.style.setProperty("--gx", x + "%");
        lonEl.textContent = st.mode === "dial" ? lonText(st.lon) : st.mode === "jp" ? "日本" : "どこでもない";
        const near = nearList(st.lon).slice(0, 4).map((c) => c.name);
        nearEl.textContent = st.mode === "dial" ? (near.length ? near.join("、") + " のあたり" : "海の上。近くの国を探す") : (st.mode === "jp" ? "国内の局から" : "世界中の局から");
        dial.setAttribute("aria-valuenow", st.lon.toFixed(1));
        dial.setAttribute("aria-valuetext", lonText(st.lon) + " " + nearEl.textContent);
        dial.style.opacity = st.mode === "dial" ? "1" : ".45";
      }
      function drawTicks() {
        U.$$(".dial-tick", dial).forEach((t) => t.remove());
        countries.forEach((c) => {
          const h = 6 + Math.min(44, 9 * Math.log10(c.count + 1));
          dial.insertBefore(U.h("span", { class: "dial-tick" + (c.count < 5 ? " is-small" : ""), style: { left: ((c.lon + 180) / 360) * 100 + "%", height: h + "px" }, title: c.name }), glow);
        });
      }

      /* ---------- 針を動かす ---------- */
      let settleTimer = null, dragging = false;
      function moveTo(lon, fromUser) {
        st.lon = Math.max(-180, Math.min(180, lon));
        renderDialState();
        if (!fromUser || !st.on || st.mode !== "dial") return;
        stream.pause();
        stat.level(0.2, 0.05);
        const nearest = countries.reduce((m, c) => Math.min(m, lonDiff(c.lon, st.lon)), 99);
        stat.whistle(nearest < 1.2 ? 0.035 : 0, 380 + nearest * 700);
        status("ザー……", false);
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => { stat.whistle(0); U.prefs.set("radio", "lon", st.lon); dg.run(); }, 750);
      }
      function lonFromEvent(e) {
        const r = dial.getBoundingClientRect();
        return ((e.clientX - r.left) / r.width) * 360 - 180;
      }
      dial.addEventListener("pointerdown", (e) => { if (st.mode !== "dial") return; dragging = true; dial.setPointerCapture(e.pointerId); moveTo(lonFromEvent(e), true); });
      dial.addEventListener("pointermove", (e) => { if (dragging) moveTo(lonFromEvent(e), true); });
      dial.addEventListener("pointerup", () => { dragging = false; });
      dial.addEventListener("pointercancel", () => { dragging = false; });
      dial.addEventListener("keydown", (e) => {
        if (st.mode !== "dial") return;
        const step = e.shiftKey ? 10 : 2;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); moveTo(st.lon + step, true); }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); moveTo(st.lon - step, true); }
      });
      dial.addEventListener("wheel", (e) => { if (st.mode !== "dial") return; e.preventDefault(); moveTo(st.lon + (e.deltaY > 0 ? 1.5 : -1.5), true); }, { passive: false });
      function spinTo(target) {
        if (st.mode !== "dial") { modes.set("dial"); st.mode = "dial"; U.prefs.set("radio", "mode", "dial"); clearThread(); }
        if (!st.on) togglePower(true, true);
        const from = st.lon, t0 = Date.now();
        const dur = document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1300;
        const step = () => {
          const p = dur ? Math.min(1, (Date.now() - t0) / dur) : 1;
          const e = 1 - Math.pow(1 - p, 3);
          moveTo(from + (target - from) * e, true);
          if (p < 1) setTimeout(step, 16);
        };
        step();
      }

      /* ---------- 電源 ---------- */
      function togglePower(on, silent) {
        st.on = on == null ? !st.on : on;
        power.setAttribute("aria-pressed", String(st.on));
        power.textContent = st.on ? "電源を切る" : "電源を入れる";
        set.classList.toggle("is-on", st.on);
        if (st.on) {
          stat.start();
          stat.volume(Number(vol.value) / 100);
          stat.level(0.18);
          if (!silent) dg.run();
        } else {
          dg.cancel();
          stream.pause();
          stream.removeAttribute("src");
          if (U.nowPlaying) U.nowPlaying.clear(stream);
          stat.stop();
          status("電源が切れている");
          U.$$(".signal", stage).forEach((s) => s.classList.add("is-idle"));
        }
      }
      power.addEventListener("click", () => togglePower());
      vol.addEventListener("input", () => { const v = Number(vol.value) / 100; stream.volume = v; stat.volume(v); U.prefs.set("radio", "vol", Number(vol.value)); });
      stream.volume = Number(vol.value) / 100;
      U.on("media-play", (m) => { if (m !== stream && st.on) togglePower(false); });

      /* ---------- 局を探す ---------- */
      async function loadCountries() {
        if (countries.length) return;
        const list = await rb("/json/countries?hidebroken=true");
        const C = window.UMO_CENTROIDS || {};
        countries = list.filter((c) => c.stationcount > 0 && C[c.iso_3166_1]).map((c) => ({
          code: c.iso_3166_1, name: U.region(c.iso_3166_1), count: c.stationcount, lat: C[c.iso_3166_1][0], lon: C[c.iso_3166_1][1]
        }));
        drawTicks();
        renderDialState();
      }
      async function stationsOf(key, path) {
        if (byCountry.has(key)) return byCountry.get(key);
        const list = (await rb(path)).filter(playable);
        byCountry.set(key, list);
        return list;
      }
      /* 選んだ深さの帯にいる局から。帯に局がなければ、帯より浅い（よく聴かれている）局のうち
         帯にいちばん近いものへ。帯より深い局には入らない。ただし糸をたどっているときだけは、
         浅いほうにも何もなければ、帯のすぐ下の局を選ぶ（糸の先が途切れないように） */
      function chooseFrom(list) {
        const lv = LEVELS[st.depth];
        const fresh = list.filter((s) => !st.tried.has(s.stationuuid));
        const pool = fresh.length ? fresh : list;
        const inBand = pool.filter((s) => U.inBand(s.clickcount, lv));
        if (inBand.length) return { list: U.shuffle(inBand), relaxed: null };
        const above = lv.max == null ? [] : pool.filter((s) => s.clickcount > lv.max).sort((a, b) => a.clickcount - b.clickcount);
        if (above.length) return { list: above.slice(0, 6), relaxed: "up" };
        if (st.thread && lv.min != null) {
          const below = pool.filter((s) => s.clickcount <= lv.min).sort((a, b) => b.clickcount - a.clickcount);
          if (below.length) return { list: below.slice(0, 6), relaxed: "down" };
        }
        return { list: [], relaxed: null, bandEmpty: pool.length > 0 };
      }
      async function candidates() {
        if (st.thread && st.thread.kind === "country") {
          return chooseFrom(await stationsOf("cc:" + st.thread.code, "/json/stations/search?countrycode=" + st.thread.code + "&hidebroken=true&order=clickcount&reverse=false&limit=500"));
        }
        if (st.thread && st.thread.kind === "tag") {
          return chooseFrom(await stationsOf("tag:" + st.thread.value, "/json/stations/search?tag=" + encodeURIComponent(st.thread.value) + "&tagExact=true&hidebroken=true&order=clickcount&reverse=false&limit=500"));
        }
        if (st.mode === "jp") return chooseFrom(await stationsOf("cc:JP", "/json/stations/search?countrycode=JP&hidebroken=true&order=clickcount&reverse=false&limit=500"));
        if (st.mode === "any") {
          const list = (await rb("/json/stations/search?order=random&hidebroken=true&limit=200&_=" + Date.now())).filter(playable);
          return chooseFrom(list);
        }
        let near = nearList(st.lon);
        if (!near.length) near = countries.slice().sort((a, b) => lonDiff(a.lon, st.lon) - lonDiff(b.lon, st.lon)).slice(0, 3);
        /* 経線の上の国を順に見て、選んだ深さの局がある国を先に使う */
        let fallback = null;
        for (const c of U.shuffle(near).slice(0, 4)) {
          const list = await stationsOf("cc:" + c.code, "/json/stations/search?countrycode=" + c.code + "&hidebroken=true&order=clickcount&reverse=false&limit=500");
          if (!list.length) continue;
          const r = chooseFrom(list);
          if (r.list.length && !r.relaxed) return r;
          if (!fallback || (!fallback.list.length && (r.list.length || r.bandEmpty))) fallback = r;
        }
        return fallback || { list: [], relaxed: null };
      }
      function tryPlay(s, stale) {
        return new Promise((resolve) => {
          let done = false;
          const finish = (ok) => { if (done) return; done = true; clearTimeout(timer); stream.removeEventListener("playing", onPlay); stream.removeEventListener("error", onErr); resolve(ok); };
          const onPlay = () => finish(true);
          const onErr = () => finish(false);
          const timer = setTimeout(() => finish(false), 11000);
          stream.addEventListener("playing", onPlay);
          stream.addEventListener("error", onErr);
          /* 画面の下の「再生中」の帯に出す名前。帯の「止める」は電源を切るのと同じにする */
          if (U.nowPlaying) U.nowPlaying.tag(stream, {
            room: "radio",
            title: (s.name || "").trim() || "名前のない局",
            sub: [s.countrycode ? U.region(s.countrycode) : s.country, s.state].filter(Boolean).join("／"),
            art: s.favicon && /^https:/i.test(s.favicon) ? s.favicon : "",
            stop: () => togglePower(false)
          });
          stream.src = s.url_resolved;
          stream.play().catch(() => finish(false));
          const check = setInterval(() => { if (stale()) { clearInterval(check); finish(false); } if (done) clearInterval(check); }, 300);
        });
      }
      function fadeIn() {
        const target = Number(vol.value) / 100;
        stream.volume = 0;
        let v = 0;
        const step = () => { v = Math.min(target, v + target / 20); stream.volume = v; if (v < target) setTimeout(step, 60); };
        step();
        stat.level(0, 0.5);
      }

      function stationFind(s, relaxed) {
        const tags = String(s.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
        const country = s.countrycode ? U.region(s.countrycode) : s.country;
        const mark = U.h("div", { class: "station-mark" });
        const initial = U.h("span", { class: "station-initial", "aria-hidden": "true" }, (s.name || "?").trim().charAt(0).toUpperCase());
        if (s.favicon && /^https?:/i.test(s.favicon) && (location.protocol !== "https:" || /^https:/i.test(s.favicon))) {
          const img = U.h("img", { src: s.favicon, alt: "", referrerpolicy: "no-referrer" });
          img.addEventListener("error", () => { img.remove(); mark.append(initial); });
          mark.append(img);
        } else mark.append(initial);
        const media = U.h("div", null, mark, U.h("div", { class: "signal", "aria-hidden": "true" }, U.h("i"), U.h("i"), U.h("i"), U.h("i"), U.h("i")));
        const threads = [];
        if (s.countrycode) threads.push({ label: "同じ国のほかの局", value: country, run: () => { st.thread = { kind: "country", code: s.countrycode, label: "国", value: country }; threadCtl.set(st.thread); dg.run(); } });
        tags.slice(0, 4).forEach((t) => threads.push({ label: "同じタグの局", value: t, run: () => { st.thread = { kind: "tag", label: "タグ", value: t }; threadCtl.set(st.thread); dg.run(); } }));
        const lang = String(s.language || "").split(",").filter(Boolean).slice(0, 3).join("、");
        const n = Number(s.clickcount || 0);
        const links = [];
        if (s.homepage && /^https?:/i.test(s.homepage)) links.push({ label: "局のホームページ", url: s.homepage });
        return {
          _station: s,
          id: "radio:" + s.stationuuid, room: "radio",
          kicker: [country, s.state, s.countrycode && st.mode === "dial" && !st.thread ? lonText(st.lon) : ""].filter(Boolean).join("／"),
          title: (s.name || "").trim() || "名前のない局",
          sub: tags.slice(0, 6).join(" / "),
          meta: [["国", country], ["地域", s.state], ["言語", lang], ["形式", [s.codec, s.bitrate ? s.bitrate + "kbps" : ""].filter(Boolean).join(" ")], ["票", s.votes ? U.num(s.votes) + "票" : ""]],
          media,
          image: s.favicon && /^https:/i.test(s.favicon) ? s.favicon : "",
          extra: relaxed ? U.h("p", { class: "room-note" }, relaxed === "down"
            ? "糸の先には" + LEVELS[st.depth].label + "より浅い局がなかったので、すぐ下の層の局を選んだ。"
            : "この辺りには" + LEVELS[st.depth].label + "の局がなかったので、それより少しよく聴かれている局を選んだ。") : null,
          metric: { value: n, unit: "人", label: "今日この局に合わせた人（Radio Browser 経由）", poem: n === 0 ? "今日この局に合わせたのは、あなたが最初。" : "今日" + (n + 1) + "人目の聴き手。" },
          links, url: s.homepage && /^https?:/i.test(s.homepage) ? s.homepage : "", urlLabel: "局のページへ",
          threads
        };
      }

      dg = U.digger({
        room: "radio", stage, trailHost,
        loadingText: () => "電波を探しています…",
        renderFind: (find, api) => U.findCard(find, { onNext: () => api.run(), nextLabel: "次の局を探す" }),
        onRestore: async (find) => {
          const s = find._station;
          if (!s) return;
          if (!st.on) togglePower(true, true);
          stat.level(0.18);
          status("合わせ直しています……" + (s.name || "").trim());
          const ok = await tryPlay(s, () => false);
          if (ok) { fadeIn(); status("受信中　" + (s.codec || "") + (s.bitrate ? " " + s.bitrate + "kbps" : ""), true); st.current = s; }
          else { stat.level(0.12); status("電波が届かない"); setTimeout(() => { if (stream.paused) stat.level(0, 0.8); }, 2600); }
        },
        dig: async (arg, stale) => {
          if (!st.on) togglePower(true, true);
          stat.level(0.18);
          status("探しています……");
          await loadCountries();
          if (stale()) return null;
          const { list, relaxed, bandEmpty } = await candidates();
          if (stale()) return null;
          if (!list.length && bandEmpty) {
            stat.level(0.12);
            status("この深さの局がない");
            setTimeout(() => { if (!stale() && stream.paused) stat.level(0, 0.8); }, 2600);
            return { notice: U.notice(LEVELS[st.depth].label + "の局が見つからなかった",
              (st.mode === "dial" && !st.thread ? "この経線の上には、" : "ここには、") + LEVELS[st.depth].label + "（" + LEVELS[st.depth].text + "）の局がなかった。" + (st.mode === "dial" && !st.thread ? "ダイヤルを回すか、" : "") + "深度を変えてみて。",
              [U.btn("もう一度探す", () => dg.run(), "btn-dig"), U.btn("でたらめに回す", () => spinTo(-180 + Math.random() * 360))]) };
          }
          for (const s of list.slice(0, 5)) {
            st.tried.add(s.stationuuid);
            status("合わせています……" + (s.name || "").trim());
            const ok = await tryPlay(s, stale);
            if (stale()) return null;
            if (ok) {
              fadeIn();
              status("受信中　" + (s.codec || "") + (s.bitrate ? " " + s.bitrate + "kbps" : ""), true);
              rb("/json/url/" + s.stationuuid).catch(() => {});
              st.current = s;
              return stationFind(s, relaxed);
            }
          }
          stat.level(0.12);
          status("電波が届かない");
          setTimeout(() => { if (!stale() && stream.paused) stat.level(0, 0.8); }, 2600);
          return { notice: U.notice("電波が届かなかった", st.mode === "dial" && !st.thread ? "この経線の上の局は、今は鳴らせなかった。ダイヤルを少し回すか、もう一度探してみて。" : "鳴らせる局が見つからなかった。もう一度探すか、探し方を変えてみて。",
            [U.btn("もう一度探す", () => dg.run(), "btn-dig"), U.btn("でたらめに回す", () => spinTo(-180 + Math.random() * 360))]) };
        }
      });

      renderDialState();
      loadCountries().catch((e) => status(U.errorText(e)));
    }
  };
  U.room(def);
})();
