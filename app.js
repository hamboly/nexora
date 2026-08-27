const APP_NAME = "Nexora";
const STORE_KEY = "nexora-v1";

let state = {
  activeCategory: "general",
  collapsed: false,
  theme: "light",
  style: "aurora",
  orders: {},
  sizes: {},
  removed: {},
  notes: "",
  todos: [],
  pollVotes: {},
  customCats: [],
  watchlist: [],
  concertCity: "New York",
  alarms: [],
  occasions: {},
  triviaBest: 0,
  hlBest: 0,
  rps: { w: 0, l: 0, t: 0, streak: 0, bestStreak: 0 },
  currentPlayer: "",
  players: [],
  scores: {},
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) state = { ...state, ...JSON.parse(raw) };
  } catch (e) {}
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

/* ---------- Live data layer (fetch + TTL cache + timeout + multi-proxy fallback) ---------- */
const PROXIES = [
  (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
  (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
];
const PROXY = PROXIES[0];

async function rawFetch(url, opts = {}, timeoutMs = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function getJSON(url, ttlMin = 45, http = {}, validate = null) {
  const key = "sc:" + url;
  let hit = null;
  try { hit = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) {}
  if (hit && Date.now() - hit.t < ttlMin * 60000 && (!validate || validate(hit.d))) return hit.d;
  let lastErr;
  const attempts = [[url, http, 9000]].concat(PROXIES.map((p) => [p(url), {}, 14000]));
  for (const [src, h, t] of attempts) {
    try {
      const res = await rawFetch(src, h, t);
      const d = await res.json();
      if (validate && !validate(d)) throw new Error("invalid payload");
      try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch (e) {}
      return d;
    } catch (err) { lastErr = err; }
  }
  throw lastErr || new Error("All sources unreachable");
}
function loadingHTML(msg = "Loading live data…") {
  return `<p class="center-text" style="padding:20px 0"><span class="dot-pulse"></span> ${msg}</p>`;
}
function errorHTML(msg = "Live source unreachable") {
  return `<p class="center-text" style="padding:20px 0;color:var(--loss)">⚠ ${msg}</p>`;
}
function decodeEntities(s) {
  const t = document.createElement("textarea");
  t.innerHTML = s || "";
  return t.value;
}

/* Deterministic daily Met artwork that ALWAYS has an image */
async function metPick(q, seed) {
  const s = await getJSON(`https://collectionapi.metmuseum.org/public/collection/v1/search?isHighlight=true&hasImages=true&q=${encodeURIComponent(q)}`, 720, {}, (d) => !!d?.objectIDs?.length);
  const ids = s.objectIDs;
  for (let k = 0; k < 6; k++) {
    const i = (Math.floor(Date.now() / 86400000) * 11 + seed * 17 + k * 29) % ids.length;
    const o = await getJSON(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${ids[i]}`, 1440);
    if (o && o.primaryImageSmall) return o;
  }
  throw new Error("no image");
}

/* ---------- Players & leaderboards (local multi-user) ---------- */
function currentPlayerName() { return state.currentPlayer || ""; }
function registerPlayer(raw) {
  const name = (raw || "").trim().slice(0, 18);
  if (!name) return false;
  if (!state.players) state.players = [];
  if (!state.players.some((p) => p.toLowerCase() === name.toLowerCase())) state.players.push(name);
  state.currentPlayer = name;
  saveState();
  return true;
}
function submitScore(game, score) {
  const name = currentPlayerName();
  if (!name || !isFinite(score)) return false;
  if (!state.scores) state.scores = {};
  if (!state.scores[game]) state.scores[game] = [];
  state.scores[game].push({ name, score: Math.round(score), ts: Date.now() });
  if (state.scores[game].length > 300) state.scores[game] = state.scores[game].slice(-300);
  saveState();
  return true;
}
function bestByName(game) {
  const best = {};
  (state.scores[game] || []).forEach((s) => {
    if (!best[s.name] || s.score > best[s.name].score) best[s.name] = s;
  });
  return Object.values(best).sort((a, b) => b.score - a.score);
}
function boardHTML(game, unit = "pts") {
  const me = currentPlayerName();
  const rows = bestByName(game).slice(0, 5);
  const medal = ["🥇", "🥈", "🥉"];
  return `<div class="lb-box">
    <div class="lb-head"><span>🏆 Leaderboard</span>${me ? `<span class="lb-me">👤 ${esc(me)}</span>` : ""}</div>
    ${rows.map((r, i) =>
      `<div class="list-row lb-row${r.name === me ? " me" : ""}"><span class="main-col">${medal[i] || `<b class="lb-rank">${i + 1}. </b>`}${esc(r.name)}</span><b>${r.score}<small>${unit}</small></b></div>`
    ).join("") || `<p class="center-text lb-empty">No scores yet — set the first record!</p>`}
    ${me ? "" : `<div class="wl-add lb-join-row"><input class="note-area lb-name" maxlength="18" placeholder="Your name to join…" style="min-height:0;padding:6px 8px;flex:1;font-size:11px"/><button class="lib-chip lb-join-btn" style="border-radius:10px">👤 Join</button></div>`}
    <p class="lb-note">Rankings across all players on this device</p>
  </div>`;
}
function bindBoard(wrap) {
  wrap.querySelectorAll(".lb-join-btn").forEach((b) => {
    b.addEventListener("click", () => {
      const inp = b.closest(".lb-join-row").querySelector(".lb-name");
      if (registerPlayer(inp.value)) {
        toast(`👋 Welcome, ${currentPlayerName()}!`);
        renderGrid();
      }
    });
    b.closest(".lb-join-row").querySelector(".lb-name").addEventListener("keydown", (e) => { if (e.key === "Enter") b.click(); });
  });
}

const BUILTIN_CATS = {
  general: { label: "Today Summary", icon: "🏠", hint: "Your daily dashboard", widgets: ["todaySummary", "weather", "clock", "quickLinks", "calendar", "notes", "todos", "quote"] },
  sports: { label: "Sports", icon: "⚽", hint: "Live scores, match schedule, league tables, F1 & NBA", sub: ["football", "f1", "basketball"],
    widgets: ["liveScores", "matchSchedule", "leagueTable", "multiScores", "teamFinder", "f1Standings", "f1ConstructorStandings", "f1Schedule", "f1Results", "f1TeamFinder", "nbaStandings", "nbaSchedule", "nbaScores", "nbaPlayers", "nbaTeamFinder"] },
  finance: { label: "Finance & Crypto", icon: "💰", hint: "Crypto, stocks, indices, gold, FX and market sentiment", widgets: ["cryptoWatchlist", "stocks", "marketIndices", "goldCurrency", "topMovers", "fearGreed", "currencyConverter"] },
  music: { label: "Music", icon: "🎵", hint: "Player, trending tracks, radio and concerts", widgets: ["nowPlaying", "trendingTracks", "topArtists", "moodMixes", "radio", "concerts"] },
  movies: { label: "Movies & Series", icon: "🎬", hint: "Trending movies & series, watchlist and genres", widgets: ["trendingMovies", "trendingSeries", "watchlist", "genreBrowser"] },
  art: { label: "Art", icon: "🎨", hint: "Artwork of the day, artists and exhibitions", widgets: ["artOfDay", "livingGallery", "artistSpotlight", "colorStories", "exhibitions"] },
  fun: { label: "Entertainment", icon: "🎮", hint: "Arcade games, quizzes, wisdom and daily fun — with leaderboards", widgets: ["dailyJoke", "triviaQuiz", "flagQuiz", "mathBlitz", "memoryMatch", "reactionTest", "rpsLeague", "higherLower", "pollOfDay", "funFacts", "wordOfWisdom"] },
};

function getCats() {
  const cats = {};
  for (const [k, v] of Object.entries(BUILTIN_CATS)) cats[k] = v;
  state.customCats.forEach((c) => {
    cats[c.key] = { label: c.label, icon: c.icon, hint: "Your personal category", widgets: [], custom: true };
  });
  return cats;
}

const WIDGETS = {
  todaySummary: {
    title: "Today Summary", icon: "☀️", cat: "general", size: "m",
    render() {
      const doneCount = state.todos.filter((t) => t.done).length;
      const total = state.todos.length;
      const dateStr = new Date().toLocaleDateString("en-US", { day: "numeric", month: "long" });
      const weekDay = new Date().toLocaleDateString("en-US", { weekday: "short" });
      const el = div(`
        <div class="summary-grid">
          <div class="sum-card"><div class="sc-icon">📅</div><div class="sc-val">${dateStr}</div><div class="sc-lbl">${weekDay}</div></div>
          <div class="sum-card sum-wx"><div class="sc-icon">⛅</div><div class="sc-val"><span class="dot-pulse"></span></div><div class="sc-lbl">New York</div></div>
          <div class="sum-card"><div class="sc-icon">✅</div><div class="sc-val">${doneCount}/${total}</div><div class="sc-lbl">Tasks done</div></div>
          <div class="sum-card sum-btc"><div class="sc-icon">🪙</div><div class="sc-val"><span class="dot-pulse"></span></div><div class="sc-lbl">Bitcoin · 24h</div></div>
          <div class="sum-card sum-fx"><div class="sc-icon">⚽</div><div class="sc-val"><span class="dot-pulse"></span></div><div class="sc-lbl">Next fixture</div></div>
          <div class="sum-card sum-np"><div class="sc-icon">🎵</div><div class="sc-val np-name">—</div><div class="sc-lbl">Now playing</div></div>
        </div>`);
      const WX_URL = "https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.006&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7";
      getJSON(WX_URL, 30).then((d) => {
        el.querySelector(".sum-wx .sc-val").textContent = Math.round(d.current.temperature_2m) + "°";
        const dayTemps = d.hourly.time.map((t, i) => ({ t, v: d.hourly.temperature_2m[i] })).filter((x) => new Date(x.t).getDate() === new Date().getDate());
        if (dayTemps.length) {
          el.querySelector(".sum-wx .sc-lbl").textContent = `New York · H ${Math.round(Math.max(...dayTemps.map((x) => x.v)))}° L ${Math.round(Math.min(...dayTemps.map((x) => x.v)))}°`;
        }
      }).catch(() => {
        el.querySelector(".sum-wx .sc-val").textContent = "—";
        el.querySelector(".sum-wx .sc-lbl").textContent = "Weather unavailable";
      });
      getJSON("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,ripple,dogecoin&sparkline=true&price_change_percentage=24h", 15).then((rows) => {
        const pct = rows[0]?.price_change_percentage_24h ?? null;
        const val = el.querySelector(".sum-btc .sc-val");
        if (pct == null) { val.textContent = "—"; return; }
        val.textContent = (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
        val.className = "sc-val " + (pct >= 0 ? "up" : "down");
      }).catch(() => {
        el.querySelector(".sum-btc .sc-val").textContent = "—";
        el.querySelector(".sum-btc .sc-lbl").textContent = "Bitcoin unavailable";
      });
      getJSON("https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=4328", 20).then((d) => {
        const e = (d.events || [])[0];
        const card = el.querySelector(".sum-fx");
        if (!e) { card.querySelector(".sc-val").textContent = "—"; return; }
        card.querySelector(".sc-val").innerHTML = `${esc(e.strHomeTeam.split(" ")[0])}<span style="color:var(--muted);font-weight:400"> v </span>${esc(e.strAwayTeam.split(" ")[0])}`;
        card.querySelector(".sc-lbl").textContent = e.dateEvent + " · PL";
      }).catch(() => {
        el.querySelector(".sum-fx .sc-val").textContent = "—";
        el.querySelector(".sum-fx .sc-lbl").textContent = "Fixtures unavailable";
      });
      const paintNp = () => {
        const t = MUSIC.queue[MUSIC.i];
        el.querySelector(".np-name").textContent = t ? (t.name.length > 14 ? t.name.slice(0, 13) + "…" : t.name) : "Nothing playing";
      };
      paintNp();
      document.addEventListener("np", paintNp);
      return el;
    },
  },
  weather: {
    title: "Weather", icon: "⛅", cat: "general", size: "m",
    render() {
      const el = div(loadingHTML("Connecting to Open-Meteo…"));
      const WMO = {
        0: ["Clear sky", "☀️"], 1: ["Mostly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁️"],
        45: ["Fog", "🌫️"], 48: ["Icy fog", "🌫️"], 51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"],
        61: ["Light rain", "🌧️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "⛈️"], 71: ["Light snow", "🌨️"], 73: ["Snow", "🌨️"],
        75: ["Heavy snow", "❄️"], 80: ["Showers", "🌦️"], 81: ["Showers", "🌧️"], 82: ["Violent showers", "⛈️"], 95: ["Thunderstorm", "⛈️"],
      };
      const url = "https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.006&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7";
      getJSON(url, 30).then((d) => {
        const cur = d.current;
        const [desc, icon] = WMO[cur.weather_code] || ["—", "🌡️"];
        const hours = [];
        const nowMs = Date.now();
        for (let i = 0; i < d.hourly.time.length && hours.length < 7; i++) {
          const h = new Date(d.hourly.time[i]);
          if (h.getTime() + 3600000 <= nowMs) continue;
          if (h.getHours() % 2 !== 0 && hours.length > 0) continue;
          const hc = WMO[d.hourly.weather_code[i]] || ["", "·"];
          const label = hours.length === 0 ? "Now" : String(h.getHours()).padStart(2, "0") + ":00";
          const temp = Math.round(d.hourly.temperature_2m[i]);
          let lo = temp, hi = temp;
          for (let j = i; j < Math.min(i + 2, d.hourly.time.length); j++) {
            const v = Math.round(d.hourly.temperature_2m[j]);
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
          const tempStr = lo === hi ? `${temp}°` : `<span class="wx-hi">${hi}°</span><span class="wx-lo">${lo}°</span>`;
          hours.push(`<span class="wx-hour"><small>${label}</small><em style="font-style:normal">${hc[1]}</em><b class="wx-hour-temps">${tempStr}</b></span>`);
        }
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const week = d.daily.time.map((t, i) => {
          const dt = new Date(t);
          const wc = WMO[d.daily.weather_code[i]] || ["", "·"];
          return `<span${i === 0 ? ' class="today"' : ""}><small>${i === 0 ? "Today" : dayNames[dt.getDay()]}</small><em style="font-style:normal" class="wxd">${wc[1]}</em><span class="wx-day-temps"><span class="wx-hi">${Math.round(d.daily.temperature_2m_max[i])}°</span><span class="wx-lo">${Math.round(d.daily.temperature_2m_min[i])}°</span></span></span>`;
        }).join("");
        const dayTemps = d.hourly.time
          .map((t, i) => ({ t, v: d.hourly.temperature_2m[i] }))
          .filter((x) => new Date(x.t).getDate() === new Date().getDate());
        const hi = Math.round(Math.max(...dayTemps.map((x) => x.v)));
        const lo = Math.round(Math.min(...dayTemps.map((x) => x.v)));
        el.innerHTML = `
          <div class="weather">
            <div class="wx-top">
              <div><span class="wx-temp">${Math.round(cur.temperature_2m)}°</span><p class="wx-desc">${desc}</p></div>
              <div style="font-size:40px;line-height:1;display:flex;align-items:flex-start;gap:4px">${icon}<a href="https://open-meteo.com/" target="_blank" style="font-size:11px;color:var(--muted);text-decoration:none;margin-top:4px" title="Open-Meteo">ℹ️</a></div>
            </div>
            <div class="wx-hours">${hours.join("")}</div>
            <div class="wx-week">${week}</div>
          </div>`;
      }).catch(() => { el.innerHTML = errorHTML("Open-Meteo unreachable"); });
      return el;
    },
    detail() {
      const el = div(loadingHTML());
      getJSON("https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.006&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=7", 60).then((d) => {
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        el.innerHTML = list(
          d.daily.time.map((t, i) => {
            const dt = new Date(t);
            return row(`${days[dt.getDay()]} ${dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, `${Math.round(d.daily.temperature_2m_max[i])}° / ${Math.round(d.daily.temperature_2m_min[i])}°`);
          })
        ).innerHTML;
      }).catch(() => { el.innerHTML = errorHTML(); });
      return el;
    },
  },
  clock: {
    title: "Clock", icon: "🕐", cat: "general", size: "m",
    render() {
      const el = div(`
        <div class="clock-hero">
          <div class="clock-digital"><strong></strong><span>Local time</span></div>
          <div class="analog-face">
            ${Array.from({ length: 12 }, (_, i) => `<b class="mark" style="transform:translateX(-50%) rotate(${i * 30}deg)"></b>`).join("")}
            <i class="hand-hour"></i><i class="hand-minute"></i><i class="hand-second"></i><b class="pin"></b>
          </div>
        </div>
        <div class="date-summary"><i>◫</i><div><strong class="d-main"></strong><span class="d-sub"></span></div></div>
        <div class="sun-times">
          <span>☀️<span><small>Sunrise</small><b>06:18</b></span></span>
          <span>🌙<span><small>Sunset</small><b>19:47</b></span></span>
        </div>
        <div class="alarm-head">⏰ Alarms <span class="alarm-count"></span></div>
        <div class="alarm-list"></div>
        <div class="wl-add alarm-add">
          <input type="time" class="note-area alarm-time" style="min-height:0;padding:6px 8px;flex:0 0 108px;font-size:12px"/>
          <input class="note-area alarm-label" placeholder="Label…" style="min-height:0;padding:6px 8px;flex:1;font-size:12px"/>
          <button class="lib-chip alarm-go" style="border-radius:10px">＋</button>
        </div>`);
      const dig = el.querySelector(".clock-digital strong");
      const hr = el.querySelector(".hand-hour");
      const mn = el.querySelector(".hand-minute");
      const sc = el.querySelector(".hand-second");
      const dMain = el.querySelector(".d-main");
      const dSub = el.querySelector(".d-sub");
      const tick = () => {
        const n = new Date();
        dig.textContent = n.toLocaleTimeString("en-US");
        const s = n.getSeconds(), m = n.getMinutes(), h = n.getHours() % 12;
        sc.style.transform = `translateX(-50%) rotate(${s * 6}deg)`;
        mn.style.transform = `translateX(-50%) rotate(${m * 6 + s * 0.1}deg)`;
        hr.style.transform = `translateX(-50%) rotate(${h * 30 + m * 0.5}deg)`;
        dMain.textContent = n.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        dSub.textContent = n.toLocaleDateString("en-US", { year: "numeric" }) + " · Local timezone";
      };
      tick();
      setInterval(tick, 1000);
      if (!state.alarms) state.alarms = [];
      const alarmList = el.querySelector(".alarm-list");
      const paintAlarms = () => {
        alarmList.innerHTML = state.alarms.map((a, i) =>
          `<div class="list-row"><span class="main-col"><b dir="ltr">${a.time}</b>${a.label ? " · " + esc(a.label) : ""}</span><button class="w-action alarm-toggle" data-i="${i}" title="On/Off" style="opacity:${a.enabled ? ".95" : ".4"}">${a.enabled ? "🔔" : "🔕"}</button><button class="w-action alarm-del" data-i="${i}" title="Delete" style="opacity:.5">✕</button></div>`
        ).join("") || `<p class="center-text" style="padding:2px 0;font-size:11px">No alarms yet — add one below</p>`;
        el.querySelector(".alarm-count").textContent = state.alarms.length ? `(${state.alarms.filter((a) => a.enabled).length}/${state.alarms.length})` : "";
        alarmList.querySelectorAll(".alarm-toggle").forEach((b) =>
          b.addEventListener("click", () => { state.alarms[+b.dataset.i].enabled = !state.alarms[+b.dataset.i].enabled; saveState(); paintAlarms(); })
        );
        alarmList.querySelectorAll(".alarm-del").forEach((b) =>
          b.addEventListener("click", () => { state.alarms.splice(+b.dataset.i, 1); saveState(); paintAlarms(); })
        );
      };
      paintAlarms();
      const addAlarm = () => {
        const t = el.querySelector(".alarm-time").value;
        if (!t) return;
        state.alarms.push({ time: t, label: el.querySelector(".alarm-label").value.trim(), enabled: true });
        el.querySelector(".alarm-label").value = "";
        saveState();
        paintAlarms();
      };
      el.querySelector(".alarm-go").addEventListener("click", addAlarm);
      const firedKeys = {};
      setInterval(() => {
        const n = new Date();
        const hm = `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
        state.alarms.forEach((a) => {
          if (!a.enabled || a.time !== hm) return;
          const key = n.toDateString() + hm + (a.label || "");
          if (firedKeys[key]) return;
          firedKeys[key] = true;
          toast(`⏰ Alarm${a.label ? " — " + a.label : ""} (${a.time})`);
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [0, 450, 900].forEach((delay) => {
              const o = ctx.createOscillator(), g = ctx.createGain();
              o.connect(g); g.connect(ctx.destination);
              o.frequency.value = 880; g.gain.value = 0.07;
              o.start(ctx.currentTime + delay / 1000);
              o.stop(ctx.currentTime + delay / 1000 + 0.22);
            });
          } catch (e) {}
        });
      }, 5000);
      return el;
    },
    detail() {
      const rows = [
        ["New York", "-5h"], ["London", "0h"], ["Berlin", "+1h"],
        ["Tehran", "+3:30h"], ["Tokyo", "+9h"], ["Sydney", "+11h"],
      ];
      return list(rows.map((r) => row(r[0], r[1])));
    },
  },
  calendar: {
    title: "Calendar", icon: "📅", cat: "general", size: "m",
    render() {
      const el = div(`
        <div class="cal-head">
          <button class="cal-nav prev">‹</button>
          <strong></strong>
          <button class="cal-nav next">›</button>
        </div>
        <div class="cal-weekdays">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<b>${d}</b>`).join("")}</div>
        <div class="cal-days"></div>`);
      const view = new Date();
      view.setDate(1);
      const strong = el.querySelector("strong");
      const daysBox = el.querySelector(".cal-days");
      if (!state.occasions) state.occasions = {};
      const mdKeyOf = (y, m, d) => `${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const openDayModal = (y, m, d) => {
        const mdKey = mdKeyOf(y, m, d);
        const fullKey = `${y}-${mdKey}`;
        const dtObj = new Date(y, m, d);
        const monthShort = dtObj.toLocaleDateString("en-US", { month: "short" });
        const EMOJIS = ["🎂", "💍", "💒", "🎓", "💐", "🎁", "✈️", "🎉"];
        const mEl = div(`
          <div class="occ-hero">
            <span class="occ-hero-num">${d}</span>
            <div class="occ-hero-txt"><b>${dtObj.toLocaleDateString("en-US", { weekday: "long" })}</b><small>${dtObj.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</small></div>
            <span class="occ-count-badge"></span>
          </div>
          <div class="occ-list"></div>
          <div class="occ-form">
            <div class="occ-emoji-row">
              ${EMOJIS.map((e2) => `<button type="button" class="occ-emoji-chip${e2 === EMOJIS[0] ? " active" : ""}" data-e="${e2}" title="${e2}">${e2}</button>`).join("")}
            </div>
            <input class="occ-title" maxlength="60" placeholder="Name it… e.g. Mom's birthday"/>
            <div class="occ-seg">
              <button type="button" class="occ-seg-btn active" data-mode="yearly">🔁 Every year</button>
              <button type="button" class="occ-seg-btn" data-mode="once">📆 Only in ${y}</button>
            </div>
            <button class="lib-chip occ-go">💾 Save occasion</button>
          </div>`);
        openModal(`Occasions · ${monthShort} ${d}`, mEl);
        let emoji = EMOJIS[0];
        let mode = "yearly";
        const list = mEl.querySelector(".occ-list");
        const countBadge = mEl.querySelector(".occ-count-badge");
        const occRow = (o, key, i, sub) =>
          `<div class="occ-item"><span class="occ-item-icon">${o.i}</span><span class="occ-item-main"><b>${esc(o.t)}</b><small>${sub}</small></span><button class="occ-del" data-key="${key}" data-i="${i}" title="Delete">✕</button></div>`;
        const paintOcc = () => {
          const yearly = state.occasions[mdKey] || [];
          const once = state.occasions[fullKey] || [];
          countBadge.textContent = yearly.length + once.length ? `${yearly.length + once.length} saved` : "empty";
          list.innerHTML =
            yearly.map((o, i) => occRow(o, mdKey, i, "Repeats every year")).join("") +
            once.map((o, i) => occRow(o, fullKey, i, `Only ${monthShort} ${d}, ${y}`)).join("") ||
            `<p class="occ-empty">Nothing saved for this day yet — add your first one below 👇</p>`;
          list.querySelectorAll(".occ-del").forEach((b) =>
            b.addEventListener("click", () => {
              const arr = state.occasions[b.dataset.key] || [];
              arr.splice(+b.dataset.i, 1);
              if (!arr.length) delete state.occasions[b.dataset.key];
              saveState();
              paintOcc();
              paint();
            })
          );
        };
        mEl.querySelectorAll(".occ-emoji-chip").forEach((c) =>
          c.addEventListener("click", () => {
            mEl.querySelectorAll(".occ-emoji-chip").forEach((x) => x.classList.remove("active"));
            c.classList.add("active");
            emoji = c.dataset.e;
          })
        );
        mEl.querySelectorAll(".occ-seg-btn").forEach((sb) =>
          sb.addEventListener("click", () => {
            mEl.querySelectorAll(".occ-seg-btn").forEach((x) => x.classList.remove("active"));
            sb.classList.add("active");
            mode = sb.dataset.mode;
          })
        );
        const save = () => {
          const title = mEl.querySelector(".occ-title").value.trim();
          if (!title) { mEl.querySelector(".occ-title").focus(); return; }
          const key = mode === "yearly" ? mdKey : fullKey;
          if (!state.occasions[key]) state.occasions[key] = [];
          state.occasions[key].push({ t: title, i: emoji });
          saveState();
          mEl.querySelector(".occ-title").value = "";
          paintOcc();
          paint();
          toast(`📌 "${title}" saved`);
        };
        mEl.querySelector(".occ-go").addEventListener("click", save);
        mEl.querySelector(".occ-title").addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
        paintOcc();
      };
      const paint = () => {
        const y = view.getFullYear(), m = view.getMonth();
        strong.textContent = view.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        const firstDow = new Date(y, m, 1).getDay();
        const count = new Date(y, m + 1, 0).getDate();
        const today = new Date();
        let html = "";
        for (let i = 0; i < firstDow; i++) html += `<span class="cal-empty"></span>`;
        for (let d = 1; d <= count; d++) {
          const isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
          const md = mdKeyOf(y, m, d);
          const hasOcc = !!(state.occasions[md] || state.occasions[`${y}-${md}`]);
          html += `<button class="cal-day${isToday ? " today" : ""}" data-d="${d}" title="${hasOcc ? "Has occasions — click to view" : "Click to add an occasion"}">${d}${hasOcc ? '<i class="cal-dot"></i>' : ""}</button>`;
        }
        daysBox.innerHTML = html;
        daysBox.querySelectorAll(".cal-day").forEach((b) =>
          b.addEventListener("click", () => openDayModal(y, m, +b.dataset.d))
        );
      };
      el.querySelector(".prev").addEventListener("click", () => { view.setMonth(view.getMonth() - 1); paint(); });
      el.querySelector(".next").addEventListener("click", () => { view.setMonth(view.getMonth() + 1); paint(); });
      paint();
      return el;
    },
  },
  notes: {
    title: "Notes", icon: "📝", cat: "general", size: "m",
    render() {
      const wrap = div(`<textarea class="note-area" placeholder="Write here..."></textarea>`);
      const ta = wrap.querySelector("textarea");
      ta.value = state.notes;
      const grow = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; };
      grow();
      let t;
      ta.addEventListener("input", () => {
        grow();
        clearTimeout(t);
        t = setTimeout(() => { state.notes = ta.value; saveState(); }, 400);
      });
      return wrap;
    },
  },
  todos: {
    title: "Today's Tasks", icon: "✅", cat: "general", size: "m",
    render() {
      const wrap = div(`<div class="todo-add"><input class="note-area todo-input" placeholder="New task…" style="min-height:0;padding:8px 10px;flex:1;font-size:12px"/><button class="lib-chip todo-go" style="border-radius:10px">＋</button></div><div class="todo-list"></div>`);
      const listBox = wrap.querySelector(".todo-list");
      const paint = () => {
        listBox.innerHTML =
          state.todos
            .map((td, i) => `<label class="todo-item ${td.done ? "done" : ""}"><input type="checkbox" data-i="${i}" ${td.done ? "checked" : ""}/><span>${esc(td.text)}</span></label>`)
            .join("") || `<p class="center-text" style="padding:10px 0">No tasks yet — add your first one above ☝️</p>`;
      };
      paint();
      listBox.addEventListener("change", (e) => {
        if (e.target.matches("input[type=checkbox]")) {
          state.todos[e.target.dataset.i].done = e.target.checked;
          saveState();
          paint();
        }
      });
      const addTask = () => {
        const inp = wrap.querySelector(".todo-input");
        const text = inp.value.trim();
        if (!text) return;
        state.todos.push({ text, done: false });
        inp.value = "";
        saveState();
        paint();
      };
      wrap.querySelector(".todo-go").addEventListener("click", addTask);
      wrap.querySelector(".todo-input").addEventListener("keydown", (e) => { if (e.key === "Enter") addTask(); });
      return wrap;
    },
  },
  quickLinks: {
    title: "Quick Links", icon: "🔗", cat: "general", size: "m",
    render() {
      const PLATFORMS = {
        Gmail: { color: "#EA4335", icon: "✉️", ctx: [
          { l: "Inbox", i: "📥", u: "https://mail.google.com/mail/u/0/#inbox" },
          { l: "Compose", i: "✏️", u: "https://mail.google.com/mail/u/0/#inbox?compose=new" },
          { l: "Drafts", i: "📝", u: "https://mail.google.com/mail/u/0/#drafts" },
          { l: "Sent", i: "📤", u: "https://mail.google.com/mail/u/0/#sent" },
          { l: "Starred", i: "⭐", u: "https://mail.google.com/mail/u/0/#starred" },
          { l: "Spam", i: "⚠️", u: "https://mail.google.com/mail/u/0/#spam" },
        ]},
        Drive: { color: "#FBBC04", icon: "📂", ctx: [
          { l: "My Drive", i: "💾", u: "https://drive.google.com/drive/my-drive" },
          { l: "Shared with me", i: "👥", u: "https://drive.google.com/drive/shared-with-me" },
          { l: "Recent", i: "🕐", u: "https://drive.google.com/drive/recent" },
          { l: "Starred", i: "⭐", u: "https://drive.google.com/drive/starred" },
          { l: "Trash", i: "🗑️", u: "https://drive.google.com/drive/trash" },
        ]},
        GitHub: { color: "#24292E", icon: "🐙", ctx: [
          { l: "Repositories", i: "📦", u: "https://github.com" },
          { l: "Pull Requests", i: "🔀", u: "https://github.com/pulls" },
          { l: "Issues", i: "🐛", u: "https://github.com/issues" },
          { l: "Gists", i: "📄", u: "https://gist.github.com" },
          { l: "Marketplace", i: "🏪", u: "https://github.com/marketplace" },
        ]},
        YouTube: { color: "#FF0000", icon: "▶️", ctx: [
          { l: "Home", i: "🏠", u: "https://youtube.com" },
          { l: "Trending", i: "🔥", u: "https://youtube.com/feed/trending" },
          { l: "Subscriptions", i: "📺", u: "https://youtube.com/feed/subscriptions" },
          { l: "Library", i: "📚", u: "https://youtube.com/feed/library" },
          { l: "History", i: "🕐", u: "https://youtube.com/feed/history" },
          { l: "Liked Videos", i: "👍", u: "https://youtube.com/playlist?list=LL" },
        ]},
        Spotify: { color: "#1DB954", icon: "🎵", ctx: [
          { l: "Home", i: "🏠", u: "https://open.spotify.com" },
          { l: "Search", i: "🔍", u: "https://open.spotify.com/search" },
          { l: "Your Library", i: "📚", u: "https://open.spotify.com/collection" },
          { l: "Liked Songs", i: "💚", u: "https://open.spotify.com/collection/tracks" },
          { l: "Recently Played", i: "🕐", u: "https://open.spotify.com/recently-played" },
        ]},
        LinkedIn: { color: "#0A66C2", icon: "💼", ctx: [
          { l: "Feed", i: "📰", u: "https://linkedin.com/feed" },
          { l: "My Network", i: "🤝", u: "https://linkedin.com/mynetwork" },
          { l: "Jobs", i: "💼", u: "https://linkedin.com/jobs" },
          { l: "Messaging", i: "💬", u: "https://linkedin.com/messaging" },
          { l: "Notifications", i: "🔔", u: "https://linkedin.com/notifications" },
        ]},
        X: { color: "#000000", icon: "𝕏", ctx: [
          { l: "Home", i: "🏠", u: "https://x.com/home" },
          { l: "Explore", i: "🔍", u: "https://x.com/explore" },
          { l: "Notifications", i: "🔔", u: "https://x.com/notifications" },
          { l: "Bookmarks", i: "🔖", u: "https://x.com/i/bookmarks" },
          { l: "Lists", i: "📋", u: "https://x.com/i/lists" },
          { l: "Profile", i: "👤", u: "https://x.com/settings/profile" },
        ]},
        Reddit: { color: "#FF4500", icon: "🤖", ctx: [
          { l: "Home", i: "🏠", u: "https://reddit.com" },
          { l: "Popular", i: "🔥", u: "https://reddit.com/r/popular" },
          { l: "All", i: "🌍", u: "https://reddit.com/r/all" },
          { l: "Saved", i: "🔖", u: "https://reddit.com/user/me/saved" },
          { l: "Messages", i: "💬", u: "https://reddit.com/message/inbox" },
        ]},
        Notion: { color: "#000000", icon: "📝", ctx: [
          { l: "Home", i: "🏠", u: "https://notion.so" },
          { l: "My Workspace", i: "💼", u: "https://notion.so" },
          { l: "Templates", i: "📋", u: "https://notion.so/templates" },
          { l: "Inbox", i: "📥", u: "https://notion.so/notifications" },
          { l: "Settings", i: "⚙️", u: "https://notion.so/settings" },
        ]},
        Figma: { color: "#A259FF", icon: "🎨", ctx: [
          { l: "Recent Files", i: "📁", u: "https://figma.com/recent" },
          { l: "Drafts", i: "📄", u: "https://figma.com/drafts" },
          { l: "Community", i: "🌍", u: "https://figma.com/community" },
          { l: "Plugins", i: "🧩", u: "https://figma.com/plugins" },
          { l: "Teams", i: "👥", u: "https://figma.com/teams" },
        ]},
        Slack: { color: "#4A154B", icon: "💬", ctx: [
          { l: "Home", i: "🏠", u: "https://slack.com/signin" },
          { l: "DMs", i: "✉️", u: "https://slack.com/signin" },
          { l: "Channels", i: "📢", u: "https://slack.com/signin" },
          { l: "Activity", i: "🔔", u: "https://slack.com/signin" },
          { l: "More", i: "⋯", u: "https://slack.com/signin" },
        ]},
        Dropbox: { color: "#0061FF", icon: "📦", ctx: [
          { l: "All Files", i: "📂", u: "https://dropbox.com/home" },
          { l: "Shared", i: "👥", u: "https://dropbox.com/shared" },
          { l: "Starred", i: "⭐", u: "https://dropbox.com/starred" },
          { l: "Recent", i: "🕐", u: "https://dropbox.com/recent" },
          { l: "Deleted", i: "🗑️", u: "https://dropbox.com/deleted" },
        ]},
      };
      const links = [
        { n: "Gmail", i: "https://api.iconify.design/logos/google-gmail.svg", u: "https://mail.google.com" },
        { n: "Drive", i: "https://api.iconify.design/logos/google-drive.svg", u: "https://drive.google.com" },
        { n: "Notion", i: "https://api.iconify.design/logos/notion-icon.svg", u: "https://notion.so" },
        { n: "GitHub", i: "https://cdn.simpleicons.org/github/181717", u: "https://github.com" },
        { n: "YouTube", i: "https://api.iconify.design/logos/youtube-icon.svg", u: "https://youtube.com" },
        { n: "Spotify", i: "https://api.iconify.design/logos/spotify-icon.svg", u: "https://spotify.com" },
        { n: "Figma", i: "https://api.iconify.design/logos/figma.svg", u: "https://figma.com" },
        { n: "Slack", i: "https://api.iconify.design/logos/slack-icon.svg", u: "https://slack.com" },
        { n: "LinkedIn", i: "https://api.iconify.design/logos/linkedin-icon.svg", u: "https://linkedin.com" },
        { n: "X", i: "https://cdn.simpleicons.org/x/000000", u: "https://x.com" },
        { n: "Reddit", i: "https://api.iconify.design/logos/reddit-icon.svg", u: "https://reddit.com" },
        { n: "Dropbox", i: "https://api.iconify.design/logos/dropbox.svg", u: "https://dropbox.com" },
      ];
      const wrap = div(
        `<div class="quick-links-grid">` +
          links.map((l) => `<a class="provider-tile" href="${l.u}" target="_blank" data-ctx='${l.n}'><span class="provider-logo"><img src="${l.i}" alt="${l.n}"/></span><small>${l.n}</small></a>`).join("") +
        `</div>`
      );
      wrap.querySelectorAll(".provider-tile").forEach((tile) => {
        tile.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          const platform = tile.dataset.ctx;
          const pData = PLATFORMS[platform];
          if (!pData || !pData.ctx.length) return;
          closeCtxMenu();
          const menu = document.createElement("div");
          menu.className = "ctx-menu";
          menu.style.position = "fixed";
          menu.style.left = e.clientX + "px";
          menu.style.top = e.clientY + "px";
          menu.style.zIndex = "9999";
          const header = document.createElement("div");
          header.className = "ctx-header";
          header.style.cssText = `padding:8px 14px;font-weight:800;font-size:12px;border-bottom:2px solid ${pData.color};color:${pData.color};display:flex;align-items:center;gap:6px`;
          header.innerHTML = `<span style="font-size:16px">${pData.icon}</span> ${platform}`;
          menu.appendChild(header);
          pData.ctx.forEach((item) => {
            const btn = document.createElement("a");
            btn.className = "ctx-item";
            btn.href = item.u;
            btn.target = "_blank";
            btn.innerHTML = `<span class="ctx-icon">${item.i}</span><span class="ctx-label">${item.l}</span>`;
            btn.addEventListener("click", () => closeCtxMenu());
            menu.appendChild(btn);
          });
          document.body.appendChild(menu);
          const rect = menu.getBoundingClientRect();
          if (rect.right > window.innerWidth) menu.style.left = (e.clientX - rect.width) + "px";
          if (rect.bottom > window.innerHeight) menu.style.top = (e.clientY - rect.height) + "px";
          document.addEventListener("click", closeCtxMenu, { once: true });
        });
      });
      return wrap;
    },
  },
  quote: {
    title: "Quote of the Day", icon: "💭", cat: "general", size: "s",
    render() {
      const el = div(loadingHTML());
      const local = () => {
        const quotes = [
          ["Simplicity is the ultimate sophistication.", "— Leonardo da Vinci"],
          ["Art washes away the dust of everyday life.", "— Pablo Picasso"],
          ["The best way to predict the future is to invent it.", "— Alan Kay"],
        ];
        const q = pick(quotes);
        el.innerHTML = `<div class="quote-box">${q[0]}<span class="quote-author">${q[1]} · offline mode</span></div>`;
      };
      getJSON("https://zenquotes.io/api/random", 720, {}, (d) => Array.isArray(d) && d[0] && d[0].q).then((d) => {
        el.innerHTML = `<div class="quote-box">"${decodeEntities(d[0].q)}"<span class="quote-author">— ${decodeEntities(d[0].a)} · zenquotes.io</span></div>`;
      }).catch(local);
      return el;
    },
  },

  liveScores: {
    title: "Recent Results", icon: "🔴", cat: "sports", size: "m",
    render() {
      const el = div(loadingHTML("Fetching TheSportsDB…"));
      getJSON("https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=4328", 20).then((d) => {
        const evs = d.events || [];
        if (!evs.length) { el.innerHTML = errorHTML("No recent events"); return; }
        const byDay = {};
        evs.slice(0, 12).forEach((e) => { (byDay[e.dateEvent] = byDay[e.dateEvent] || []).push(e); });
        el.innerHTML = Object.entries(byDay).map(([day, ms]) =>
          `<p class="ls-day">${new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}${ms[0].intRound ? ` · MW ${ms[0].intRound}` : ""}</p>` +
          ms.map((e) => row(
            `<b>${e.strHomeTeam} — ${e.strAwayTeam}</b><small style="display:block;color:var(--muted);font-size:10px">${[e.strTime ? "⏱ " + e.strTime.slice(0, 5) : "", e.strVenue ? "📍 " + esc(e.strVenue) : "", e.intAttendance ? "👥 " + Number(e.intAttendance).toLocaleString("en-US") : ""].filter(Boolean).join(" · ") || "&nbsp;"}</small>`,
            `<b dir="ltr">${e.intHomeScore ?? "-"} : ${e.intAwayScore ?? "-"}</b>`
          )).join("")
        ).join("") + `<p class="center-text" style="margin-top:8px;font-size:10px">thesportsdb.com</p>`;
      }).catch(() => { el.innerHTML = errorHTML("TheSportsDB unreachable"); });
      return el;
    },
    detail() {
      const el = div(loadingHTML());
      getJSON("https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=4328", 20).then((d) => {
        el.innerHTML = list((d.events || []).slice(0, 14).map((e) =>
          row(`${e.dateEvent} · ${e.strHomeTeam} — ${e.strAwayTeam}`, `${e.intHomeScore ?? "-"}:${e.intAwayScore ?? "-"}`)
        )).innerHTML;
      }).catch(() => { el.innerHTML = errorHTML(); });
      return el;
    },
  },
  matchSchedule: {
    title: "Upcoming Fixtures", icon: "📅", cat: "sports", size: "m",
    render() {
      const el = div(loadingHTML("Fetching TheSportsDB…"));
      getJSON("https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=4328", 20).then((d) => {
        const evs = (d.events || []).slice(0, 16);
        if (!evs.length) { el.innerHTML = errorHTML("No upcoming events"); return; }
        const byDay = {};
        evs.forEach((e) => { (byDay[e.dateEvent] = byDay[e.dateEvent] || []).push(e); });
        el.innerHTML = Object.entries(byDay).map(([day, ms]) =>
          `<p class="ls-day">${new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}${ms[0].intRound ? ` · MW ${ms[0].intRound}` : ""}</p>` +
          ms.map((e) => row(
            `${e.strHomeTeam} — ${e.strAwayTeam}`,
            [e.strTime ? e.strTime.slice(0, 5) : "", e.strVenue ? esc(e.strVenue.split(",")[0]) : ""].filter(Boolean).join(" · ") || "TBD"
          )).join("")
        ).join("") + `<p class="center-text" style="margin-top:8px;font-size:10px">thesportsdb.com</p>`;
      }).catch(() => { el.innerHTML = errorHTML("TheSportsDB unreachable"); });
      return el;
    },
  },
  leagueTable: {
    title: "Top 3 — Big Five Leagues", icon: "🏅", cat: "sports", size: "m",
    render() {
      const LEAGUES = [["Premier League", 4328], ["La Liga", 4335], ["Serie A", 4332], ["Bundesliga", 4331], ["Ligue 1", 4334]];
      const MEDALS = ["🥇", "🥈", "🥉"];
      const wrap = div(`<div class="mood-chips lg-chips"></div><div class="lg-body">${loadingHTML()}</div>`);
      const box = wrap.querySelector(".lg-body");
      let active = null;
      const load = (name, id, season) => {
        active = id;
        wrap.querySelectorAll(".mood-chip").forEach((x) => x.classList.toggle("active", x.dataset.id == id));
        box.innerHTML = loadingHTML(`Fetching ${name} standings…`);
        getJSON(`https://www.thesportsdb.com/api/v1/json/3/lookuptable.php?l=${id}&s=${season}`, 60).then((d) => {
          if (!d.table || !d.table.length) throw new Error("empty");
          box.innerHTML =
            d.table.slice(0, 3).map((t, i) =>
              row(
                `<span style="font-size:15px">${MEDALS[i]}</span> <b>${t.intRank}. ${esc(t.strTeam)}</b><small style="display:block;color:var(--muted);font-size:10px">${t.intPlayed ?? "—"} played · ${t.intWin ?? "—"}W ${t.intDraw ?? "—"}D ${t.intLoss ?? "—"}L</small>`,
                `<b>${t.intPoints} pts</b><small style="display:block;color:var(--muted);font-size:10px;text-align:right">GD ${t.intGoalDifference > 0 ? "+" : ""}${t.intGoalDifference ?? 0}</small>`
              )
            ).join("") +
            `<p class="center-text" style="margin-top:8px;font-size:10px">${esc(name)} · ${season} · thesportsdb.com</p>`;
        }).catch(() => {
          if (season !== "2024-2025") load(name, id, "2024-2025");
          else box.innerHTML = errorHTML("Standings unavailable");
        });
      };
      LEAGUES.forEach(([name, id]) => {
        const b = document.createElement("button");
        b.className = "mood-chip";
        b.dataset.id = id;
        b.textContent = name;
        b.addEventListener("click", () => { if (active !== id) load(name, id, "2025-2026"); });
        wrap.querySelector(".lg-chips").appendChild(b);
      });
      load(LEAGUES[0][0], LEAGUES[0][1], "2025-2026");
      return wrap;
    },
    detail() {
      const el = div(loadingHTML());
      const load = (season) => getJSON(`https://www.thesportsdb.com/api/v1/json/3/lookuptable.php?l=4328&s=${season}`, 60)
        .then((d) => {
          if (!d.table || !d.table.length) throw new Error("empty");
          el.innerHTML = list(d.table.slice(0, 14).map((t) =>
            row(`${t.intRank}. ${t.strTeam}`, `${t.intPoints} pts · GD ${t.intGoalDifference}`)
          )).innerHTML + `<p class="center-text" style="margin-top:8px;font-size:10px">Premier League full table · season ${season}</p>`;
        });
      load("2025-2026").catch(() => load("2024-2025")).catch(() => { el.innerHTML = errorHTML(); });
      return el;
    },
  },

  multiScores: {
    title: "Scores Across Leagues", icon: "🌍", cat: "sports", size: "m",
    render() {
      const LEAGUES = [["English PL", 4328], ["La Liga", 4335], ["Serie A", 4332], ["Bundesliga", 4331], ["Ligue 1", 4334], ["UCL", 4480], ["NBA", 4387], ["NHL", 4380], ["MLB", 4424]];
      const wrap = div(`<div class="mood-chips lg-chips"></div><div class="lg-body">${loadingHTML()}</div>`);
      const box = wrap.querySelector(".lg-body");
      let active = null;
      const load = (name, id) => {
        active = id;
        wrap.querySelectorAll(".mood-chip").forEach((x) => x.classList.toggle("active", x.dataset.id == id));
        box.innerHTML = loadingHTML(`Fetching ${name} results…`);
        getJSON(`https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=${id}`, 20).then((d) => {
          const evs = (d.events || []).slice(0, 6);
          box.innerHTML = evs.map((e) =>
            row(`${e.strHomeTeam} — ${e.strAwayTeam}`, `<b dir="ltr">${e.intHomeScore ?? "-"} : ${e.intAwayScore ?? "-"}</b>`)
          ).join("") || errorHTML("No recent events");
        }).catch(() => { box.innerHTML = errorHTML("TheSportsDB unreachable"); });
      };
      LEAGUES.forEach(([name, id]) => {
        const b = document.createElement("button");
        b.className = "mood-chip";
        b.dataset.id = id;
        b.textContent = name;
        b.addEventListener("click", () => { if (active !== id) load(name, id); });
        wrap.querySelector(".lg-chips").appendChild(b);
      });
      load(LEAGUES[0][0], LEAGUES[0][1]);
      return wrap;
    },
  },
  teamFinder: {
    title: "Team Finder", icon: "🔎", cat: "sports", size: "m",
    render() {
      const wrap = div(`<div class="wl-add"><input class="note-area tf-input" placeholder="Search a team (e.g. Arsenal)…" style="min-height:0;padding:8px 10px;flex:1;font-size:12px"/><button class="lib-chip tf-go" style="border-radius:10px">🔍</button></div><div class="tf-body"><p class="center-text" style="padding:8px 0">Search any football team worldwide</p></div>`);
      const body = wrap.querySelector(".tf-body");
      const run = async () => {
        const q = wrap.querySelector(".tf-input").value.trim();
        if (!q) return;
        body.innerHTML = loadingHTML("Searching TheSportsDB…");
        try {
          const d = await getJSON(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(q)}`, 60);
          const t = (d.teams || [])[0];
          if (!t) { body.innerHTML = errorHTML("No team found"); return; }
          const socialLinks = [];
          if (t.strFacebook) socialLinks.push(`<a href="https://facebook.com/${esc(t.strFacebook)}" target="_blank" class="social-icon" title="Facebook"><svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>`);
          if (t.strTwitter) socialLinks.push(`<a href="https://x.com/${esc(t.strTwitter)}" target="_blank" class="social-icon" title="X"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>`);
          if (t.strInstagram) socialLinks.push(`<a href="https://instagram.com/${esc(t.strInstagram)}" target="_blank" class="social-icon" title="Instagram"><svg width="16" height="16" viewBox="0 0 24 24"><defs><linearGradient id="ig" x1="0" y1="24" x2="24" y2="0"><stop offset="0%" stop-color="#feda75"/><stop offset="25%" stop-color="#fa7e1e"/><stop offset="50%" stop-color="#d62976"/><stop offset="75%" stop-color="#962fbf"/><stop offset="100%" stop-color="#4f5bd5"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#ig)"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="17.5" cy="6.5" r="1.3" fill="#fff"/></svg></a>`);
          if (t.strWebsite) socialLinks.push(`<a href="${esc(t.strWebsite.startsWith('http') ? t.strWebsite : 'https://' + t.strWebsite)}" target="_blank" class="social-icon" title="Website"><svg width="16" height="16" viewBox="0 0 24 24" fill="#6B7280"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg></a>`);
          const keywords = t.strKeywords ? t.strKeywords.split(",").slice(0, 3).map((k) => `<span class="tf-keywords">${esc(k.trim())}</span>`).join(" ") : "";
          body.innerHTML = `
            ${t.strBanner ? `<div style="width:calc(100% + 12px);margin:-6px -6px 0;height:80px;background:url(${t.strBanner}) center/cover;border-radius:var(--gd-radius) var(--gd-radius) 0 0"></div>` : ""}
            <div style="display:flex;align-items:center;gap:10px;padding:8px 2px 4px">
              ${t.strBadge ? `<img src="${t.strBadge}" alt="" class="tf-badge" style="width:52px;height:52px;object-fit:contain"/>` : ""}
              <div style="flex:1;min-width:0"><b style="font-size:15px">${esc(t.strTeam)}</b><small style="display:block;color:var(--muted);font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.strLeague || "")} · Est. ${esc(t.intFormedYear || "?")}</small></div>
            </div>
            <div class="tf-info-grid">
              ${t.strStadium ? `<div class="tf-info-item"><span>🏟️ ${esc(t.strStadium)}</span><span>${t.intStadiumCapacity ? Number(t.intStadiumCapacity).toLocaleString("en-US") : ""}</span></div>` : ""}
              ${t.strLocation ? `<div class="tf-info-item"><span>📍 ${esc(t.strLocation)}</span><span>${esc(t.strCountry || "")}</span></div>` : ""}
              ${t.strGender ? `<div class="tf-info-item"><span>⚽ ${esc(t.strGender || "—")}</span><span></span></div>` : ""}
              ${t.strLeague2 ? `<div class="tf-info-item"><span>🏆 ${esc(t.strLeague2)}</span><span></span></div>` : ""}
            </div>
            ${keywords ? `<div style="display:flex;flex-wrap:wrap;gap:4px;padding:4px 0 2px">${keywords}</div>` : ""}
            <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0 2px">
              <span style="font-size:9px;color:var(--muted)">thesportsdb.com</span>
              <div style="display:flex;gap:8px">${socialLinks.join("")}</div>
            </div>`;
        } catch (e) { body.innerHTML = errorHTML("TheSportsDB unreachable"); }
      };
      wrap.querySelector(".tf-go").addEventListener("click", run);
      wrap.querySelector(".tf-input").addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
      return wrap;
    },
  },

  f1Standings: {
    title: "F1 Drivers Standings", icon: "🏎️", cat: "sports", sub: "f1", size: "m",
    render() {
      const el = div(loadingHTML("Loading F1 standings…"));
      getJSON("https://api.jolpi.ca/ergast/f1/current/driverStandings.json", 300).then((d) => {
        const list = d.MRData.StandingsTable.StandingsLists[0]?.DriverStandings || [];
        el.innerHTML = `<div class="league-table"><table><thead><tr><th>#</th><th>Driver</th><th>Team</th><th>Pts</th></tr></thead><tbody>` +
          list.slice(0, 6).map((s, i) => `<tr><td>${s.position}</td><td>${esc(s.Driver.givenName + " " + s.Driver.familyName)}</td><td>${esc(s.Constructors[0]?.name || "—")}</td><td><b>${s.points}</b></td></tr>`).join("") +
          `</tbody></table></div>`;
      }).catch(() => { el.innerHTML = errorHTML("F1 API unreachable"); });
      return el;
    },
  },

  f1ConstructorStandings: {
    title: "F1 Constructors", icon: "🏭", cat: "sports", sub: "f1", size: "m",
    render() {
      const el = div(loadingHTML("Loading constructor standings…"));
      getJSON("https://api.jolpi.ca/ergast/f1/current/constructorStandings.json", 300).then((d) => {
        const list = d.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings || [];
        el.innerHTML = `<div class="league-table"><table><thead><tr><th>#</th><th>Constructor</th><th>Nationality</th><th>Pts</th></tr></thead><tbody>` +
          list.slice(0, 6).map((s) => `<tr><td>${s.position}</td><td><b>${esc(s.Constructor.name)}</b></td><td>${esc(s.Constructor.nationality || "—")}</td><td><b>${s.points}</b></td></tr>`).join("") +
          `</tbody></table></div>`;
      }).catch(() => { el.innerHTML = errorHTML("F1 API unreachable"); });
      return el;
    },
  },

  f1Schedule: {
    title: "F1 Schedule", icon: "📅", cat: "sports", sub: "f1", size: "m",
    render() {
      const el = div(loadingHTML("Loading F1 schedule…"));
      getJSON("https://api.jolpi.ca/ergast/f1/current.json", 300).then((d) => {
        const races = d.MRData.RaceTable.Races || [];
        el.innerHTML = `<div class="league-table"><table><thead><tr><th>Round</th><th>Grand Prix</th><th>Circuit</th><th>Date</th></tr></thead><tbody>` +
          races.slice(0, 6).map((r) => `<tr><td>${r.round}</td><td><b>${esc(r.raceName)}</b></td><td>${esc(r.Circuit.circuitName)}</td><td>${r.date}</td></tr>`).join("") +
          `</tbody></table></div>`;
      }).catch(() => { el.innerHTML = errorHTML("F1 API unreachable"); });
      return el;
    },
  },

  f1Results: {
    title: "F1 Latest Results", icon: "🏆", cat: "sports", sub: "f1", size: "m",
    render() {
      const el = div(loadingHTML("Loading latest F1 results…"));
      getJSON("https://api.jolpi.ca/ergast/f1/current/last/results.json", 300).then((d) => {
        const results = d.MRData.RaceTable.Races[0]?.Results || [];
        const raceName = d.MRData.RaceTable.Races[0]?.raceName || "Last Race";
        el.innerHTML = `<p style="font-weight:700;margin:0 0 6px;font-size:13px">${esc(raceName)}</p><div class="league-table"><table><thead><tr><th>#</th><th>Driver</th><th>Team</th><th>Time</th></tr></thead><tbody>` +
          results.slice(0, 6).map((r) => `<tr><td>${r.position}</td><td>${esc(r.Driver.givenName + " " + r.Driver.familyName)}</td><td>${esc(r.Constructor.name)}</td><td>${r.Time?.time || r.status}</td></tr>`).join("") +
          `</tbody></table></div>`;
      }).catch(() => { el.innerHTML = errorHTML("F1 API unreachable"); });
      return el;
    },
  },

  f1TeamFinder: {
    title: "F1 Team Finder", icon: "🔍", cat: "sports", sub: "f1", size: "m",
    render() {
      const wrap = div(`<div class="wl-add"><input class="note-area tf-input" placeholder="Search F1 team (e.g. Red Bull)…" style="min-height:0;padding:8px 10px;flex:1;font-size:12px"/><button class="lib-chip tf-go" style="border-radius:10px">🔍</button></div><div class="tf-body"><p class="center-text" style="padding:8px 0">Search any Formula 1 team</p></div>`);
      const body = wrap.querySelector(".tf-body");
      const run = async () => {
        const q = wrap.querySelector(".tf-input").value.trim();
        if (!q) return;
        body.innerHTML = loadingHTML("Searching F1 teams…");
        try {
          const d = await getJSON(`https://api.jolpi.ca/ergast/f1/current/constructors.json`, 60);
          const constructors = d.MRData.ConstructorTable.Constructors || [];
          const found = constructors.find((c) => c.name.toLowerCase().includes(q.toLowerCase()));
          if (!found) { body.innerHTML = errorHTML("No F1 team found"); return; }
          const sd = await getJSON(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(found.name)}`, 60);
          const t = (sd.teams || [])[0];
          const socialLinks = [];
          if (t?.strInstagram) socialLinks.push(`<a href="https://instagram.com/${esc(t.strInstagram)}" target="_blank" class="social-icon" title="Instagram"><svg width="16" height="16" viewBox="0 0 24 24"><defs><linearGradient id="ig" x1="0" y1="24" x2="24" y2="0"><stop offset="0%" stop-color="#feda75"/><stop offset="25%" stop-color="#fa7e1e"/><stop offset="50%" stop-color="#d62976"/><stop offset="75%" stop-color="#962fbf"/><stop offset="100%" stop-color="#4f5bd5"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#ig)"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="17.5" cy="6.5" r="1.3" fill="#fff"/></svg></a>`);
          if (t?.strFacebook) socialLinks.push(`<a href="https://facebook.com/${esc(t.strFacebook)}" target="_blank" class="social-icon" title="Facebook"><svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>`);
          if (t?.strTwitter) socialLinks.push(`<a href="https://x.com/${esc(t.strTwitter)}" target="_blank" class="social-icon" title="X"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>`);
          const colors = t ? [t.strColour1, t.strColour2, t.strColour3].filter(Boolean) : [];
          const colorStrip = colors.length ? `<div class="tf-color-strip" style="display:flex;height:6px;border-radius:999px;overflow:hidden;margin-top:8px">${colors.map((c) => `<div style="flex:1;background:${c}"></div>`).join("")}</div>` : "";
          body.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;padding:4px 2px 6px">
              ${t?.strBadge ? `<img src="${t.strBadge}" alt="" style="width:44px;height:44px;object-fit:contain"/>` : ""}
              <div style="flex:1;min-width:0"><b style="font-size:13px">${esc(found.name)}</b><small style="display:block;color:var(--muted);font-size:10px">Formula 1 · ${esc(found.nationality || "—")}</small></div>
            </div>
            <div class="tf-info-grid">
              ${t?.strStadium ? `<div class="tf-info-item"><span>⚙️ ${esc(t.strStadium)}</span><span></span></div>` : ""}
              ${t?.strLocation ? `<div class="tf-info-item"><span>📍 ${esc(t.strLocation)}</span><span>${esc(t.strCountry || "")}</span></div>` : ""}
            </div>
            ${colorStrip}
            ${socialLinks.length ? `<div class="tf-social" style="display:flex;gap:8px;justify-content:flex-end;padding:4px 0">${socialLinks.join("")}</div>` : ""}`;
        } catch (e) { body.innerHTML = errorHTML("Search failed"); }
      };
      wrap.querySelector(".tf-go").addEventListener("click", run);
      wrap.querySelector(".tf-input").addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
      return wrap;
    },
  },

  nbaStandings: {
    title: "NBA Standings", icon: "🏀", cat: "sports", sub: "basketball", size: "m",
    render() {
      const el = div(loadingHTML("Loading NBA standings…"));
      getJSON("https://www.balldontlie.io/api/v1/games?per_page=1&seasons=2024", 300).then(() => {
        getJSON("https://site.api.espn.com/apis/v2/sports/basketball/nba/standings", 300).then((d) => {
          const groups = d.children || [];
          const rows = [];
          groups.forEach((g) => {
            (g.standings?.entries || []).forEach((e) => {
              const name = e.team?.displayName || "—";
              const stats = {};
              (e.stats || []).forEach((s) => { stats[s.name] = s.displayValue; });
              rows.push({ name, conf: g.name, wins: parseInt(stats.wins) || 0, losses: parseInt(stats.losses) || 0, pct: stats.winPercent || "—" });
            });
          });
          rows.sort((a, b) => b.wins - a.wins);
          el.innerHTML = `<div class="league-table"><table><thead><tr><th>#</th><th>Team</th><th>Conf</th><th>W</th><th>L</th><th>%</th></tr></thead><tbody>` +
            rows.slice(0, 15).map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.conf)}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.pct}</td></tr>`).join("") +
            `</tbody></table></div>`;
        }).catch(() => { el.innerHTML = errorHTML("ESPN API unreachable"); });
      }).catch(() => { el.innerHTML = errorHTML("NBA API unreachable"); });
      return el;
    },
  },

  nbaSchedule: {
    title: "NBA Schedule", icon: "📅", cat: "sports", sub: "basketball", size: "m",
    render() {
      const el = div(loadingHTML("Loading NBA schedule…"));
      const today = new Date().toISOString().slice(0, 10);
      getJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today.replace(/-/g, "")}`, 300).then((d) => {
        const events = d.events || [];
        if (!events.length) { el.innerHTML = `<p class="center-text" style="padding:10px">No games today</p>`; return; }
        el.innerHTML = `<div class="league-table"><table><thead><tr><th>Home</th><th>Score</th><th>Away</th><th>Status</th></tr></thead><tbody>` +
          events.map((ev) => {
            const comp = ev.competitions?.[0] || {};
            const teams = comp.competitors || [];
            const home = teams.find((t) => t.homeAway === "home") || teams[0] || {};
            const away = teams.find((t) => t.homeAway === "away") || teams[1] || {};
            const hScore = home.score || "—";
            const aScore = away.score || "—";
            const status = comp.status?.type?.shortDetail || "—";
            return `<tr><td><b>${esc(home.team?.shortDisplayName || "—")}</b></td><td>${hScore} - ${aScore}</td><td><b>${esc(away.team?.shortDisplayName || "—")}</b></td><td>${esc(status)}</td></tr>`;
          }).join("") +
          `</tbody></table></div>`;
      }).catch(() => { el.innerHTML = errorHTML("ESPN API unreachable"); });
      return el;
    },
  },

  nbaScores: {
    title: "NBA Live Scores", icon: "🔴", cat: "sports", sub: "basketball", size: "m",
    render() {
      const el = div(loadingHTML("Loading NBA scores…"));
      getJSON("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard", 60).then((d) => {
        const events = d.events || [];
        if (!events.length) { el.innerHTML = `<p class="center-text" style="padding:10px">No live games</p>`; return; }
        el.innerHTML = `<div class="league-table"><table><thead><tr><th>Home</th><th>Score</th><th>Away</th><th>Status</th></tr></thead><tbody>` +
          events.map((ev) => {
            const comp = ev.competitions?.[0] || {};
            const teams = comp.competitors || [];
            const home = teams.find((t) => t.homeAway === "home") || teams[0] || {};
            const away = teams.find((t) => t.homeAway === "away") || teams[1] || {};
            return `<tr><td><b>${esc(home.team?.shortDisplayName || "—")}</b></td><td>${home.score || "—"} - ${away.score || "—"}</td><td><b>${esc(away.team?.shortDisplayName || "—")}</b></td><td>${esc(comp.status?.type?.shortDetail || "—")}</td></tr>`;
          }).join("") +
          `</tbody></table></div>`;
      }).catch(() => { el.innerHTML = errorHTML("ESPN API unreachable"); });
      return el;
    },
  },

  nbaPlayers: {
    title: "NBA Top Players", icon: "⛹️", cat: "sports", sub: "basketball", size: "m",
    render() {
      const el = div(loadingHTML("Loading NBA players…"));
      getJSON("https://www.balldontlie.io/api/v1/players?per_page=15&search=james", 300).then((d) => {
        const players = d.data || [];
        el.innerHTML = `<div class="league-table"><table><thead><tr><th>Name</th><th>Team</th><th>Pos</th><th>Ht</th></tr></thead><tbody>` +
          players.map((p) => `<tr><td><b>${esc(p.first_name + " " + p.last_name)}</b></td><td>${esc(p.team?.full_name || "—")}</td><td>${esc(p.position || "—")}</td><td>${p.height_feet ? `${p.height_feet}'${p.height_inches}"` : "—"}</td></tr>`).join("") +
          `</tbody></table></div>`;
      }).catch(() => { el.innerHTML = errorHTML("NBA API unreachable"); });
      return el;
    },
  },

  nbaTeamFinder: {
    title: "NBA Team Finder", icon: "🔎", cat: "sports", sub: "basketball", size: "m",
    render() {
      const wrap = div(`<div class="wl-add"><input class="note-area tf-input" placeholder="Search NBA team (e.g. Lakers)…" style="min-height:0;padding:8px 10px;flex:1;font-size:12px"/><button class="lib-chip tf-go" style="border-radius:10px">🔍</button></div><div class="tf-body"><p class="center-text" style="padding:8px 0">Search any NBA team</p></div>`);
      const body = wrap.querySelector(".tf-body");
      const run = async () => {
        const q = wrap.querySelector(".tf-input").value.trim();
        if (!q) return;
        body.innerHTML = loadingHTML("Searching NBA teams…");
        try {
          const d = await getJSON(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(q)}`, 60);
          const t = (d.teams || [])[0];
          if (!t || t.strSport !== "Basketball") { body.innerHTML = errorHTML("No NBA team found"); return; }
          const socialLinks = [];
          if (t.strInstagram) socialLinks.push(`<a href="https://instagram.com/${esc(t.strInstagram)}" target="_blank" class="social-icon" title="Instagram"><svg width="16" height="16" viewBox="0 0 24 24"><defs><linearGradient id="ig" x1="0" y1="24" x2="24" y2="0"><stop offset="0%" stop-color="#feda75"/><stop offset="25%" stop-color="#fa7e1e"/><stop offset="50%" stop-color="#d62976"/><stop offset="75%" stop-color="#962fbf"/><stop offset="100%" stop-color="#4f5bd5"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#ig)"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="17.5" cy="6.5" r="1.3" fill="#fff"/></svg></a>`);
          if (t.strFacebook) socialLinks.push(`<a href="https://facebook.com/${esc(t.strFacebook)}" target="_blank" class="social-icon" title="Facebook"><svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>`);
          if (t.strTwitter) socialLinks.push(`<a href="https://x.com/${esc(t.strTwitter)}" target="_blank" class="social-icon" title="X"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>`);
          const colors = t.strColour1 ? [t.strColour1, t.strColour2, t.strColour3].filter(Boolean) : [];
          const colorStrip = colors.length ? `<div class="tf-color-strip" style="display:flex;height:6px;border-radius:999px;overflow:hidden;margin-top:8px">${colors.map((c) => `<div style="flex:1;background:${c}"></div>`).join("")}</div>` : "";
          const keywords = t.strKeywords ? t.strKeywords.split(",").slice(0, 4).map((k) => `<span class="tf-keywords">${esc(k.trim())}</span>`).join(" ") : "";
          body.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;padding:4px 2px 6px">
              ${t.strBadge ? `<img src="${t.strBadge}" alt="" style="width:44px;height:44px;object-fit:contain"/>` : ""}
              <div style="flex:1;min-width:0"><b style="font-size:13px">${esc(t.strTeam)}</b><small style="display:block;color:var(--muted);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.strLeague || "")} · Est. ${esc(t.intFormedYear || "?")}</small></div>
            </div>
            <div class="tf-info-grid">
              ${t.strStadium ? `<div class="tf-info-item"><span>🏀 ${esc(t.strStadium)}</span><span>${t.intStadiumCapacity ? Number(t.intStadiumCapacity).toLocaleString("en-US") : ""}</span></div>` : ""}
              ${t.strLocation ? `<div class="tf-info-item"><span>📍 ${esc(t.strLocation)}</span><span>${esc(t.strCountry || "")}</span></div>` : ""}
            </div>
            ${colorStrip}
            ${keywords ? `<div style="display:flex;flex-wrap:wrap;gap:4px;padding:6px 0 2px">${keywords}</div>` : ""}
            ${socialLinks.length ? `<div class="tf-social" style="display:flex;gap:8px;justify-content:flex-end;padding:4px 0">${socialLinks.join("")}</div>` : ""}`;
        } catch (e) { body.innerHTML = errorHTML("Search failed"); }
      };
      wrap.querySelector(".tf-go").addEventListener("click", run);
      wrap.querySelector(".tf-input").addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
      return wrap;
    },
  },

  cryptoWatchlist: {
    title: "Crypto Watchlist", icon: "🪙", cat: "finance", size: "m",
    render() {
      const el = div(loadingHTML("Fetching CoinGecko…"));
      const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,ripple,dogecoin&sparkline=true&price_change_percentage=24h";
      const PAPRIKA = {
        "btc-bitcoin": ["Bitcoin", "BTC"], "eth-ethereum": ["Ethereum", "ETH"],
        "sol-solana": ["Solana", "SOL"], "xrp-xrp": ["XRP", "XRP"],
        "doge-dogecoin": ["Dogecoin", "DOGE"],
      };
      let retried = false;
      const loadPaprika = () =>
        getJSON("https://api.coinpaprika.com/v1/tickers?quotes=USD", 15, {}, (d) => Array.isArray(d) && d.length > 50).then((rows) => {
          el.innerHTML = rows.filter((r) => PAPRIKA[r.id]).map((r) => {
            const [name, sym] = PAPRIKA[r.id];
            const q = r.quotes.USD;
            return marketRow(`https://static.coinpaprika.com/coin/${r.id}/logo.png`, name, sym, q.price.toLocaleString("en-US", { maximumFractionDigits: q.price < 5 ? 4 : 2 }), q.percent_change_24h ?? 0, [q.price * 0.99, q.price * 0.995, q.price * 0.998, q.price]);
          }).join("") + `<p class="center-text" style="margin-top:8px;font-size:10px">Live feed · coinpaprika.com</p>`;
        });
      const load = () => getJSON(url, 15, {}, Array.isArray).then((rows) => {
        if (!rows.length) throw new Error("empty");
        el.innerHTML = rows
          .map((c) => {
            const pct = c.price_change_percentage_24h ?? 0;
            const spark = (c.sparkline_in_7d?.price || []).filter((_, i) => i % 6 === 0);
            return marketRow(c.image, c.name, c.symbol.toUpperCase(), c.price.toLocaleString("en-US", { maximumFractionDigits: c.price < 5 ? 4 : 2 }), pct, spark.length > 3 ? spark : [1, 2, 3]);
          })
          .join("");
      }).catch(() => {
        if (!retried) { retried = true; el.innerHTML = loadingHTML("CoinGecko busy — retrying…"); setTimeout(load, 3000); return; }
        loadPaprika().catch(() => { el.innerHTML = errorHTML("All crypto feeds unreachable"); });
      });
      load();
      return el;
    },
  },
  stocks: {
    title: "Stocks & FX", icon: "📊", cat: "finance", size: "m",
    render() {
      const el = div(`<p class="center-text" style="font-size:10.5px;color:var(--muted);padding-bottom:4px">STOCKS · delayed quotes</p><div class="stock-box">${loadingHTML("Fetching Yahoo Finance…")}</div><div class="fx-box" style="margin-top:6px"></div>`);
      const SYMS = [["AAPL", "Apple"], ["MSFT", "Microsoft"], ["NVDA", "Nvidia"], ["TSLA", "Tesla"]];
      Promise.allSettled(SYMS.map(async ([sym, name]) => {
        const d = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1mo&interval=1d`, 20, {}, (x) => !!(x && x.chart && x.chart.result && x.chart.result[0] && x.chart.result[0].meta));
        const r = d.chart.result[0];
        const m = r.meta;
        const closes = ((r.indicators.quote || [])[0]?.close || []).filter(Boolean);
        const prev = m.chartPreviousClose || m.previousClose;
        const pct = prev ? ((m.regularMarketPrice - prev) / prev) * 100 : 0;
        return `<div class="market-row"><span class="tick-badge">${esc(sym.slice(0, 1))}</span><span class="market-name"><b>${esc(name)}</b><small>${sym} · $${(m.regularMarketPrice ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}</small></span>${closes.length > 3 ? spark(closes, pct >= 0) : ""}<strong class="market-pct ${pct >= 0 ? "gain" : "loss"}">${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%</strong></div>`;
      })).then((rs) => {
        const ok = rs.filter((x) => x.status === "fulfilled").map((x) => x.value);
        el.querySelector(".stock-box").innerHTML = ok.length ? ok.join("") : errorHTML("Yahoo Finance unreachable");
      });
      getJSON("https://open.er-api.com/v6/latest/USD", 120, {}, (d) => !!d?.rates?.EUR).then((d) => {
        const date = (d.time_last_update_utc || "").slice(5, 16);
        el.querySelector(".fx-box").innerHTML =
          [["EUR", "Euro", "🇪🇺"], ["GBP", "British Pound", "🇬🇧"], ["JPY", "Japanese Yen", "🇯🇵"], ["CAD", "Canadian Dollar", "🇨🇦"]]
            .map(([code, nm, fl]) =>
              `<div class="market-row"><span style="font-size:18px;width:22px;text-align:center">${fl}</span><span class="market-name"><b>${nm}</b><small>USD/${code} · ${d.rates[code]}</small></span></div>`
            ).join("") +
          `<p class="center-text" style="margin-top:6px;font-size:10px">Reference rates · ${esc(date)} · exchangerate-api.com</p>`;
      }).catch(() => { el.querySelector(".fx-box").innerHTML = errorHTML("FX rates unreachable"); });
      return el;
    },
  },
  goldCurrency: {
    title: "Gold Spot", icon: "🥇", cat: "finance", size: "m",
    render() {
      const el = div(loadingHTML("Fetching gold price…"));
      getJSON("https://api.gold-api.com/price/XAU", 30).then((g) => {
        el.innerHTML = `
          <div class="market-row"><span style="font-size:22px">🥇</span><span class="market-name"><b>Gold XAU/USD</b><small>spot · $${Number(g.price).toLocaleString("en-US", { maximumFractionDigits: 2 })}/oz</small></span></div>
          <div class="market-row"><span style="font-size:22px">🥈</span><span class="market-name"><b>Silver XAG/USD</b><small>loading…</small></span></div>`;
        getJSON("https://api.gold-api.com/price/XAG", 30).then((s) => {
          el.querySelectorAll(".market-row")[1].querySelector("small").textContent = `spot · $${Number(s.price).toLocaleString("en-US", { maximumFractionDigits: 2 })}/oz`;
        }).catch(() => {});
      }).catch(() => { el.innerHTML = errorHTML("Gold feed unreachable"); });
      return el;
    },
  },

  marketIndices: {
    title: "Global Market Indices", icon: "🌐", cat: "finance", size: "m",
    render() {
      const el = div(`<p class="center-text" style="font-size:10.5px;color:var(--muted);padding-bottom:4px">INDICES · delayed quotes</p><div class="stock-box">${loadingHTML("Fetching Yahoo Finance…")}</div>`);
      const IDX = [["^GSPC", "S&P 500"], ["^IXIC", "Nasdaq"], ["^DJI", "Dow Jones"], ["^FTSE", "FTSE 100"], ["^GDAXI", "DAX"], ["^N225", "Nikkei 225"]];
      Promise.allSettled(IDX.map(async ([sym, name]) => {
        const d = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1mo&interval=1d`, 20, {}, (x) => !!(x && x.chart && x.chart.result && x.chart.result[0] && x.chart.result[0].meta));
        const r = d.chart.result[0];
        const m = r.meta;
        const closes = ((r.indicators.quote || [])[0]?.close || []).filter(Boolean);
        const prev = m.chartPreviousClose || m.previousClose;
        const pct = prev ? ((m.regularMarketPrice - prev) / prev) * 100 : 0;
        return `<div class="market-row"><span class="tick-badge">${esc(name.slice(0, 1))}</span><span class="market-name"><b>${esc(name)}</b><small>${sym} · ${(m.regularMarketPrice ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}</small></span>${closes.length > 3 ? spark(closes, pct >= 0) : ""}<strong class="market-pct ${pct >= 0 ? "gain" : "loss"}">${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%</strong></div>`;
      })).then((rs) => {
        const ok = rs.filter((x) => x.status === "fulfilled").map((x) => x.value);
        el.querySelector(".stock-box").innerHTML = ok.length ? ok.join("") : errorHTML("Yahoo Finance unreachable");
      });
      return el;
    },
  },
  topMovers: {
    title: "Top Movers · 24h", icon: "🚀", cat: "finance", size: "s",
    render() {
      const el = div(loadingHTML("Fetching CoinGecko…"));
      let retried = false;
      const item = (c) => {
        const pct = c.price_change_percentage_24h ?? 0;
        const p = c.current_price ?? 0;
        return `<div class="market-row"><img src="${c.image}" alt=""/><span class="market-name"><b>${esc(c.symbol.toUpperCase())}</b><small>$${p.toLocaleString("en-US", { maximumFractionDigits: p < 5 ? 4 : 2 })}</small></span><strong class="market-pct ${pct >= 0 ? "gain" : "loss"}">${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%</strong></div>`;
      };
      const paint = (rows) => {
        const sorted = [...rows].sort((a, b) => (b.price_change_percentage_24h ?? -999) - (a.price_change_percentage_24h ?? -999));
        el.innerHTML =
          `<p class="lib-group-title" style="margin-top:0">🚀 Top gainers</p>` +
          sorted.slice(0, 3).map(item).join("") +
          `<p class="lib-group-title">📉 Top losers</p>` +
          sorted.slice(-3).reverse().map(item).join("") +
          `<p class="center-text" style="margin-top:6px;font-size:10px">24h change · top coins</p>`;
      };
      const load = () => getJSON("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h", 15, {}, Array.isArray).then((rows) => {
        if (!rows.length) throw new Error("empty");
        paint(rows);
      }).catch(() => {
        if (!retried) { retried = true; el.innerHTML = loadingHTML("CoinGecko busy — retrying…"); setTimeout(load, 3000); return; }
        getJSON("https://api.coinpaprika.com/v1/tickers?quotes=USD", 15, {}, (d) => Array.isArray(d) && d.length > 50).then((all) => {
          const MAJORS = ["btc-bitcoin", "eth-ethereum", "sol-solana", "xrp-xrp", "doge-dogecoin", "ada-cardano", "dot-polkadot", "ltc-litecoin"];
          paint(all.filter((r) => MAJORS.includes(r.id)).map((r) => ({ image: `https://static.coinpaprika.com/coin/${r.id}/logo.png`, symbol: r.symbol, current_price: r.quotes.USD.price, price_change_percentage_24h: r.quotes.USD.percent_change_24h })));
        }).catch(() => { el.innerHTML = errorHTML("All feeds unreachable"); });
      });
      load();
      return el;
    },
  },
  fearGreed: {
    title: "Fear & Greed Index", icon: "😱", cat: "finance", size: "s",
    render() {
      const el = div(loadingHTML("Fetching alternative.me…"));
      getJSON("https://api.alternative.me/fng/?limit=8", 60, {}, (d) => !!(d && d.data && d.data.length)).then((d) => {
        const v = Number(d.data[0].value);
        el.innerHTML = `
          <div class="fg-hero">
            <b class="fg-val ${v >= 60 ? "up" : v <= 40 ? "down" : ""}">${v}</b>
            <div class="fg-txt"><strong>${esc(d.data[0].value_classification)}</strong><small>Crypto market sentiment · today</small></div>
          </div>
          <div class="fg-bars">${d.data.slice().reverse().map((x) => {
            const val = Number(x.value);
            return `<i style="height:${Math.max(10, val)}%;background:${val >= 60 ? "var(--gain)" : val <= 40 ? "var(--loss)" : "var(--muted)"}" title="${x.value} · ${x.value_classification}"></i>`;
          }).join("")}</div>
          <p class="center-text" style="margin-top:6px;font-size:10px">Last 8 days · alternative.me</p>`;
      }).catch(() => { el.innerHTML = errorHTML("alternative.me unreachable"); });
      return el;
    },
  },
  currencyConverter: {
    title: "Currency Converter", icon: "💱", cat: "finance", size: "s",
    render() {
      const CUR = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "TRY", "AED"];
      const wrap = div(`
        <div class="cv-row"><input type="number" class="cv-amt" value="100" min="0"/><select class="cv-from">${CUR.map((c) => `<option>${c}</option>`).join("")}</select></div>
        <button class="cv-swap" title="Swap currencies">⇅</button>
        <div class="cv-row"><input class="cv-out" readonly/><select class="cv-to">${CUR.map((c) => `<option${c === "EUR" ? " selected" : ""}>${c}</option>`).join("")}</select></div>
        <p class="center-text cv-rate" style="font-size:10.5px;margin-top:7px;color:var(--muted)"></p>`);
      const amt = wrap.querySelector(".cv-amt"), from = wrap.querySelector(".cv-from"), to = wrap.querySelector(".cv-to"), out = wrap.querySelector(".cv-out"), rateEl = wrap.querySelector(".cv-rate");
      let rates = null;
      const calc = () => {
        if (!rates) return;
        const rate = rates[to.value] / rates[from.value];
        out.value = ((parseFloat(amt.value) || 0) * rate).toLocaleString("en-US", { maximumFractionDigits: 2 });
        rateEl.textContent = `1 ${from.value} = ${rate.toFixed(4)} ${to.value} · live`;
      };
      getJSON("https://open.er-api.com/v6/latest/USD", 120, {}, (d) => !!d?.rates?.EUR).then((d) => { rates = d.rates; calc(); }).catch(() => { rateEl.textContent = "⚠ Rates unavailable"; });
      amt.addEventListener("input", calc);
      from.addEventListener("change", calc);
      to.addEventListener("change", calc);
      wrap.querySelector(".cv-swap").addEventListener("click", () => { const t = from.value; from.value = to.value; to.value = t; calc(); });
      return wrap;
    },
  },

  nowPlaying: {
    title: "Now Playing", icon: "🎧", cat: "music", size: "m",
    render() {
      const el = div(`
        <div class="np-wrap">
          <div class="np-top">
            <img class="np-art" alt="" src=""/>
            <div class="np-meta"><b></b><small></small></div>
            <button class="np-btn np-toggle" aria-label="Play/Pause">▶</button>
            <button class="np-btn np-next" aria-label="Next track">⏭</button>
          </div>
          <div class="progress-bar np-bar"><div class="progress-fill" style="width:0%"></div></div>
          <p class="center-text np-time" style="margin-top:5px;font-size:10.5px">Select a mood mix or a chart track to start</p>
        </div>`);
      const paint = () => {
        const t = MUSIC.queue[MUSIC.i];
        el.querySelector(".np-art").src = t ? t.art : "";
        el.querySelector(".np-meta b").textContent = t ? t.name : "Nothing playing";
        el.querySelector(".np-meta small").textContent = t ? t.artist : "Pick music below ↓";
        el.querySelector(".np-toggle").textContent = MUSIC.playing ? "⏸" : "▶";
      };
      paint();
      document.addEventListener("np", paint);
      el.querySelector(".np-toggle").addEventListener("click", togglePlay);
      el.querySelector(".np-next").addEventListener("click", nextTrack);
      return el;
    },
    detail() { return chartQueueModal(); },
  },
  trendingTracks: {
    title: "Top Songs — Apple Music", icon: "📈", cat: "music", size: "m",
    render() {
      const el = div(loadingHTML("Fetching Apple Music charts…"));
      appleChart("topsongs", 10).then((items) => {
        if (!items.length) throw new Error("empty");
        el.innerHTML = items.slice(0, 8).map((t, i) =>
          `<div class="market-row track-row" data-i="${i}" style="cursor:pointer"><img src="${t.img}" alt="" onerror="this.style.visibility='hidden'"/><span class="market-name"><b>${i + 1}. ${esc(t.title)}</b><small>${esc(t.artist)}</small></span><span class="np-mini">▶</span></div>`
        ).join("") + `<p class="center-text" style="margin-top:8px;font-size:10px">Tap a song for a live 30s preview · itunes.apple.com</p>`;
        el.querySelectorAll(".track-row").forEach((rEl) => {
          rEl.addEventListener("click", async () => {
            const it = items[+rEl.dataset.i];
            const mini = rEl.querySelector(".np-mini");
            mini.textContent = "…";
            try {
              const t = await resolvePreview(it.title, it.artist);
              if (!t) throw new Error("no preview");
              playQueue([t], 0);
            } catch (e) { toast("No preview available for this track"); }
            el.querySelectorAll(".np-mini").forEach((x) => (x.textContent = "▶"));
          });
        });
      }).catch(() => { el.innerHTML = errorHTML("Apple charts unreachable"); });
      return el;
    },
  },
  topArtists: {
    title: "Top Artists Now", icon: "🎤", cat: "music", size: "s",
    render() {
      const el = div(loadingHTML());
      appleChart("topsongs", 25).then((items) => {
        const counts = {};
        items.forEach((s) => {
          counts[s.artist] = (counts[s.artist] || 0) + 1;
        });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        el.innerHTML = top.map(([a, n]) => row(a, `${n} chart hit${n > 1 ? "s" : ""}`)).join("");
      }).catch(() => { el.innerHTML = errorHTML("Apple charts unreachable"); });
      return el;
    },
  },
  moodMixes: {
    title: "Mood Mixes", icon: "🌈", cat: "music", size: "s",
    render() {
      const MOODS = {
        "🎯 Focus": "focus instrumental study",
        "😴 Sleep": "sleep ambient calm",
        "💪 Workout": "workout gym energy",
        "🚗 Driving": "driving road synthwave",
        "☕ Chill": "chill lofi relaxing",
        "🎉 Party": "party dance house",
      };
      const wrap = div(`<div class="mood-chips"></div><p class="center-text np-mood" style="margin-top:8px;font-size:10.5px">Tap a mood — free full-length tracks via Audius</p>`);
      const box = wrap.querySelector(".mood-chips");
      const status = wrap.querySelector(".np-mood");
      let hostPromise = null;
      const getHost = () => {
        if (!hostPromise) hostPromise = getJSON("https://api.audius.co", 1440, {}, (d) => !!(d && d.data && d.data.length)).then((d) => d.data[0]);
        return hostPromise;
      };
      Object.keys(MOODS).forEach((m) => {
        const b = document.createElement("button");
        b.className = "mood-chip";
        b.textContent = m;
        b.addEventListener("click", async () => {
          box.querySelectorAll(".mood-chip").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          status.textContent = `Loading ${m} mix…`;
          try {
            const host = await getHost();
            const d = await getJSON(`${host}/v1/tracks/search?query=${encodeURIComponent(MOODS[m])}&app_name=Nexora`, 60, {}, (x) => !!x?.data);
            const tracks = (d.data || [])
              .filter((t) => t.is_streamable !== false && (t.duration || 0) >= 90 && t.user && !t.user.is_deactivated)
              .slice(0, 8)
              .map((t) => ({
                name: t.title,
                artist: t.user.name,
                art: (t.artwork && (t.artwork["480x480"] || t.artwork["150x150"])) || "",
                preview: `${host}/v1/tracks/${t.id}/stream?app_name=Nexora`,
              }));
            if (!tracks.length) throw new Error("empty");
            playQueue(tracks, 0);
            status.textContent = `${m} mix loaded — ${tracks.length} FULL tracks via Audius`;
          } catch (e) {
            status.textContent = "⚠ Could not load this mix";
          }
        });
        box.appendChild(b);
      });
      return wrap;
    },
  },
  radio: {
    title: "Live Radio", icon: "📻", cat: "music", size: "m",
    render() {
      const GENRES = ["Pop", "Rock", "Jazz", "Classical", "Electronic", "Hip Hop", "News"];
      const MIRRORS = ["https://de1.api.radio-browser.info", "https://nl1.api.radio-browser.info", "https://at1.api.radio-browser.info", "https://fi1.api.radio-browser.info"];
      const wrap = div(`<div class="mood-chips"></div><p class="center-text np-radio" style="margin:6px 0;font-size:10.5px;color:var(--muted)">Pick a genre — thousands of real stations via radio-browser.info</p><div class="radio-body">${loadingHTML()}</div><div class="rd-vol">🔊<input type="range" class="rd-vol-range" min="0" max="100" value="80"/></div>`);
      const box = wrap.querySelector(".mood-chips");
      const body = wrap.querySelector(".radio-body");
      const np = wrap.querySelector(".np-radio");
      const vol = wrap.querySelector(".rd-vol-range");
      if (!RADIO.audio) { RADIO.audio = new Audio(); RADIO.audio.preload = "none"; }
      let stations = [];
      const stop = () => { RADIO.audio.pause(); RADIO.audio.removeAttribute("src"); RADIO.playingId = null; };
      const setRowIcons = (playingId) => {
        wrap.querySelectorAll(".radio-row").forEach((r) => r.querySelector(".np-mini").textContent = r.dataset.id === playingId ? "⏸" : "▶");
      };
      const fail = (st, triesLeft) => {
        RADIO.playingId = null;
        setRowIcons(null);
        const idx = stations.findIndex((x) => x.stationuuid === st.stationuuid);
        if (triesLeft > 0 && stations.length > 1) {
          const next = stations[(idx + 1) % stations.length];
          np.textContent = "⚠ Station offline — trying another…";
          setTimeout(() => connect(next, triesLeft - 1), 500);
        } else {
          np.textContent = "⚠ Couldn't connect — pick another station";
          toast("📻 This station didn't respond");
        }
      };
      const connect = (st, triesLeft) => {
        const rowEl = wrap.querySelector(`.radio-row[data-id="${st.stationuuid}"]`);
        if (rowEl) rowEl.querySelector(".np-mini").textContent = "…";
        np.textContent = "📡 Connecting: " + st.name.trim().slice(0, 40);
        const a = RADIO.audio;
        let settled = false;
        const finish = () => { settled = true; clearTimeout(timer); a.removeEventListener("error", onErr); };
        const timer = setTimeout(() => { if (!settled) { a.pause(); finish(); fail(st, triesLeft); } }, 12000);
        const onErr = () => { if (!settled) { finish(); fail(st, triesLeft); } };
        a.addEventListener("error", onErr, { once: true });
        a.src = st.url_resolved || st.url;
        a.volume = vol.value / 100;
        a.play().then(() => {
          if (settled) return;
          finish();
          RADIO.playingId = st.stationuuid;
          np.textContent = "🔴 Now: " + st.name.trim().slice(0, 44);
          setRowIcons(RADIO.playingId);
        }).catch(() => {
          if (settled) return;
          finish();
          fail(st, triesLeft);
        });
      };
      const paint = () => {
        body.innerHTML = stations.map((s) =>
          `<div class="market-row radio-row" data-id="${s.stationuuid}" style="cursor:pointer"><span class="tick-badge">📻</span><span class="market-name"><b>${esc(s.name.trim().slice(0, 30))}</b><small>${esc(s.country || "")} · ${esc(s.bitrate || "?")}kbps</small></span><span class="np-mini">▶</span></div>`
        ).join("") || errorHTML("No working stations found — try another genre");
        body.querySelectorAll(".radio-row").forEach((rEl) => {
          rEl.addEventListener("click", () => {
            const st = stations.find((x) => x.stationuuid === rEl.dataset.id);
            if (!st) return;
            if (RADIO.playingId === st.stationuuid) {
              stop();
              np.textContent = "⏸ Paused · " + st.name.trim().slice(0, 36);
              setRowIcons(null);
              return;
            }
            stop();
            connect(st, 2);
          });
        });
      };
      const load = (genre) => {
        body.innerHTML = loadingHTML(`Tuning ${genre} stations…`);
        const tryMirror = async (i) => {
          if (i >= MIRRORS.length) throw new Error("all mirrors unreachable");
          try {
            return await getJSON(`${MIRRORS[i]}/json/stations/bytag/${encodeURIComponent(genre.toLowerCase())}?limit=14&hidebroken=true&order=votes&reverse=true`, 60, {}, (d) => Array.isArray(d));
          } catch (e) { return tryMirror(i + 1); }
        };
        tryMirror(0).then((list) => {
          stations = list.filter((s) => (s.url_resolved || s.url || "").startsWith("https://")).slice(0, 6);
          paint();
        }).catch(() => { body.innerHTML = errorHTML("Radio directory unreachable"); });
      };
      GENRES.forEach((g) => {
        const b = document.createElement("button");
        b.className = "mood-chip";
        b.textContent = g;
        b.addEventListener("click", () => {
          box.querySelectorAll(".mood-chip").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          stop();
          np.textContent = "Pick a station ↓";
          load(g);
        });
        box.appendChild(b);
      });
      vol.addEventListener("input", () => { RADIO.audio.volume = vol.value / 100; });
      window.addEventListener("beforeunload", stop);
      box.querySelector(".mood-chip").classList.add("active");
      load(GENRES[0]);
      return wrap;
    },
  },

  concerts: {
    title: "Upcoming Concerts — Ticketmaster", icon: "🎫", cat: "music", size: "m",
    render() {
      const el = div(loadingHTML("Fetching Ticketmaster…"));
      const key = localStorage.getItem("tm_key") || "";
      if (!key) {
        el.innerHTML = `<div class="quote-box ticket-connect" style="cursor:pointer">🎫<span class="quote-author">Real concerts near you, powered by Ticketmaster.<br/>Tap here to connect your free key in 1 minute.</span></div>`;
        el.querySelector(".ticket-connect").addEventListener("click", () => openTicketmasterModal());
        return el;
      }
      const city = state.concertCity || "New York";
      getJSON(`https://app.ticketmaster.com/discovery/v2/events.json?classificationName=music&city=${encodeURIComponent(city)}&size=7&sort=date,asc&apikey=${key}`, 120)
        .then((d) => {
          const evs = d._embedded?.events || [];
          el.innerHTML =
            (evs.length ? evs.map((e) => {
              const venue = e._embedded?.venues?.[0]?.name || "";
              const date = e.dates?.start?.localDate || "";
              return `<a class="list-row" href="${e.url || "#"}" target="_blank" style="text-decoration:none;color:inherit"><div class="main-col">${esc(e.name || "")}${venue ? `<small style="display:block;color:var(--muted);font-size:10.5px">${esc(venue)}</small>` : ""}</div><div class="side-col">${date}</div></a>`;
            }).join("") : errorHTML(`No upcoming music events found in ${city}`)) +
            `<p class="center-text" style="margin-top:8px;font-size:10px">${esc(city)} · ticketmaster.com</p>`;
        })
        .catch(() => { el.innerHTML = errorHTML("Ticketmaster unreachable"); });
      return el;
    },
  },

  trendingMovies: {
    title: "Top Movies — Apple Charts", icon: "🔥", cat: "movies", size: "m",
    render() {
      return jwTrending("movie");
    },
  },
  trendingSeries: {
    title: "Top TV Seasons — Apple Charts", icon: "📺", cat: "movies", size: "m",
    render() {
      return jwTrending("show");
    },
  },
  genreBrowser: {
    title: "Browse by Genre", icon: "🎭", cat: "movies", size: "m",
    render() {
      const GENRES = [
        ["Action & Adventure", 4401], ["Comedy", 4404], ["Drama", 4406],
        ["Horror", 4408], ["Sci-Fi & Fantasy", 4413], ["Thriller", 4416],
        ["Romance", 4412], ["Documentary", 4405],
      ];
      const palette = ["#ff6b6b", "#5b7cfa", "#f4a915", "#9b6cff", "#455a64", "#ff8fab", "#45c4a0", "#d96ba0"];
      const el = div(
        `<div class="genre-grid">` +
          GENRES.map((g, i) =>
            `<button class="genre-tile" data-id="${g[1]}" data-name="${g[0]}" style="background:${palette[i % palette.length]};border:none">${g[0]}</button>`
          ).join("") +
        `</div><p class="center-text" style="margin-top:8px;font-size:10px">Tap a genre — top films from the official Apple charts</p>`
      );
      el.querySelectorAll(".genre-tile").forEach((t) => {
        t.addEventListener("click", () => openGenreModal(t.dataset.id, t.dataset.name));
      });
      return el;
    },
  },
  watchlist: {
    title: "Watchlist", icon: "🔖", cat: "movies", size: "m",
    render() {
      const wrap = div(`<div class="wl-add"><input class="note-area wl-input" placeholder="Add a movie or series…" style="min-height:0;padding:8px 10px;flex:1;font-size:12px"/><button class="lib-chip wl-go" style="border-radius:10px">＋</button></div><div class="wl-items"></div>`);
      const itemsBox = wrap.querySelector(".wl-items");
      if (!state.watchlist) state.watchlist = [];
      const paint = () => {
        itemsBox.innerHTML = state.watchlist.map((it, i) =>
          `<div class="list-row"><a class="main-col" href="${it.link}" target="_blank" style="text-decoration:none;color:inherit">${esc(it.name)}${it.year ? ` <small style="color:var(--muted)">· ${it.year}</small>` : ""}</a><button class="w-action wl-del" data-i="${i}" title="Remove" style="opacity:.5">✕</button></div>`
        ).join("") || `<p class="center-text" style="padding:10px 0">Your list is empty — add what you want to watch.</p>`;
        itemsBox.querySelectorAll(".wl-del").forEach((b) =>
          b.addEventListener("click", () => { state.watchlist.splice(+b.dataset.i, 1); saveState(); paint(); })
        );
      };
      const add = async () => {
        const inp = wrap.querySelector(".wl-input");
        const q = inp.value.trim();
        if (!q) return;
        inp.value = "";
        const entry = { name: q, year: "", link: "https://www.themoviedb.org/search?query=" + encodeURIComponent(q) };
        const key = getTmdbKey();
        if (key) {
          try {
            const d = await getJSON(`https://api.themoviedb.org/3/search/multi?api_key=${key}&query=${encodeURIComponent(q)}&page=1`, 1440);
            const r = (d.results || []).find((x) => x.media_type === "movie" || x.media_type === "tv");
            if (r) {
              entry.name = r.title || r.name;
              entry.year = (r.release_date || r.first_air_date || "").slice(0, 4);
              entry.link = `https://www.themoviedb.org/${r.media_type}/${r.id}`;
            }
          } catch (e) {}
        }
        state.watchlist.push(entry);
        saveState();
        paint();
      };
      wrap.querySelector(".wl-go").addEventListener("click", add);
      wrap.querySelector(".wl-input").addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
      paint();
      return wrap;
    },
  },

  artOfDay: {
    title: "Artwork of the Day — The Met", icon: "🖼️", cat: "art", size: "m",
    render() {
      const el = div(loadingHTML("Fetching The Met collection…"));
      const fill = (o) => {
        const img = el.querySelector(".art-img");
        if (img) {
          img.style.display = o.primaryImageSmall ? "" : "none";
          if (o.primaryImageSmall) img.src = o.primaryImageSmall;
        }
        el.querySelector(".quote-box").innerHTML =
          `«${decodeEntities(o.title)}»` +
          `<span class="quote-author">${decodeEntities(o.artistDisplayName || "Unknown")} · ${o.objectDate || ""}</span>` +
          (o.medium ? `<span class="quote-author">${decodeEntities(o.medium)}</span>` : "");
        el.querySelector(".art-meta").textContent = [decodeEntities(o.dimensions || ""), o.GalleryNumber ? "Gallery " + o.GalleryNumber : ""].filter(Boolean).join(" · ");
        el.querySelector(".art-src").href = o.objectURL || "#";
      };
      metPick("painting", 0).then((o) => {
        el.innerHTML = `
          <img class="art-img" src="" alt="" style="width:100%;height:auto;max-height:300px;border-radius:12px;margin-bottom:8px;object-fit:contain"/>
          <div class="quote-box" style="padding-top:4px"></div>
          <p class="art-meta center-text" style="font-size:10.5px;color:var(--muted);margin-top:5px"></p>
          <div style="display:flex;gap:6px;margin-top:6px">
            <input class="note-area art-search" placeholder="Search artwork or artist at The Met…" style="min-height:0;padding:8px 10px;flex:1;font-size:12px"/>
            <button class="lib-chip art-go" style="border-radius:10px">🔍</button>
          </div>
          <p class="center-text" style="margin-top:6px;font-size:10px"><a class="art-src" href="#" target="_blank" style="color:var(--muted)">view at metmuseum.org ↗</a> · open access</p>`;
        fill(o);
        const runSearch = async () => {
          const q = el.querySelector(".art-search").value.trim();
          if (!q) return;
          try {
            const s = await getJSON(`https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(q)}`, 5);
            if (!s.objectIDs?.length) { toast("No results at The Met"); return; }
            let o2 = null;
            for (let i = 0; i < 4 && !o2?.primaryImageSmall; i++) {
              const pickId = s.objectIDs[Math.floor(Math.random() * Math.min(12, s.objectIDs.length))];
              o2 = await getJSON(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${pickId}`, 1440);
            }
            if (o2) { fill(o2); toast("🖼️ New artwork loaded"); }
            else toast("No image results at The Met");
          } catch (e) { toast("Met search failed"); }
        };
        el.querySelector(".art-go").addEventListener("click", runSearch);
        el.querySelector(".art-search").addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });
      }).catch(() => { el.innerHTML = errorHTML("The Met unreachable"); });
      return el;
    },
  },
  artistSpotlight: {
    title: "Artist Spotlight", icon: "🖌️", cat: "art", size: "m",
    render() {
      const el = div(loadingHTML("Fetching The Met collection…"));
      metPick("portrait", 3).then((o) => {
        el.innerHTML = `
          ${o.primaryImageSmall ? `<img class="art-img" src="${o.primaryImageSmall}" alt="" style="width:100%;height:auto;max-height:280px;border-radius:12px;margin-bottom:8px;object-fit:contain"/>` : ""}
          <div class="quote-box"><b>${decodeEntities(o.artistDisplayName || "Unknown artist")}</b><span class="quote-author">«${decodeEntities(o.title)}» · ${o.objectDate || ""} · ${decodeEntities(o.medium || "")}</span></div>
          <p class="center-text" style="font-size:10.5px;color:var(--muted);margin-top:5px">${[decodeEntities(o.dimensions || ""), o.GalleryNumber ? "Gallery " + o.GalleryNumber : ""].filter(Boolean).join(" · ")}</p>
          <p class="center-text" style="margin-top:6px;font-size:10px"><a href="${o.objectURL}" target="_blank" style="color:var(--muted)">view at metmuseum.org ↗</a> · open access</p>`;
      }).catch(() => { el.innerHTML = errorHTML("The Met unreachable"); });
      return el;
    },
  },
  exhibitions: {
    title: "Exhibitions — AIC", icon: "🏛️", cat: "art", size: "m",
    render() {
      const el = div(loadingHTML("Fetching exhibitions…"));
      getJSON("https://api.artic.edu/api/v1/exhibitions?fields=title,start_date,end_date,status,is_current&sort=-start_date&limit=6", 240).then((d) => {
        el.innerHTML = (d.data || []).map((x) =>
          row(decodeEntities(x.title), `${x.start_date?.slice(0, 7) || "?"} → ${x.end_date?.slice(0, 7) || "ongoing"}`)
        ).join("") + `<p class="center-text" style="margin-top:8px;font-size:10px">Art Institute of Chicago · artic.edu</p>`;
      }).catch(() => { el.innerHTML = errorHTML("AIC unreachable"); });
      return el;
    },
  },
  colorStories: {
    title: "Daily Palette", icon: "🌈", cat: "art", size: "s",
    render() {
      const daySeed = Math.floor(Date.now() / 86400000);
      const SEEDS = ["2461A7", "E85D75", "7A9E7E", "F2A104", "6C5CE7", "0FA3B1", "D64550", "8E7DBE", "F4ACB7", "3D5A80", "EE964B", "29335C", "94D2BD", "E4572E", "76B041", "B388EB"];
      const MODES = ["analogic", "monochrome", "triad", "complement", "quad"];
      const el = div(loadingHTML("Mixing today's palettes…"));
      Promise.allSettled(
        Array.from({ length: 8 }, (_, i) => {
          const mode = MODES[(daySeed + i) % MODES.length];
          return getJSON(`https://www.thecolorapi.com/scheme?hex=${SEEDS[(daySeed + i * 5) % SEEDS.length]}&mode=${mode}&count=5&format=json`, 720, {}, (d) => !!d?.colors?.length)
            .then((d) => ({ mode, colors: d.colors }))
            .catch(() => null);
        })
      ).then((rs) => {
        const ok = rs.map((x) => x.status === "fulfilled" ? x.value : null).filter(Boolean);
        if (!ok.length) { el.innerHTML = errorHTML("The Color API unreachable"); return; }
        el.innerHTML = ok.map((p, i) =>
          `<div class="palette-card"><small class="pal-mode">${p.mode} · palette ${i + 1}</small><div class="swatches">${p.colors.map((c) =>
            `<div class="swatch" style="background:${c.hex.value}" title="${c.hex.clean} — click to copy"><span>${c.hex.clean}</span></div>`
          ).join("")}</div></div>`
        ).join("") + `<p class="center-text" style="margin-top:8px;font-size:10px">${ok.length} fresh palettes daily · thecolorapi.com</p>`;
        el.querySelectorAll(".swatch").forEach((sw) =>
          sw.addEventListener("click", () => {
            navigator.clipboard?.writeText("#" + sw.querySelector("span").textContent);
            toast("📋 #" + sw.querySelector("span").textContent + " copied");
          })
        );
      });
      return el;
    },
  },
  livingGallery: {
    title: "Living Gallery", icon: "🏛️", cat: "art", size: "m",
    render() {
      const el = div(loadingHTML("Curating The Met highlights…"));
      let pool = null, idx = -1, timer = null;
      const show = () => {
        if (!pool || !pool.length) return;
        idx = (idx + 1 + Math.floor(Math.random() * 2)) % pool.length;
        const o = pool[idx];
        el.innerHTML = `
          ${o.img ? `<img class="art-img" src="${o.img}" alt="" style="width:100%;height:auto;border-radius:12px;margin-bottom:8px"/>` : ""}
          <div class="quote-box" style="padding-top:4px">«${esc(o.title)}»<span class="quote-author">${esc(o.artist)}${o.date ? " · " + esc(o.date) : ""} · The Met</span></div>
          <p class="center-text" style="margin-top:6px;font-size:10px">Rotates automatically · <a href="https://www.metmuseum.org/art/collection/search/${o.id}" target="_blank" style="color:var(--muted)">view at metmuseum.org</a></p>`;
      };
      getJSON("https://collectionapi.metmuseum.org/public/collection/v1/search?isHighlight=true&hasImages=true&q=painting", 1440, {}, (d) => !!d?.objectIDs?.length).then((s) => {
        const ids = s.objectIDs.slice(0, 10);
        return Promise.allSettled(ids.map((id) =>
          getJSON(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, 1440, {}, (o) => !!o?.primaryImageSmall)
        ));
      }).then((rs) => {
        pool = rs.filter((x) => x.status === "fulfilled").map((x) => x.value).map((o) => ({
          id: o.objectID, img: o.primaryImageSmall, title: decodeEntities(o.title || "Untitled"),
          artist: decodeEntities(o.artistDisplayName || "Unknown artist"), date: o.objectDate || "",
        }));
        if (!pool.length) throw new Error("empty");
        show();
        timer = setInterval(show, 90000);
      }).catch(() => { el.innerHTML = errorHTML("The Met unreachable"); });
      return el;
    },
  },
  wordOfWisdom: {
    title: "Wise Words", icon: "🦉", cat: "fun", size: "s",
    render() {
      const el = div(loadingHTML());
      const FALLBACK = [
        ["Do not wait to strike till the iron is hot; but make it hot by striking.", "— William Butler Yeats"],
        ["Well begun is half done.", "— Aristotle"],
        ["We suffer more often in imagination than in reality.", "— Seneca"],
      ];
      const paintBtn = () => {
        const b = document.createElement("button");
        b.className = "lib-chip ww-more";
        b.style.cssText = "display:block;margin:8px auto 0;border-radius:10px";
        b.textContent = "🔄 Another one";
        b.addEventListener("click", load);
        el.appendChild(b);
      };
      const load = () => {
        el.innerHTML = loadingHTML();
        getJSON(`https://api.adviceslip.com/advice?t=${Date.now()}`, 1, {}, (d) => !!d?.slip?.advice).then((d) => {
          el.innerHTML = `<div class="quote-box">${decodeEntities(d.slip.advice)}<span class="quote-author">advice #${d.slip.id} · adviceslip.com</span></div>`;
          paintBtn();
        }).catch(() => {
          const q = pick(FALLBACK);
          el.innerHTML = `<div class="quote-box">${q[0]}<span class="quote-author">${q[1]} · offline</span></div>`;
          paintBtn();
        });
      };
      load();
      return el;
    },
  },
  flagQuiz: {
    title: "Guess the Flag", icon: "🚩", cat: "fun", size: "s",
    render() {
      const FLAGS = [["🇯🇵", "Japan"], ["🇧🇷", "Brazil"], ["🇫🇷", "France"], ["🇪🇬", "Egypt"], ["🇮🇳", "India"], ["🇰🇪", "Kenya"], ["🇨🇦", "Canada"], ["🇩🇪", "Germany"], ["🇦🇺", "Australia"], ["🇲🇽", "Mexico"], ["🇮🇹", "Italy"], ["🇰🇷", "South Korea"], ["🇳🇬", "Nigeria"], ["🇦🇷", "Argentina"], ["🇹🇷", "Türkiye"], ["🇸🇪", "Sweden"], ["🇿🇦", "South Africa"], ["🇮🇩", "Indonesia"], ["🇳🇱", "Netherlands"], ["🇸🇦", "Saudi Arabia"], ["🇨🇭", "Switzerland"], ["🇵🇹", "Portugal"], ["🇬🇷", "Greece"], ["🇻🇳", "Vietnam"], ["🇵🇱", "Poland"], ["🇮🇷", "Iran"], ["🇪🇸", "Spain"], ["🇨🇱", "Chile"], ["🇲🇦", "Morocco"], ["🇹🇭", "Thailand"], ["🇮🇪", "Ireland"], ["🇺🇦", "Ukraine"]];
      const ROUNDS = 8;
      const el = div(`<div class="fq-wrap"></div>`);
      const box = el.querySelector(".fq-wrap");
      let qi = 0, score = 0, correct = null;
      const ask = () => {
        correct = pick(FLAGS);
        const opts = [correct];
        while (opts.length < 4) { const c = pick(FLAGS); if (!opts.some((o) => o[1] === c[1])) opts.push(c); }
        opts.sort(() => Math.random() - 0.5);
        box.innerHTML = `
          <p class="center-text" style="font-size:11px;color:var(--muted)">Round ${qi + 1}/${ROUNDS} · Score <b>${score}</b></p>
          <div class="fq-flag">${correct[0]}</div>
          <div class="fq-opts">${opts.map((o) => `<button class="lib-chip fq-opt" data-n="${esc(o[1])}">${esc(o[1])}</button>`).join("")}</div>`;
        box.querySelectorAll(".fq-opt").forEach((b) =>
          b.addEventListener("click", () => {
            if (b.disabled) return;
            box.querySelectorAll(".fq-opt").forEach((x) => {
              x.disabled = true;
              if (x.dataset.n === correct[1]) x.style.borderColor = "var(--gain)";
            });
            if (b.dataset.n === correct[1]) { score++; }
            else b.style.borderColor = "var(--loss)";
            setTimeout(() => {
              qi++;
              if (qi < ROUNDS) ask(); else end();
            }, 750);
          })
        );
      };
      const end = () => {
        submitScore("flagquiz", score);
        box.innerHTML = `
          <div class="quote-box"><b>🏁 Finished!</b><span class="quote-author">Score ${score}/${ROUNDS}</span></div>
          ${boardHTML("flagquiz", "/8")}
          <button class="lib-chip fq-again" style="display:block;margin:8px auto 0;border-radius:10px">🔁 Play again</button>`;
        bindBoard(box);
        box.querySelector(".fq-again").addEventListener("click", start);
      };
      const start = () => { qi = 0; score = 0; ask(); };
      start();
      return el;
    },
  },
  mathBlitz: {
    title: "Math Blitz · 30s", icon: "🧮", cat: "fun", size: "s",
    render() {
      const el = div(`<div class="mb-wrap"></div>`);
      const box = el.querySelector(".mb-wrap");
      let timer = null, tLeft = 30, score = 0, ans = 0;
      const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
      const stop = () => { if (timer) clearInterval(timer); timer = null; };
      const nextQ = () => {
        const op = pick(["+", "−", "×"]);
        let a, b, r;
        if (op === "+") { a = ri(6, 60); b = ri(6, 60); r = a + b; }
        else if (op === "−") { a = ri(12, 90); b = ri(3, a - 2); r = a - b; }
        else { a = ri(2, 9); b = ri(3, 9); r = a * b; }
        ans = r;
        box.querySelector(".mb-q").textContent = `${a} ${op} ${b} = ?`;
        const inp = box.querySelector(".mb-in");
        inp.value = "";
        inp.focus();
      };
      const check = () => {
        const inp = box.querySelector(".mb-in");
        if (!inp || !timer) return;
        if (parseInt(inp.value, 10) === ans) score += 5;
        else { score = Math.max(0, score - 2); tLeft = Math.max(1, tLeft - 2); }
        box.querySelector(".mb-s").textContent = score;
        box.querySelector(".mb-t").textContent = tLeft;
        nextQ();
      };
      const end = () => {
        stop();
        submitScore("mathblitz", score);
        box.innerHTML = `
          <div class="quote-box"><b>⏱ Time's up!</b><span class="quote-author">Final score ${score}</span></div>
          ${boardHTML("mathblitz")}
          <button class="lib-chip mb-go" style="display:block;margin:8px auto 0;border-radius:10px">🔁 Again</button>`;
        bindBoard(box);
        box.querySelector(".mb-go").addEventListener("click", start);
      };
      const start = () => {
        stop();
        score = 0; tLeft = 30;
        box.innerHTML = `
          <div class="mb-hud"><span>⏱ <b class="mb-t">30</b>s</span><small>+5 ✓ &nbsp; −2 ✗ &amp; −2s</small><span>⭐ <b class="mb-s">0</b></span></div>
          <div class="mb-q mb-q-big"></div>
          <input class="note-area mb-in" type="number" inputmode="numeric" placeholder="Answer…" style="min-height:0;padding:8px 10px;width:100%;font-size:14px;text-align:center"/>
          <p class="center-text" style="font-size:10px;color:var(--muted);margin-top:4px">Type &amp; press Enter — fast!</p>`;
        nextQ();
        box.querySelector(".mb-in").addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
        timer = setInterval(() => {
          tLeft--;
          const tEl = box.querySelector(".mb-t");
          if (tEl) tEl.textContent = tLeft;
          if (tLeft <= 0) end();
        }, 1000);
      };
      start();
      return el;
    },
  },
  memoryMatch: {
    title: "Memory Match", icon: "🃏", cat: "fun", size: "s",
    render() {
      const EMOJI = ["🍎", "🌟", "🐼", "🎈", "🎸", "🌵", "🚀", "🐙"];
      const el = div(`<div class="mm-wrap"></div>`);
      const box = el.querySelector(".mm-wrap");
      let tick = null;
      const start = () => {
        let first = null, lock = false, moves = 0, matched = 0, secs = 0;
        if (tick) clearInterval(tick);
        tick = setInterval(() => { secs++; const s = box.querySelector(".mm-tm"); if (s) s.textContent = secs; }, 1000);
        const deck = [...EMOJI, ...EMOJI].sort(() => Math.random() - 0.5);
        box.innerHTML = `
          <p class="center-text mm-hud" style="font-size:11px;color:var(--muted);padding-bottom:6px">Moves <b class="mm-mv">0</b> · ⏱ <b class="mm-tm">0</b>s · find all 8 pairs!</p>
          <div class="mem-grid">${deck.map((e2) => `<button class="mem-card" data-e="${e2}"><span class="mem-front">❔</span><span class="mem-back">${e2}</span></button>`).join("")}</div>`;
        const finish = () => {
          clearInterval(tick); tick = null;
          const sc = Math.max(10, 200 - moves * 5 - secs * 2);
          submitScore("memorymatch", sc);
          const p = document.createElement("div");
          p.innerHTML = `<div class="quote-box"><b>🎉 Cleared!</b><span class="quote-author">${moves} moves · ${secs}s → Score ${sc}</span></div>${boardHTML("memorymatch")}<button class="lib-chip mm-again" style="display:block;margin:8px auto 0;border-radius:10px">🔁 Again</button>`;
          while (p.firstChild) box.appendChild(p.firstChild);
          bindBoard(box);
          box.querySelector(".mm-again").addEventListener("click", start);
        };
        box.querySelectorAll(".mem-card").forEach((c) =>
          c.addEventListener("click", () => {
            if (lock || c.classList.contains("open") || c.classList.contains("done")) return;
            c.classList.add("open");
            if (!first) { first = c; return; }
            moves++;
            box.querySelector(".mm-mv").textContent = moves;
            const a = first, b2 = c;
            first = null;
            if (a.dataset.e === b2.dataset.e) {
              a.classList.add("done"); b2.classList.add("done");
              matched++;
              if (matched === EMOJI.length) finish();
            } else {
              lock = true;
              setTimeout(() => { a.classList.remove("open"); b2.classList.remove("open"); lock = false; }, 650);
            }
          })
        );
      };
      start();
      return el;
    },
  },
  reactionTest: {
    title: "Reaction Test", icon: "⚡", cat: "fun", size: "s",
    render() {
      const el = div(`<div class="rt-wrap"></div>`);
      const box = el.querySelector(".rt-wrap");
      const ROUNDS = 5;
      let times = [];
      const start = () => {
        times = [];
        let phase = "ready", to = null, t0 = 0;
        box.innerHTML = `
          <p class="center-text" style="font-size:11px;color:var(--muted);padding-bottom:6px">Round <b class="rt-round">0/${ROUNDS}</b> · click only on GREEN</p>
          <div class="rt-pad ready">Click to begin round</div>
          <p class="center-text" style="font-size:10px;color:var(--muted);margin-top:5px">Faster reaction → more points</p>`;
        const pad = box.querySelector(".rt-pad");
        const roundEl = box.querySelector(".rt-round");
        const setPad = (cls, txt) => { pad.className = "rt-pad " + cls; pad.textContent = txt; };
        const arm = () => {
          phase = "wait";
          setPad("wait", "Wait for GREEN…");
          to = setTimeout(() => { t0 = performance.now(); phase = "go"; setPad("go", "CLICK!"); }, 900 + Math.random() * 1800);
        };
        pad.addEventListener("click", () => {
          if (phase === "ready") arm();
          else if (phase === "wait") { clearTimeout(to); toast("Too early! 😅"); arm(); }
          else if (phase === "go") {
            const ms = Math.round(performance.now() - t0);
            times.push(ms);
            roundEl.textContent = `${times.length}/${ROUNDS}`;
            phase = "ready";
            setPad("ready", `${ms} ms — click for next round`);
            if (times.length >= ROUNDS) setTimeout(finish, 600);
          }
        });
      };
      const finish = () => {
        const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        const pts = Math.max(0, Math.round((600 - avg) * 2));
        submitScore("reaction", pts);
        box.innerHTML = `
          <div class="quote-box"><b>⚡ Average ${avg} ms</b><span class="quote-author">${times.join(" · ")} ms → ${pts} pts</span></div>
          ${boardHTML("reaction")}
          <button class="lib-chip rt-go" style="display:block;margin:8px auto 0;border-radius:10px">🔁 Play again</button>`;
        bindBoard(box);
        box.querySelector(".rt-go").addEventListener("click", start);
      };
      start();
      return el;
    },
  },

  dailyJoke: {
    title: "Joke of the Day", icon: "😂", cat: "fun", size: "s",
    render() {
      const el = div(loadingHTML());
      const fallback = () => { el.innerHTML = `<div class="quote-box">Why do programmers prefer dark mode? Because bugs are attracted to light!</div>`; };
      getJSON("https://icanhazdadjoke.com/", 720, { headers: { Accept: "application/json" } }).then((d) => {
        el.innerHTML = `<div class="quote-box">${decodeEntities(d.joke)}<span class="quote-author">icanhazdadjoke.com</span></div>`;
      }).catch(fallback);
      return el;
    },
  },
  triviaQuiz: {
    title: "Trivia Quiz — OpenTDB", icon: "❓", cat: "fun", size: "m",
    render() {
      const wrap = div(loadingHTML("Loading quiz round…"));
      let qs = [], qi = 0, score = 0;
      const paintQ = () => {
        const q = qs[qi];
        const opts = [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5);
        wrap.innerHTML = `
          <p class="center-text" style="font-size:10.5px;color:var(--muted)">${esc(decodeEntities(q.category))} · ${q.difficulty} · Question ${qi + 1}/${qs.length} · Score ${score}</p>
          <p style="font-size:14px;padding:8px 4px">${decodeEntities(q.question)}</p>
          <div class="mood-chips"></div>
          <p class="center-text result" style="margin-top:8px;min-height:16px"></p>`;
        const box = wrap.querySelector(".mood-chips");
        const res = wrap.querySelector(".result");
        opts.forEach((o) => {
          const b = document.createElement("button");
          b.className = "mood-chip";
          b.textContent = decodeEntities(o);
          b.addEventListener("click", () => {
            if (b.disabled) return;
            box.querySelectorAll("button").forEach((x) => (x.disabled = true));
            const correct = o === q.correct_answer;
            if (correct) { score++; res.textContent = "✅ Correct!"; }
            else res.textContent = `❌ Answer: ${decodeEntities(q.correct_answer)}`;
            setTimeout(() => {
              qi++;
              if (qi < qs.length) paintQ();
              else paintEnd();
            }, 900);
          });
          box.appendChild(b);
        });
      };
      const paintEnd = () => {
        const best = Math.max(score, state.triviaBest || 0);
        state.triviaBest = best;
        submitScore("trivia", score);
        saveState();
        wrap.innerHTML = `
          <div class="quote-box"><b>Round complete!</b><span class="quote-author">Score ${score}/${qs.length} · Best ${best}/10</span></div>
          ${boardHTML("trivia", "/10")}
          <button class="lib-chip trivia-again" style="display:block;margin:10px auto 0;border-radius:10px">🔄 New round</button>`;
        bindBoard(wrap);
        wrap.querySelector(".trivia-again").addEventListener("click", start);
      };
      const start = () => {
        wrap.innerHTML = loadingHTML("Loading quiz round…");
        qs = []; qi = 0; score = 0;
        getJSON(`https://opentdb.com/api.php?amount=10&type=multiple`, 2, {}, (d) => Array.isArray(d?.results) && d.results.length > 0).then((d) => {
          qs = d.results;
          paintQ();
        }).catch(() => { wrap.innerHTML = errorHTML("OpenTDB unreachable"); });
      };
      start();
      return wrap;
    },
  },
  pollOfDay: {
    title: "Poll of the Day", icon: "🗳️", cat: "fun", size: "m",
    render() {
      const QUESTIONS = [
        ["When do you get most work done?", ["Mornings ☀️", "Nights 🌙"]],
        ["Coffee or tea?", ["Coffee ☕", "Tea 🍵"]],
        ["Tabs or spaces?", ["Tabs ↹", "Spaces ␣"]],
        ["Planner or spontaneous?", ["Plan it 📋", "Wing it 🎲"]],
      ];
      const dayIndex = Math.floor(Date.now() / 86400000);
      const [question, opts] = QUESTIONS[dayIndex % QUESTIONS.length];
      const key = "poll-" + dayIndex;
      if (!state.pollVotes) state.pollVotes = {};
      let voted = state.pollVotes[key] ?? null;
      const wrap = div(`<p style="font-size:14px;padding:6px 2px 10px">${esc(question)}</p>`);
      const paint = () => {
        wrap.querySelectorAll(".poll-option").forEach((x) => x.remove());
        opts.forEach((o, i) => {
          const b = document.createElement("button");
          b.className = "poll-option" + (voted === i ? " picked" : "");
          b.innerHTML = voted == null ? o : voted === i ? `✓ ${o}` : `<span style="opacity:.55">${o}</span>`;
          b.addEventListener("click", () => {
            voted = i;
            state.pollVotes[key] = i;
            saveState();
            paint();
          });
          wrap.appendChild(b);
        });
        if (voted != null) {
          const hint = document.createElement("p");
          hint.className = "center-text";
          hint.style.cssText = "margin-top:8px;font-size:10.5px";
          hint.textContent = "Your pick is saved locally — new question tomorrow.";
          wrap.appendChild(hint);
        }
      };
      paint();
      return wrap;
    },
  },
  funFacts: {
    title: "Did You Know?", icon: "💡", cat: "fun", size: "s",
    render() {
      const el = div(loadingHTML());
      getJSON("https://uselessfacts.jsph.pl/api/v2/facts/random", 360).then((d) => {
        el.innerHTML = `<div class="quote-box">${decodeEntities(d.text)}<span class="quote-author">uselessfacts.jsph.pl</span></div>`;
      }).catch(() => {
        el.innerHTML = `<div class="quote-box">Honey never spoils.</div>`;
      });
      return el;
    },
  },
  rpsLeague: {
    title: "RPS League", icon: "✊", cat: "fun", size: "s",
    render() {
      if (!state.rps) state.rps = { w: 0, l: 0, t: 0, streak: 0, bestStreak: 0 };
      const MOVES = [["✊", "Rock"], ["✋", "Paper"], ["✌️", "Scissors"]];
      const BEATS = { Rock: "Scissors", Paper: "Rock", Scissors: "Paper" };
      const wrap = div(`<div class="rps-score"></div><div class="mood-chips rps-btns"></div><p class="center-text rps-msg" style="margin-top:8px;font-size:11.5px;min-height:30px">Choose your move — build the longest streak!</p><div class="lb-slot"></div>`);
      const scoreBox = wrap.querySelector(".rps-score");
      const msg = wrap.querySelector(".rps-msg");
      const paintScore = () => {
        const r = state.rps;
        scoreBox.innerHTML = `<p class="center-text" style="font-size:10.5px;color:var(--muted);padding-top:4px">W ${r.w} · L ${r.l} · T ${r.t} · Streak ${r.streak} 🔥 Best ${r.bestStreak}</p>`;
        wrap.querySelector(".lb-slot").innerHTML = boardHTML("rps-streak", "🔥");
        bindBoard(wrap);
      };
      MOVES.forEach(([emoji, name]) => {
        const b = document.createElement("button");
        b.className = "mood-chip";
        b.textContent = emoji + " " + name;
        b.addEventListener("click", () => {
          const [cEm, cName] = pick(MOVES);
          const r = state.rps;
          if (name === cName) {
            r.t++;
            msg.textContent = `${emoji} vs ${cEm} — Tie!`;
          } else if (BEATS[name] === cName) {
            r.w++; r.streak++;
            r.bestStreak = Math.max(r.bestStreak, r.streak);
            submitScore("rps-streak", r.bestStreak);
            msg.textContent = `${emoji} beats ${cEm} — you win! 🔥 Streak ${r.streak}`;
          } else {
            r.l++; r.streak = 0;
            msg.textContent = `${cEm} beats ${emoji} — computer wins. Streak reset.`;
          }
          saveState();
          paintScore();
        });
        wrap.querySelector(".rps-btns").appendChild(b);
      });
      paintScore();
      return wrap;
    },
  },
  higherLower: {
    title: "Higher or Lower — Crypto", icon: "📈", cat: "fun", size: "m",
    render() {
      const wrap = div(loadingHTML("Fetching live prices…"));
      let coins = [], a = null, b = null, score = 0;
      const setupBoard = () => {
        wrap.innerHTML = `
          <p class="center-text" style="font-size:10.5px;color:var(--muted)">Score <b class="hl-score">${score}</b> · Best ${state.hlBest || 0} · live prices from coinpaprika.com</p>
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0">
            <div style="flex:1;text-align:center"><img src="${a.logo}" alt="" style="width:26px;height:26px"/><b style="display:block;font-size:13px">${esc(a.name)}</b><small style="color:var(--muted)">$${a.price.toLocaleString("en-US", { maximumFractionDigits: a.price < 5 ? 4 : 2 })}</small></div>
            <span style="font-weight:800;font-size:15px">vs</span>
            <div style="flex:1;text-align:center"><img src="${b.logo}" alt="" style="width:26px;height:26px"/><b style="display:block;font-size:13px">${esc(b.name)}</b><small style="color:var(--muted)" class="hl-bprice">? ? ?</small></div>
          </div>
          <div style="display:flex;gap:8px;justify-content:center">
            <button class="lib-chip hl-btn" data-guess="higher" style="border-radius:10px">📈 Higher</button>
            <button class="lib-chip hl-btn" data-guess="lower" style="border-radius:10px">📉 Lower</button>
          </div>
          <p class="center-text hl-msg" style="margin-top:8px;font-size:11.5px;min-height:18px"></p>`;
      };
      const nextPair = () => {
        a = b || pick(coins);
        do { b = pick(coins); } while (b.id === a.id);
        setupBoard();
        bind();
      };
      const bind = () => {
        wrap.querySelectorAll(".hl-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            const guess = btn.dataset.guess;
            const bp = b.quotes.USD.price, ap = a.quotes.USD.price;
            const correct = (guess === "higher" && bp > ap) || (guess === "lower" && bp < ap);
            wrap.querySelector(".hl-bprice").textContent = "$" + bp.toLocaleString("en-US", { maximumFractionDigits: bp < 5 ? 4 : 2 });
            const msg = wrap.querySelector(".hl-msg");
            if (correct) {
              score++;
              state.hlBest = Math.max(score, state.hlBest || 0);
              saveState();
              msg.textContent = `✅ Correct! Score ${score}`;
              setTimeout(nextPair, 900);
            } else {
              msg.textContent = `❌ Wrong! Final score ${score} · Best ${state.hlBest || 0}`;
              submitScore("higherlower", score);
              wrap.querySelectorAll(".hl-btn").forEach((x) => (x.disabled = true));
              const boardWrap = document.createElement("div");
              boardWrap.innerHTML = boardHTML("higherlower");
              while (boardWrap.firstChild) wrap.appendChild(boardWrap.firstChild);
              bindBoard(wrap);
              const again = document.createElement("button");
              again.className = "lib-chip";
              again.style.cssText = "display:block;margin:8px auto 0;border-radius:10px";
              again.textContent = "🔄 Play again";
              again.addEventListener("click", () => { score = 0; nextPair(); });
              wrap.appendChild(again);
            }
          });
        });
      };
      getJSON("https://api.coinpaprika.com/v1/tickers?quotes=USD", 10, {}, (d) => Array.isArray(d) && d.length > 50).then((rows) => {
        coins = rows.filter((r) => r.quotes?.USD?.price > 0.5 && r.rank <= 120).slice(0, 100);
        if (coins.length < 2) throw new Error("empty");
        nextPair();
      }).catch(() => { wrap.innerHTML = errorHTML("CoinPaprika unreachable"); });
      return wrap;
    },
  },
};

function div(html) {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d;
}
function row(main, side) {
  return `<div class="list-row"><div class="main-col">${main}</div><div class="side-col">${side}</div></div>`;
}
function list(rowsHtml) {
  const d = document.createElement("div");
  d.innerHTML = rowsHtml.join("");
  return d;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function spark(points, pos) {
  const w = 70, h = 24;
  const min = Math.min(...points), max = Math.max(...points);
  const norm = points
    .map((v, i) => `${(i * (w / (points.length - 1))).toFixed(1)},${(h - 2 - ((v - min) / (max - min || 1)) * (h - 4)).toFixed(1)}`)
    .join(" ");
  return `<span class="sparkline"><svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline class="${pos ? "pos" : "neg"}" points="${norm}"/></svg></span>`;
}

function marketRow(img, name, sym, price, pct, points) {
  const pos = pct >= 0;
  return `<div class="market-row"><img src="${img}" alt="${name}"/><span class="market-name"><b>${name}</b><small>${sym} · $${price}</small></span>${spark(points, pos)}<strong class="market-pct ${pos ? "gain" : "loss"}">${pos ? "+" : ""}${pct.toFixed(pct > -1 && pct < 1 ? 2 : 1)}%</strong></div>`;
}

/* ---------- TMDB integration (kept for optional use) ---------- */
function getTmdbKey() {
  return localStorage.getItem("tmdb_key") || "";
}

/* ---------- JustWatch is dead (API retired) — using official Apple/iTunes charts ---------- */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function itunesEntry(e) {
  const imgs = e["im:image"] || [];
  const img = (imgs[1] || imgs[0] || {}).label || "";
  return {
    title: decodeEntities(e["im:name"]?.label || ""),
    artist: decodeEntities(e["im:artist"]?.label || ""),
    img,
    summary: decodeEntities((e.summary?.label || "").slice(0, 140)),
    price: e["im:price"]?.label || "",
    link: e.link?.attributes?.href || "#",
    category: e.category?.attributes?.label || "",
  };
}
function appleChart(kind, limit = 12) {
  return getJSON(`https://itunes.apple.com/us/rss/${kind}/limit=${limit}/json`, 180, {}, (d) => !!d?.feed?.entry).then((d) =>
    (d.feed.entry || []).map(itunesEntry)
  );
}
function mediaCard(it, i) {
  const stars = Math.round(parseFloat((it.summary.match(/rated\s+([0-9.]+)/i) || [])[1] || 0));
  return `<a class="market-row" href="${it.link}" target="_blank" style="text-decoration:none;color:inherit">
    <img src="${it.img}" alt="" onerror="this.style.visibility='hidden'"/>
    <span class="market-name"><b>${i != null ? i + 1 + ". " : ""}${esc(it.title)}</b><small>${esc(it.artist)}${it.category ? " · " + esc(it.category.replace(/^Movies|^\\"TV/, "")) : ""}${it.price && it.price !== "Get" ? " · " + esc(it.price) : ""}</small></span>
    ${stars ? `<strong class="market-pct gain">★${stars}</strong>` : ""}
  </a>`;
}
async function jwPopular(type, genreId) {
  const kind = type === "show" ? "toptvseasons" : "topmovies";
  return appleChart(kind, 10);
}
function jwCard(it) {
  return mediaCard(it);
}
function addToWatchlistPrompt(it) {
  const year = ((it.title || "") + " " + (it.artist || "")).match(/\b(19|20)\d{2}\b/)?.[0] || "";
  const mEl = div(`
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
      ${it.img ? `<img src="${it.img}" alt="" style="width:52px;height:78px;object-fit:cover;border-radius:10px"/>` : ""}
      <div><b style="font-size:14px">${esc(it.title)}</b>${it.artist ? `<small style="display:block;color:var(--muted);font-size:11px;margin-top:3px">${esc(it.artist)}</small>` : ""}</div>
    </div>
    <button class="lib-chip wl-confirm" style="width:100%;justify-content:center;font-weight:600">🔖 Add to my Watchlist</button>`);
  openModal("Add to Watchlist", mEl);
  mEl.querySelector(".wl-confirm").addEventListener("click", () => {
    if (state.watchlist.some((w) => w.name === it.title)) { toast("Already in your Watchlist ✓"); return; }
    state.watchlist.push({ name: it.title, year, link: it.link || "#" });
    saveState();
    toast(`🔖 "${it.title}" saved to Watchlist`);
    document.querySelector("#modalRoot .modal-close")?.click();
  });
}
function jwTrending(type) {
  const el = div(loadingHTML("Fetching Apple charts…"));
  jwPopular(type)
    .then((items) => {
      el.innerHTML = items.map((it, i) => mediaCard(it, i)).join("") +
        `<p class="center-text" style="margin-top:8px;font-size:10px">💡 Tip: right-click any title to add it to your Watchlist</p>`;
      el.addEventListener("contextmenu", (e) => {
        const card = e.target.closest(".market-row");
        if (!card) return;
        e.preventDefault();
        const idx = [...el.querySelectorAll(".market-row")].indexOf(card);
        if (idx >= 0 && items[idx]) addToWatchlistPrompt(items[idx]);
      });
    })
    .catch(() => { el.innerHTML = errorHTML("Apple charts unreachable"); });
  return el;
}

/* ---------- Ticketmaster discovery (concerts) ---------- */
function openTicketmasterModal() {
  const setup = div(`
    <div style="text-align:center;padding:10px 6px">
      <p style="font-size:14px;margin-bottom:8px">Concerts are powered by <b>Ticketmaster</b> — the world's largest ticket marketplace.</p>
      <p class="center-text" style="line-height:1.8;font-size:12.5px">
        1. Create a free developer account at <a href="https://developer.ticketmaster.com/" target="_blank" style="color:var(--accent)">developer.ticketmaster.com</a><br/>
        2. Products → Discovery API → copy your <b>Consumer Key</b><br/>
        3. Paste it below — saved once, works forever.
      </p>
      <div style="display:flex;gap:8px;margin-top:14px;justify-content:center">
        <input class="note-area tm-key-input" placeholder="Paste your Ticketmaster Consumer Key…" style="min-height:0;padding:9px 12px;flex:1;max-width:340px;font-size:12px;direction:ltr"/>
        <button class="lib-chip tm-save" style="border-radius:10px">Connect ✓</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;justify-content:center">
        <input class="note-area tm-city-input" placeholder="City (e.g. New York)" value="${esc(state.concertCity || "New York")}" style="min-height:0;padding:9px 12px;flex:1;max-width:340px;font-size:12px"/>
        <span class="lib-chip" style="border-radius:10px;opacity:.7">🏙️</span>
      </div>
      <p class="center-text" style="margin-top:10px;font-size:11px;color:var(--muted)">Free · no credit card · used only from your browser</p>
    </div>`);
  openModal("Connect Ticketmaster", setup);
  const save = () => {
    const k = setup.querySelector(".tm-key-input").value.trim();
    if (!k) return;
    localStorage.setItem("tm_key", k);
    state.concertCity = setup.querySelector(".tm-city-input").value.trim() || "New York";
    saveState();
    toast("Ticketmaster connected ✓");
    renderGrid();
  };
  setup.querySelector(".tm-save").addEventListener("click", save);
  setup.querySelector(".tm-key-input").addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
}

/* ---------- Apple genre browsing (no API key needed) ---------- */
function appleGenreEntry(e) {
  const raw = decodeEntities(e.title?.label || "");
  const idx = raw.lastIndexOf(" - ");
  const imgs = e["im:image"] || [];
  return {
    title: idx > 0 ? raw.slice(0, idx) : raw,
    artist: idx > 0 ? raw.slice(idx + 3) : "",
    img: (imgs[imgs.length - 1] || {}).label || "",
    link: e.link?.attributes?.href || "#",
    category: e.category?.attributes?.label || "",
  };
}
function openGenreModal(genreId, genreName) {
  const m = div(loadingHTML(`Loading top ${genreName} films…`));
  openModal(`${genreName} — Top Movies`, m);
  getJSON(`https://itunes.apple.com/us/rss/topmovies/limit=12/genre=${genreId}/json`, 180, {}, (d) => !!d?.feed?.entry)
    .then((d) => {
      const items = (d.feed.entry || []).map(appleGenreEntry);
      if (!items.length) throw new Error("empty");
      m.innerHTML = `<div class="jw-grid">` + items.map((it) => mediaCard(it)).join("") + `</div>
        <p class="center-text" style="margin-top:8px;font-size:10px">💡 Right-click any title to add it to your Watchlist · Official Apple charts</p>`;
      m.addEventListener("contextmenu", (e) => {
        const card = e.target.closest(".market-row");
        if (!card) return;
        e.preventDefault();
        const idx = [...m.querySelectorAll(".market-row")].indexOf(card);
        if (idx >= 0 && items[idx]) addToWatchlistPrompt(items[idx]);
      });
    })
    .catch(() => { m.innerHTML = errorHTML(`No ${genreName} titles found right now`); });
}

/* ---------- Music player engine (iTunes 30s previews) ---------- */
const MUSIC = {
  audio: null, queue: [], i: -1,
  playing: false, name: "", artist: "", art: "",
};
const RADIO = { audio: null, playingId: null };
function itunesTrack(r) {
  return {
    name: decodeEntities(r.trackName || r.name || ""),
    artist: decodeEntities(r.artistName || ""),
    art: (r.artworkUrl100 || r.artworkUrl160 || "").replace("100x100", "200x200"),
    preview: r.previewUrl || r.url || "",
  };
}
function npEmit() { document.dispatchEvent(new Event("np")); }
async function resolvePreview(title, artist) {
  const q = await getJSON(`https://itunes.apple.com/search?term=${encodeURIComponent(title + " " + artist)}&entity=song&limit=5`, 1440, {}, (d) => !!d?.results);
  return (q.results || []).map(itunesTrack).find((t) => t.preview) || null;
}
function ensureAudio() {
  if (!MUSIC.audio) {
    MUSIC.audio = new Audio();
    MUSIC.audio.addEventListener("ended", nextTrack);
    MUSIC.audio.addEventListener("timeupdate", () => {
      document.querySelectorAll(".np-bar .progress-fill").forEach((f) => {
        f.style.width = (MUSIC.audio.duration ? (MUSIC.audio.currentTime / MUSIC.audio.duration) * 100 : 0) + "%";
      });
      document.querySelectorAll(".np-time").forEach((tEl) => {
        tEl.textContent = `${fmtTime(MUSIC.audio.currentTime)} / ${fmtTime(MUSIC.audio.duration || 0)}${MUSIC.name ? " — " + MUSIC.name : ""}`;
      });
    });
  }
  return MUSIC.audio;
}
function fmtTime(s) {
  s = Math.max(0, Math.round(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function playQueue(tracks, start = 0) {
  MUSIC.queue = tracks;
  MUSIC.i = start;
  playCurrent();
}
function playCurrent() {
  const t = MUSIC.queue[MUSIC.i];
  if (!t) return;
  const a = ensureAudio();
  a.src = t.preview;
  a.play().catch(() => {});
  MUSIC.playing = true;
  MUSIC.name = t.name;
  MUSIC.artist = t.artist;
  MUSIC.art = t.art;
  npEmit();
}
function togglePlay() {
  if (!MUSIC.queue.length) return;
  const a = ensureAudio();
  if (MUSIC.playing) { a.pause(); MUSIC.playing = false; }
  else { a.play().catch(() => {}); MUSIC.playing = true; }
  npEmit();
}
function nextTrack() {
  if (!MUSIC.queue.length) return;
  MUSIC.i = (MUSIC.i + 1) % MUSIC.queue.length;
  playCurrent();
}
function chartQueueModal() {
  const el = div(loadingHTML());
  appleChart("topsongs", 10).then((items) => {
    el.innerHTML = `<p class="center-text" style="margin-bottom:10px;font-size:12.5px">Tap any track to play its official preview</p>
      <div class="lib-widgets">` + items.map((t, i) =>
        `<button class="lib-chip" data-i="${i}">▶ ${esc(t.title)} — ${esc(t.artist)}</button>`
      ).join("") + `</div>`;
    el.querySelectorAll(".lib-chip").forEach((b) =>
      b.addEventListener("click", async () => {
        const it = items[+b.dataset.i];
        b.disabled = true;
        try {
          const t = await resolvePreview(it.title, it.artist);
          if (!t) throw new Error("no preview");
          playQueue([t], 0);
        } catch (e) { toast("No preview available"); }
        b.disabled = false;
      })
    );
  }).catch(() => { el.innerHTML = errorHTML(); });
  return el;
}
function tmdbGate(el) {
  if (getTmdbKey()) return false;
  el.innerHTML = `
    <div style="text-align:center;padding:14px 6px">
      <p class="center-text">Connect <b>TMDB</b> — the industry-standard movie DB — for live trending data.<br/>Free key from themoviedb.org.</p>
      <button class="lib-chip" style="margin-top:10px">🔑 Paste my free TMDB key</button>
    </div>`;
  el.querySelector("button").addEventListener("click", () => {
    const k = prompt("Paste your TMDB v3 API key (free from themoviedb.org → Settings → API):");
    if (k && k.trim()) {
      localStorage.setItem("tmdb_key", k.trim());
      toast("TMDB connected ✓");
      renderGrid();
    }
  });
  return true;
}
function tmdbTrending(type, window) {
  const el = div(loadingHTML("Fetching TMDB…"));
  if (tmdbGate(el)) return el;
  getJSON(`https://api.themoviedb.org/3/trending/${type}/${window}?api_key=${getTmdbKey()}`, 120).then((d) => {
    el.innerHTML = (d.results || []).slice(0, 7).map((m) =>
      `<a class="market-row" href="https://www.themoviedb.org/${type}/${m.id}" target="_blank" style="text-decoration:none;color:inherit">
        <img src="https://image.tmdb.org/t/p/w92${m.poster_path}" alt="" onerror="this.style.display='none'"/>
        <span class="market-name"><b>${decodeEntities(m.title || m.name)}</b><small>⭐ ${m.vote_average.toFixed(1)} · ${(m.release_date || m.first_air_date || "")}</small></span>
        <strong class="market-pct ${m.vote_average >= 7 ? "gain" : "loss"}">${m.vote_average.toFixed(1)}</strong>
      </a>`
    ).join("");
  }).catch(() => { el.innerHTML = errorHTML("TMDB unreachable — check your key"); });
  return el;
}

function closeCtxMenu() {
  document.querySelectorAll(".ctx-menu").forEach((m) => m.remove());
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 400);
  }, 2600);
}

const sideNav = document.getElementById("sideNav");
const grid = document.getElementById("widgetGrid");

function withFlip(mutate) {
  const widgets = [...grid.querySelectorAll(".widget")];
  const first = new Map(widgets.map((w) => [w.dataset.id, w.getBoundingClientRect()]));
  mutate();
  const after = [...grid.querySelectorAll(".widget")];
  after.forEach((w) => {
    const f = first.get(w.dataset.id);
    if (!f) return;
    const l = w.getBoundingClientRect();
    const dx = f.left - l.left;
    const dy = f.top - l.top;
    const sx = f.width / Math.max(l.width, 1);
    const sy = f.height / Math.max(l.height, 1);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
    w.style.transition = "none";
    w.style.transformOrigin = "top left";
    w.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    w.style.willChange = "transform";
    requestAnimationFrame(() => {
      w.style.transition = "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)";
      w.style.transform = "";
      const clear = () => {
        w.style.transition = "";
        w.style.transformOrigin = "";
        w.style.willChange = "";
        w.removeEventListener("transitionend", clear);
      };
      w.addEventListener("transitionend", clear);
      setTimeout(clear, 600);
    });
  });
}

function getOrder(catKey) {
  const defaults = getCats()[catKey]?.widgets || [];
  const removed = state.removed[catKey] || [];
  const base = state.orders[catKey] ? [...state.orders[catKey]] : [...defaults];
  defaults.forEach((id) => {
    if (!base.includes(id) && !removed.includes(id)) base.push(id);
  });
  return base.filter((id) => WIDGETS[id] && !removed.includes(id));
}

function sizeOf(catKey, id) {
  const v = state.sizes[catKey + ":" + id];
  return v === "m" ? "m" : "s";
}

function buildWidget(catKey, id) {
  const def = WIDGETS[id];
  const card = document.createElement("article");
  card.className = "widget size-" + sizeOf(catKey, id);
  card.dataset.id = id;
  card.draggable = true;
  card.querySelectorAll("textarea, input, button, select").forEach((el) => {
    el.addEventListener("mousedown", () => (card.draggable = false));
    document.addEventListener("mouseup", () => (card.draggable = true), { once: true });
  });

  const header = document.createElement("div");
  header.className = "widget-header";
  header.innerHTML =
    `<span class="widget-grab" draggable="true" title="Drag to move">⋮⋮</span>` +
    `<span>${def.icon}</span><span class="widget-title">${def.title}</span>` +
    `<button class="w-action act-size" title="Resize S/M">⤢</button>` +
    (def.detail ? `<button class="w-action act-detail" title="Details">🔍</button>` : "") +
    `<button class="w-action act-remove" title="Remove from this page">✕</button>`;
  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "widget-body";
  body.appendChild(def.render());
  card.appendChild(body);

  header.querySelector(".act-size").addEventListener("click", () => {
    const cur = sizeOf(catKey, id);
    const next = cur === "s" ? "m" : "s";
    state.sizes[catKey + ":" + id] = next;
    saveState();
    withFlip(() => {
      card.className = "widget size-" + next;
    });
  });

  const detBtn = header.querySelector(".act-detail");
  if (detBtn) detBtn.addEventListener("click", () => openModal(def.title, def.detail()));

  header.querySelector(".act-remove").addEventListener("click", () => {
    state.removed[catKey] = [...(state.removed[catKey] || []), id];
    state.orders[catKey] = getOrder(catKey).filter((x) => x !== id);
    saveState();
    withFlip(() => renderGrid());
  });

  const grab = header.querySelector(".widget-grab");
  card.addEventListener("dragstart", (e) => {
    dragSrcId = id;
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    clearDragMarkers();
    sideNav.querySelectorAll(".nav-item.drop-target").forEach((n) => n.classList.remove("drop-target"));
  });

  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!dragSrcId || dragSrcId === id) return;
    clearDragMarkers(card);
    const rect = card.getBoundingClientRect();
    card.classList.add(e.clientY > rect.top + rect.height / 2 ? "drag-over-bottom" : "drag-over-top");
  });
  card.addEventListener("drop", (e) => {
    e.preventDefault();
    handleDrop(id, card, e);
  });
  card.addEventListener("dragleave", () => card.classList.remove("drag-over-top", "drag-over-bottom"));

  return card;
}

let dragSrcId = null;

function clearDragMarkers(except) {
  grid.querySelectorAll(".widget").forEach((w) => {
    if (w !== except) w.classList.remove("drag-over-top", "drag-over-bottom");
  });
}

function handleDrop(targetId, targetCard, e) {
  if (!dragSrcId || dragSrcId === targetId) return;
  const catKey = state.activeCategory;
  const order = getOrder(catKey).filter((x) => x !== dragSrcId);
  let idx = order.indexOf(targetId);
  const rect = targetCard.getBoundingClientRect();
  if (e.clientY > rect.top + rect.height / 2) idx += 1;
  order.splice(idx, 0, dragSrcId);
  state.orders[catKey] = order;
  saveState();
  withFlip(() => renderGrid());
}

grid.addEventListener("dragover", (e) => e.preventDefault());

function openModal(title, bodyEl) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>${title}</h3>
          <button class="modal-close">✕</button>
        </div>
        <div class="modal-body"></div>
      </div>
    </div>`;
  root.querySelector(".modal-body").appendChild(bodyEl);
  const close = () => (root.innerHTML = "");
  root.querySelector(".modal-close").addEventListener("click", close);
  root.querySelector(".modal-overlay").addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) close();
  });
}

function openLibrary() {
  const catKey = state.activeCategory;
  const current = getOrder(catKey);
  const wrap = div("");
  const cats = getCats();
  const SUB_LABELS = { football: "⚽ Football", f1: "🏎️ Formula 1", basketball: "🏀 Basketball" };
  for (const [ck, cat] of Object.entries(cats)) {
    const ids = Object.keys(WIDGETS).filter((id) => WIDGETS[id].cat === ck);
    if (!ids.length) continue;
    const t = document.createElement("p");
    t.className = "lib-group-title";
    t.textContent = `${cat.icon} ${cat.label}`;
    wrap.appendChild(t);
    if (cat.sub && cat.sub.length) {
      cat.sub.forEach((subKey) => {
        const subIds = ids.filter((id) => WIDGETS[id].sub === subKey);
        if (!subIds.length) return;
        const subTitle = document.createElement("p");
        subTitle.className = "lib-group-title";
        subTitle.style.cssText = "margin:4px 0 2px;font-size:11px;opacity:.7;padding-left:8px";
        subTitle.textContent = SUB_LABELS[subKey] || subKey;
        const chips = document.createElement("div");
        chips.className = "lib-widgets";
        subIds.forEach((id) => {
          const b = document.createElement("button");
          b.className = "lib-chip" + (current.includes(id) ? " added" : "");
          b.innerHTML = `${WIDGETS[id].icon} ${WIDGETS[id].title}${current.includes(id) ? " ✓" : " ＋"}`;
          b.addEventListener("click", () => {
            state.removed[catKey] = (state.removed[catKey] || []).filter((x) => x !== id);
            state.orders[catKey] = [...getOrder(catKey), id];
            saveState();
            renderGrid();
            b.classList.add("added");
            b.innerHTML = `${WIDGETS[id].icon} ${WIDGETS[id].title} ✓`;
          });
          chips.appendChild(b);
        });
        wrap.appendChild(subTitle);
        wrap.appendChild(chips);
      });
    } else {
      const chips = document.createElement("div");
      chips.className = "lib-widgets";
      ids.forEach((id) => {
        const b = document.createElement("button");
        b.className = "lib-chip" + (current.includes(id) ? " added" : "");
        b.innerHTML = `${WIDGETS[id].icon} ${WIDGETS[id].title}${current.includes(id) ? " ✓" : " ＋"}`;
        b.addEventListener("click", () => {
          state.removed[catKey] = (state.removed[catKey] || []).filter((x) => x !== id);
          state.orders[catKey] = [...getOrder(catKey), id];
          saveState();
          renderGrid();
          b.classList.add("added");
          b.innerHTML = `${WIDGETS[id].icon} ${WIDGETS[id].title} ✓`;
        });
        chips.appendChild(b);
      });
      wrap.appendChild(chips);
    }
  }
  openModal("Widget Library", wrap);
}

function buildSidebar() {
  const cats = getCats();
  sideNav.innerHTML = "";
  for (const [key, cat] of Object.entries(cats)) {
    const btn = document.createElement("button");
    btn.className = "nav-item" + (state.activeCategory === key ? " active" : "");
    btn.innerHTML =
      `<span class="nav-icon">${cat.icon}</span><span class="nav-label">${cat.label}</span>` +
      (cat.custom ? `<span class="nav-del del-cat" data-key="${key}" title="Delete category">✕</span>` : "");
    btn.addEventListener("click", (e) => {
      if (e.target.classList.contains("del-cat")) {
        if (!confirm(`Delete category "${cat.label}"?`)) return;
        state.customCats = state.customCats.filter((c) => c.key !== key);
        delete state.orders[key];
        if (state.activeCategory === key) state.activeCategory = "general";
        saveState();
        render();
        return;
      }
      state.activeCategory = key;
      saveState();
      render();
    });

    btn.addEventListener("dragover", (e) => {
      if (!dragSrcId || key === state.activeCategory) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      sideNav.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("drop-target"));
      btn.classList.add("drop-target");
    });
    btn.addEventListener("dragleave", () => btn.classList.remove("drop-target"));
    btn.addEventListener("drop", (e) => {
      e.preventDefault();
      btn.classList.remove("drop-target");
      if (!dragSrcId || key === state.activeCategory) return;
      const from = state.activeCategory;
      state.removed[from] = [...new Set([...(state.removed[from] || []), dragSrcId])];
      state.orders[from] = getOrder(from).filter((x) => x !== dragSrcId);
      state.removed[key] = (state.removed[key] || []).filter((x) => x !== dragSrcId);
      state.orders[key] = [...getOrder(key), dragSrcId];
      const moved = dragSrcId;
      dragSrcId = null;
      saveState();
      renderGrid();
      toast(`Moved "${WIDGETS[moved].title}" to ${cats[key].label}`);
    });
    sideNav.appendChild(btn);
  }
}

function renderGrid() {
  if (!getCats()[state.activeCategory]) state.activeCategory = "general";
  const c = getCats()[state.activeCategory];
  document.getElementById("categoryTitle").textContent = c.label;
  document.getElementById("categoryHint").textContent = c.hint;
  grid.innerHTML = "";
  getOrder(state.activeCategory).forEach((id) => grid.appendChild(buildWidget(state.activeCategory, id)));
}

const STYLE_THEMES = {
  aurora: {
    label: "Aurora Glass", icon: "🫧",
    desc: "Frosted glass cards over a soft nature backdrop with ambient blur blobs.",
    swatches: ["#6574e8", "#9b6bd8", "#ffffffcc", "#b4d6ee"],
  },
  neumorphism: {
    label: "Neumorphism", icon: "🪨",
    desc: "Soft UI — extruded monochrome surfaces with dual light/dark shadows and inset wells.",
    swatches: ["#e0e5ec", "#bec3c9", "#ffffff", "#4d6bfe"],
  },
  vibrant: {
    label: "Vibrant Blocks", icon: "🟩",
    desc: "Bold energetic blocks in neon colors, chunky type, geometric patterns and playful hovers.",
    swatches: ["#39FF14", "#BF00FF", "#FF1493", "#00FFFF"],
  },
  oled: {
    label: "Dark Mode OLED", icon: "🖤",
    desc: "True-black power-efficient canvas, luminance elevation and neon accents with minimal glow.",
    swatches: ["#000000", "#121212", "#39FF14", "#0080FF"],
  },
  clay: {
    label: "Claymorphism", icon: "🧸",
    desc: "Squishy clay-like pastel surfaces with puffy dual inner highlights and candy shadows.",
    swatches: ["#EADFFB", "#FF8FB8", "#7C5CC4", "#FFF6E8"],
  },
  bento: {
    label: "Bento Box Grid", icon: "🍱",
    desc: "Apple-style tidy tiles — generous radii, quiet borders and colorful gradient cells.",
    swatches: ["#0071e3", "#F5F5F7", "#BF5AF2", "#FF9F0A"],
  },
  pixel: {
    label: "Pixel Art", icon: "👾",
    desc: "8-bit retro console — hard edges, zero blur, stepped pixel shadows and chiptune palette.",
    swatches: ["#1A1C2C", "#41A6F6", "#FFCD75", "#FF004D"],
  },
  hyper: {
    label: "3D Hyperrealism", icon: "💎",
    desc: "Cinematic dark materials — glossy reflections, specular edges and moody studio depth.",
    swatches: ["#17181C", "#E8B45A", "#58C4FF", "#2A2D37"],
  },
  product: {
    label: "3D Product Preview", icon: "📦",
    desc: "Clean studio stage — soft key-light shadows, floating objects and gallery-white space.",
    swatches: ["#EEF0F3", "#FFFFFF", "#2F6BFF", "#D8DEE9"],
  },
  chaos: {
    label: "Gen Z Chaos", icon: "🌪️",
    desc: "Maximalist stickers — clashing acid colors, tilted cards, thick outlines, pure attitude.",
    swatches: ["#CCFF00", "#FF90E8", "#23A9F2", "#111111"],
  },
  raw: {
    label: "Anti-Polish Raw", icon: "📎",
    desc: "Deliberately unstyled honesty — default fonts, square corners, bare HTML energy.",
    swatches: ["#FFFFFF", "#0000EE", "#DDDDDD", "#000000"],
  },
  biophilic: {
    label: "Organic Biophilic", icon: "🌿",
    desc: "Warm natural calm — sand paper textures, leafy greens, terracotta and soft blobs.",
    swatches: ["#F3EFE4", "#3A6B35", "#C96F4A", "#DCD3BD"],
  },
  biomimetic: {
    label: "Biomimetic Organic", icon: "🧬",
    desc: "Living-cell interface — morphing blob radii, deep teal fluids and bioluminescent accents.",
    swatches: ["#0D2B33", "#35E0C5", "#7EE787", "#123F49"],
  },
  micro: {
    label: "Micro-interactions", icon: "✨",
    desc: "Feedback-first clarity — springy overshoot eases, tactile presses and delightful states.",
    swatches: ["#FAFAFA", "#6C5CE7", "#FF7675", "#2D3436"],
  },
  motion: {
    label: "Motion-Driven", icon: "🌈",
    desc: "Kinetic identity — flowing gradient meshes, shimmering type and continuous movement.",
    swatches: ["#0B0B10", "#FF5CA8", "#7C5CFF", "#00E5FF"],
  },
  tactile: {
    label: "Tactile Deformable", icon: "🫠",
    desc: "Rubbery candy UI — chunky squishy shapes that squash, stretch and jiggle on touch.",
    swatches: ["#FFE9F0", "#FF8FAB", "#83E0BB", "#FFD166"],
  },
  zero: {
    label: "Zero Interface", icon: "🤍",
    desc: "Almost invisible chrome — typography-led calm, hairline dividers, content is the UI.",
    swatches: ["#FCFCFC", "#EDEDED", "#16181D", "#B9BDC7"],
  },
  hud: {
    label: "HUD Sci-Fi FUI", icon: "🛰️",
    desc: "Fictional cockpit graphics — clipped corners, cyan wireframes, scanlines and telemetry.",
    swatches: ["#050807", "#35F0FF", "#FFB454", "#0E1B1A"],
  },
  spatial: {
    label: "Spatial UI (visionOS)", icon: "🪟",
    desc: "Vision Pro glass — floating frosted panels with specular rims over a vivid depth scene.",
    swatches: ["#0F1030", "#FFFFFF99", "#5AC8FA", "#FF375F"],
  },
  glassDark: {
    label: "Glass Dark", icon: "🔮",
    desc: "Dark glassmorphism — frosted glass cards over soft gradient orbs with smooth animations.",
    swatches: ["#000000", "#E887BD", "#9DCEAE", "#83BDD3"],
  },
};

function applyTheme() {
  const forced = state.style === "oled" ? "dark" : state.theme;
  document.documentElement.dataset.theme = forced;
  document.documentElement.dataset.style = state.style;
  document.getElementById("themeBtn").textContent = forced === "dark" ? "☀️" : "🌙";
  document.getElementById("themeBtn").disabled = state.style === "oled";
}

function render() {
  buildSidebar();
  renderGrid();
  applyTheme();
  document.getElementById("sidebar").classList.toggle("collapsed", state.collapsed);
  document.getElementById("collapseBtn").textContent = state.collapsed ? "»" : "«";
}

document.getElementById("collapseBtn").addEventListener("click", () => {
  state.collapsed = !state.collapsed;
  saveState();
  render();
});

document.getElementById("themeBtn").addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  saveState();
  applyTheme();
});

document.getElementById("styleBtn").addEventListener("click", () => {
  const wrap = div(`<div class="style-grid"></div>`);
  const gridEl = wrap.querySelector(".style-grid");
  for (const [key, st] of Object.entries(STYLE_THEMES)) {
    const card = document.createElement("button");
    card.className = "style-card" + (state.style === key ? " current" : "");
    card.innerHTML =
      (state.style === key ? `<span class="style-check">✓ Active</span>` : "") +
      `<h4>${st.icon} ${st.label}</h4><p>${st.desc}</p>` +
      `<div class="style-swatch-row">${st.swatches.map((c) => `<i style="background:${c}"></i>`).join("")}</div>`;
    card.addEventListener("click", () => {
      state.style = key;
      saveState();
      applyTheme();
      openStyleModal();
      renderGrid();
    });
    gridEl.appendChild(card);
  }
  openModal("UI Style", wrap);
});

document.getElementById("resetBtn").addEventListener("click", () => {
  delete state.orders[state.activeCategory];
  delete state.removed[state.activeCategory];
  Object.keys(state.sizes).forEach((k) => {
    if (k.startsWith(state.activeCategory + ":")) delete state.sizes[k];
  });
  saveState();
  renderGrid();
});

document.getElementById("addWidgetBtn").addEventListener("click", openLibrary);

document.getElementById("newCatBtn").addEventListener("click", () => {
  const name = prompt("Name your new category:");
  if (!name?.trim()) return;
  const icons = ["📁", "🌟", "🚀", "📚", "🍕", "✈️", "💼", "🐱"];
  const key = "custom_" + Date.now();
  state.customCats.push({ key, label: name.trim(), icon: prompt("Pick an emoji icon:", pick(icons)) || "📁" });
  saveState();
  state.activeCategory = key;
  render();
});

loadState();
render();

window.addEventListener("unhandledrejection", (e) => {
  toast("⚠ " + (e.reason?.message || "Network error"));
});
window.addEventListener("error", (e) => {
  if (e.message) toast("⚠ " + e.message);
});
