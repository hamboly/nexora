const APP_NAME = "Smarter Than You";
const STORE_KEY = "smarter-than-you-v1";

let state = {
  activeCategory: "general",
  collapsed: false,
  theme: "light",
  orders: {},
  sizes: {},
  notes: "",
  todos: [],
  pollVotes: {},
  customCats: [],
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

const BUILTIN_CATS = {
  general: { label: "Today Summary", icon: "🏠", hint: "Your daily dashboard", widgets: ["todaySummary", "weather", "clock", "quickLinks", "calendar", "notes", "todos", "quote"] },
  sports: { label: "Sports", icon: "⚽", hint: "Live scores, match schedule and league tables", widgets: ["liveScores", "matchSchedule", "leagueTable"] },
  finance: { label: "Finance & Crypto", icon: "💰", hint: "Crypto, stocks, gold and currency", widgets: ["cryptoWatchlist", "stocks", "goldCurrency"] },
  music: { label: "Music", icon: "🎵", hint: "Player, trending tracks and concerts", widgets: ["nowPlaying", "trendingTracks", "topArtists", "moodMixes", "concerts"] },
  movies: { label: "Movies & Series", icon: "🎬", hint: "Trending movies & series, watchlist and genres", widgets: ["trendingMovies", "trendingSeries", "watchlist", "genreBrowser"] },
  art: { label: "Art", icon: "🎨", hint: "Artwork of the day, artists and exhibitions", widgets: ["artOfDay", "artistSpotlight", "colorStories", "exhibitions"] },
  fun: { label: "Entertainment", icon: "🎮", hint: "Jokes, quizzes, polls and mini games", widgets: ["dailyJoke", "triviaQuiz", "pollOfDay", "funFacts", "coinFlip"] },
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
    title: "Today Summary", icon: "☀️", cat: "general", size: "l",
    render() {
      const doneCount = state.todos.filter((t) => t.done).length;
      const total = state.todos.length;
      const dateStr = new Date().toLocaleDateString("en-US", { day: "numeric", month: "long" });
      const weekDay = new Date().toLocaleDateString("en-US", { weekday: "long" });
      return div(`
        <div class="summary-grid">
          <div class="sum-card"><div class="sc-icon">📅</div><div class="sc-val">${dateStr}</div><div class="sc-lbl">${weekDay}</div></div>
          <div class="sum-card"><div class="sc-icon">⛅</div><div class="sc-val">82°F</div><div class="sc-lbl">New York · Sunny</div></div>
          <div class="sum-card"><div class="sc-icon">✅</div><div class="sc-val">${doneCount}/${total}</div><div class="sc-lbl">Tasks done</div></div>
          <div class="sum-card"><div class="sc-icon">🪙</div><div class="sc-val up">+2.1%</div><div class="sc-lbl">Bitcoin</div></div>
          <div class="sum-card"><div class="sc-icon">⚽</div><div class="sc-val">2</div><div class="sc-lbl">Big games today</div></div>
          <div class="sum-card"><div class="sc-icon">🎵</div><div class="sc-val">Bohemian</div><div class="sc-lbl">Now playing</div></div>
        </div>`);
    },
  },
  weather: {
    title: "Weather", icon: "⛅", cat: "general", size: "m",
    render() {
      const hours = [["Now", "☀️", "18°"], ["11 AM", "⛅", "19°"], ["12 PM", "⛅", "19°"], ["1 PM", "☀️", "20°"], ["2 PM", "⛅", "19°"], ["3 PM", "🌧️", "18°"]];
      return div(`
        <div class="weather">
          <div class="wx-top">
            <div><span class="wx-temp">18°</span><p class="wx-desc">Partly cloudy</p></div>
            <div class="motion-weather"><i class="mw-sun"></i><i class="mw-cloud"></i></div>
          </div>
          <div class="wx-hours">${hours.map((h) => `<span><small>${h[0]}</small><em style="font-style:normal">${h[1]}</em><b>${h[2]}</b></span>`).join("")}</div>
          <div class="wx-meta"><span>New York</span><span>H: 22° · L: 13° · Feels like 19°</span></div>
        </div>`);
    },
    detail() {
      const rows = [
        ["Today", "82° / 66° ☀️"], ["Tomorrow", "86° / 68° ⛅"], ["Tuesday", "80° / 64° 🌧️"],
        ["Wednesday", "77° / 62° 🌧️"], ["Thursday", "84° / 66° ☀️"], ["Friday", "88° / 70° ☀️"], ["Saturday", "89° / 71° ⛅"],
      ];
      return list(rows.map((r) => row(r[0], r[1])));
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
          html += `<button class="cal-day${isToday ? " today" : ""}">${d}</button>`;
        }
        daysBox.innerHTML = html;
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
      let t;
      ta.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => { state.notes = ta.value; saveState(); }, 400);
      });
      return wrap;
    },
  },
  todos: {
    title: "Today's Tasks", icon: "✅", cat: "general", size: "m",
    render() {
      if (!state.todos.length) {
        state.todos = [
          { text: "Practice coding", done: false },
          { text: "Evening walk", done: true },
          { text: "Read for 30 minutes", done: false },
        ];
      }
      const wrap = div("");
      const paint = () => {
        wrap.innerHTML =
          state.todos
            .map((td, i) => `<label class="todo-item ${td.done ? "done" : ""}"><input type="checkbox" data-i="${i}" ${td.done ? "checked" : ""}/><span>${td.text}</span></label>`)
            .join("") || `<p class="center-text">All tasks done! 🎉</p>`;
      };
      paint();
      wrap.addEventListener("change", (e) => {
        if (e.target.matches("input[type=checkbox]")) {
          state.todos[e.target.dataset.i].done = e.target.checked;
          saveState();
          paint();
        }
      });
      return wrap;
    },
  },
  quickLinks: {
    title: "Quick Links", icon: "🔗", cat: "general", size: "m",
    render() {
      const links = [
        { n: "Gmail", i: "https://api.iconify.design/logos/google-gmail.svg", u: "https://mail.google.com" },
        { n: "Drive", i: "https://api.iconify.design/logos/google-drive.svg", u: "https://drive.google.com" },
        { n: "Notion", i: "https://api.iconify.design/logos/notion-icon.svg", u: "https://notion.so" },
        { n: "GitHub", i: "https://cdn.simpleicons.org/github/181717", u: "https://github.com" },
        { n: "YouTube", i: "https://api.iconify.design/logos/youtube-icon.svg", u: "https://youtube.com" },
        { n: "Spotify", i: "https://api.iconify.design/logos/spotify-icon.svg", u: "https://spotify.com" },
        { n: "Figma", i: "https://api.iconify.design/logos/figma.svg", u: "https://figma.com" },
        { n: "Slack", i: "https://api.iconify.design/logos/slack-icon.svg", u: "https://slack.com" },
      ];
      return div(
        `<div class="quick-links-grid">` +
          links.map((l) => `<a class="provider-tile" href="${l.u}" target="_blank"><span class="provider-logo"><img src="${l.i}" alt="${l.n}"/></span><small>${l.n}</small></a>`).join("") +
        `</div>`
      );
    },
  },
  quote: {
    title: "Quote of the Day", icon: "💭", cat: "general", size: "s",
    render() {
      const quotes = [
        ["Simplicity is the ultimate sophistication.", "— Leonardo da Vinci"],
        ["Art washes away the dust of everyday life.", "— Pablo Picasso"],
        ["The best way to predict the future is to invent it.", "— Alan Kay"],
      ];
      const q = pick(quotes);
      return div(`<div class="quote-box">${q[0]}<span class="quote-author">${q[1]}</span></div>`);
    },
  },

  liveScores: {
    title: "Live Scores", icon: "🔴", cat: "sports", size: "m",
    render() {
      const rows = [
        ["Lakers — Celtics", "102 - 99 · Q3"],
        ["Real Madrid — Barcelona", "1 - 1 · 78'"],
        ["Bayern — Dortmund", "3 - 0 · Full-time"],
      ];
      return list(rows.map((r) => row(r[0], r[1])));
    },
    detail() {
      const rows = [
        ["Arsenal — Chelsea", "Tonight 10:00 PM"],
        ["Inter Miami — LAFC", "Tonight 11:45 PM"],
        ["Juventus — AC Milan", "Tomorrow 9:30 PM"],
        ["Man City — Liverpool", "Sunday 12:30 PM"],
      ];
      return list(rows.map((r) => row(r[0], r[1])));
    },
  },
  matchSchedule: {
    title: "Match Schedule", icon: "📅", cat: "sports", size: "m",
    render() {
      const rows = [
        ["Arsenal — Chelsea", "Tonight 10:00 PM"],
        ["Inter Miami — LAFC", "Tonight 11:45 PM"],
        ["Juventus — AC Milan", "Tomorrow 9:30 PM"],
      ];
      return list(rows.map((r) => row(r[0], r[1])));
    },
  },
  leagueTable: {
    title: "League Table", icon: "🏆", cat: "sports", size: "m",
    render() {
      const rows = [
        ["1. Man City", "45 pts"], ["2. Arsenal", "42 pts"],
        ["3. Liverpool", "39 pts"], ["4. Chelsea", "35 pts"],
      ];
      return list(rows.map((r) => row(r[0], r[1])));
    },
  },

  cryptoWatchlist: {
    title: "Crypto Watchlist", icon: "🪙", cat: "finance", size: "m",
    render() {
      const rows = [
        ["https://cdn.simpleicons.org/bitcoin/F7931A", "Bitcoin", "BTC", "67,540.21", 2.45, [3, 5, 4, 7, 6, 8, 7, 9, 10]],
        ["https://cdn.simpleicons.org/ethereum/627EEA", "Ethereum", "ETH", "3,125.65", 1.23, [5, 4, 6, 3, 7, 6, 8, 7, 9]],
        ["https://cdn.simpleicons.org/solana/14F195", "Solana", "SOL", "165.34", -0.45, [9, 7, 8, 5, 6, 4, 6, 3, 2]],
        ["https://cdn.simpleicons.org/xrp/23292F", "XRP", "XRP", "0.58", 0.65, [2, 3, 4, 3, 5, 6, 5, 7, 8]],
      ];
      return div(rows.map((r) => marketRow(...r)).join(""));
    },
    detail() {
      const rows = [
        ["BNB", "$585 · +0.9%"], ["DOGE", "$0.12 · +3.1%"], ["ADA", "$0.45 · -0.6%"],
        ["DOT", "$6.85 · +1.4%"], ["MATIC", "$0.72 · -1.2%"],
      ];
      return list(rows.map((r) => row(r[0], r[1])));
    },
  },
  stocks: {
    title: "Stocks", icon: "📊", cat: "finance", size: "m",
    render() {
      const rows = [
        ["https://cdn.simpleicons.org/apple/6574e8", "Apple", "AAPL", "214.50", 0.6, [4, 5, 4, 6, 7, 6, 8, 9, 10]],
        ["https://cdn.simpleicons.org/tesla/cc0000", "Tesla", "TSLA", "248.10", -1.2, [9, 8, 9, 6, 7, 5, 6, 4, 3]],
        ["https://cdn.simpleicons.org/microsoft/5e5e5e", "Microsoft", "MSFT", "420.70", 0.3, [5, 6, 5, 7, 6, 8, 7, 9, 9]],
      ];
      return div(rows.map((r) => marketRow(...r)).join(""));
    },
  },
  goldCurrency: {
    title: "Gold & Currency", icon: "🥇", cat: "finance", size: "m",
    render() {
      const rows = [
        ["Gold ounce", "<b>$2,510</b> <span class='up'>+0.4%</span>"],
        ["EUR / USD", "<b>1.09</b> <span class='down'>-0.1%</span>"],
        ["USD Index", "<b>101.4</b> <span class='up'>+0.2%</span>"],
      ];
      return list(rows.map((r) => row(r[0], r[1])));
    },
  },

  nowPlaying: {
    title: "Now Playing", icon: "🎧", cat: "music", size: "m",
    render() {
      return div(`
        <div class="quote-box">🎵 Bohemian Rhapsody<span class="quote-author">Queen</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:42%"></div></div>
        <p class="center-text" style="margin-top:6px">2:24 / 5:55</p>`);
    },
  },
  trendingTracks: {
    title: "Trending Tracks", icon: "📈", cat: "music", size: "m",
    render() {
      const rows = [
        ["1. Flowers — Miley Cyrus", "3.2M plays"],
        ["2. As It Was — Harry Styles", "2.8M plays"],
        ["3. Blinding Lights — The Weeknd", "2.1M plays"],
      ];
      return list(rows.map((r) => row(r[0], r[1])));
    },
  },
  topArtists: {
    title: "Top Artists", icon: "🎤", cat: "music", size: "s",
    render() {
      const rows = [["The Weeknd", "98M listeners"], ["Taylor Swift", "85M"], ["Drake", "82M"]];
      return list(rows.map((r) => row(r[0], r[1])));
    },
  },
  moodMixes: {
    title: "Mood Mixes", icon: "🌈", cat: "music", size: "s",
    render() {
      const moods = ["🎯 Focus", "😴 Sleep", "💪 Workout", "🚗 Driving", "☕ Chill", "🎉 Party"];
      const wrap = div(`<div class="mood-chips"></div>`);
      const box = wrap.querySelector(".mood-chips");
      moods.forEach((m) => {
        const b = document.createElement("button");
        b.className = "mood-chip";
        b.textContent = m;
        b.addEventListener("click", () => {
          box.querySelectorAll(".mood-chip").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
        });
        box.appendChild(b);
      });
      return wrap;
    },
  },
  concerts: {
    title: "Upcoming Concerts", icon: "🎫", cat: "music", size: "m",
    render() {
      const rows = [
        ["Coldplay — MetLife Stadium", "Aug 27"],
        ["Billie Eilish — MSG", "Sep 12"],
      ];
      return list(rows.map((r) => row(r[0], r[1])));
    },
  },

  trendingMovies: {
    title: "Trending Movies", icon: "🔥", cat: "movies", size: "m",
    render() {
      const rows = [
        ["Oppenheimer", "⭐ 8.4"], ["Barbie", "⭐ 7.0"], ["Dune: Part Two", "⭐ 8.5"],
      ];
      return list(rows.map((r) => row(r[0], r[1])));
    },
  },
  trendingSeries: {
    title: "Trending Series", icon: "📺", cat: "movies", size: "m",
    render() {
      const rows = [
        ["House of the Dragon", "⭐ 8.3 · Ep 6"],
        ["Severance", "⭐ 8.7 · Season 2"],
        ["The Last of Us", "⭐ 8.7 · Season finale"],
      ];
      return list(rows.map((r) => row(r[0], r[1])));
    },
  },
  watchlist: {
    title: "Watchlist", icon: "🔖", cat: "movies", size: "m",
    render() {
      const items = [
        { n: "Interstellar", p: 100 }, { n: "Breaking Bad S05", p: 34 }, { n: "Oppenheimer", p: 62 },
      ];
      return div(
        items
          .map(
            (it) =>
              `<div style="padding:8px 6px;font-size:13px">${it.n}<div class="progress-bar"><div class="progress-fill" style="width:${it.p}%"></div></div></div>`
          )
          .join("")
      );
    },
  },
  genreBrowser: {
    title: "Genre Browser", icon: "🎭", cat: "movies", size: "m",
    render() {
      const genres = [
        ["Action", "#ff6b6b"], ["Drama", "#5b7cfa"], ["Comedy", "#f4a915"],
        ["Sci-Fi", "#9b6cff"], ["Horror", "#455a64"], ["Romance", "#ff8fab"],
      ];
      return div(
        `<div class="genre-grid">` +
          genres.map((g) => `<div class="genre-tile" style="background:${g[1]}">${g[0]}</div>`).join("") +
        `</div>`
      );
    },
  },

  artOfDay: {
    title: "Artwork of the Day", icon: "🖼️", cat: "art", size: "m",
    render() {
      return div(`<div class="quote-box">"The Starry Night" 🌌<span class="quote-author">Vincent van Gogh — 1889</span></div>`);
    },
  },
  artistSpotlight: {
    title: "Artist Spotlight", icon: "🖌️", cat: "art", size: "m",
    render() {
      return div(`<div class="quote-box">Claude Monet<span class="quote-author">Founder of Impressionism · over 2,000 works</span></div>`);
    },
  },
  colorStories: {
    title: "Color Palette", icon: "🌈", cat: "art", size: "s",
    render() {
      const colors = [["#ff8fab"], ["#ffd93d"], ["#6ee7b7"], ["#5b7cfa"], ["#23283b"]];
      const wrap = div(`<div class="swatches"></div>`);
      colors.forEach(([hex]) => {
        const d = document.createElement("div");
        d.className = "swatch";
        d.style.background = hex;
        d.innerHTML = `<span>${hex.slice(1)}</span>`;
        d.title = "Click to copy";
        d.addEventListener("click", () => navigator.clipboard?.writeText(hex));
        wrap.firstElementChild.appendChild(d);
      });
      return wrap;
    },
  },
  exhibitions: {
    title: "Exhibition Calendar", icon: "🏛️", cat: "art", size: "m",
    render() {
      const rows = [
        ["The Louvre — Paris", "'Rembrandt' until Sep 21"],
        ["MoMA — New York", "Modern sculpture biennale"],
        ["Tate Modern — London", "Digital art trends"],
      ];
      return list(rows.map((r) => row(r[0], r[1])));
    },
  },

  dailyJoke: {
    title: "Joke of the Day", icon: "😂", cat: "fun", size: "s",
    render() {
      const jokes = [
        "Why do programmers prefer dark mode? Because bugs are attracted to light!",
        "A programmer told water: you're 80% of my body but I'm still not type-safe on you!",
      ];
      return div(`<div class="quote-box">${pick(jokes)}</div>`);
    },
  },
  triviaQuiz: {
    title: "Trivia Quiz", icon: "❓", cat: "fun", size: "m",
    render() {
      const quiz = {
        q: "What is the tallest mountain in the world?",
        opts: ["K2", "Everest", "Denali"],
        a: 1,
      };
      const wrap = div(`<p style="font-size:14px;padding:8px 4px">${quiz.q}</p><div class="mood-chips"></div><p class="center-text result" style="margin-top:8px"></p>`);
      const box = wrap.querySelector(".mood-chips");
      const res = wrap.querySelector(".result");
      quiz.opts.forEach((o, i) => {
        const b = document.createElement("button");
        b.className = "mood-chip";
        b.textContent = o;
        b.addEventListener("click", () => {
          res.textContent = i === quiz.a ? "✅ Correct!" : `❌ Wrong! Answer: ${quiz.opts[quiz.a]}`;
          box.querySelectorAll("button").forEach((x) => (x.disabled = true));
        });
        box.appendChild(b);
      });
      return wrap;
    },
  },
  pollOfDay: {
    title: "Poll of the Day", icon: "🗳️", cat: "fun", size: "m",
    render() {
      const opts = ["Mornings ☀️", "Nights 🌙"];
      const key = "poll-day-night";
      const wrap = div(`<p style="font-size:14px;padding:6px 2px 10px">When do you get most work done?</p>`);
      let voted = state.pollVotes[key];
      const paint = () => {
        wrap.querySelectorAll(".poll-option").forEach((x) => x.remove());
        opts.forEach((o, i) => {
          const pct = voted == null ? null : i === voted ? 55 : 45;
          const b = document.createElement("button");
          b.className = "poll-option";
          b.innerHTML = `${o}<b>${voted == null ? "" : pct + "%"}</b>${voted != null ? `<span class="fill" style="width:${pct}%"></span>` : ""}`;
          b.addEventListener("click", () => {
            if (voted != null) return;
            voted = i;
            state.pollVotes[key] = i;
            saveState();
            paint();
          });
          wrap.appendChild(b);
        });
      };
      paint();
      return wrap;
    },
  },
  funFacts: {
    title: "Did You Know?", icon: "💡", cat: "fun", size: "s",
    render() {
      const facts = ["Octopuses have three hearts!", "Honey never spoils.", "A day on Venus is longer than its year!"];
      return div(`<div class="quote-box">${pick(facts)}</div>`);
    },
  },
  coinFlip: {
    title: "Coin Flip", icon: "🪙", cat: "fun", size: "s",
    render() {
      const wrap = div(`
        <button style="all:unset;cursor:pointer;display:block;margin:10px auto;padding:9px 20px;border-radius:11px;background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff;font-family:inherit;font-size:13px">Flip!</button>
        <p class="result center-text" style="font-size:24px;margin-top:4px">🪙</p>`);
      wrap.querySelector("button").addEventListener("click", () => {
        wrap.querySelector(".result").textContent = pick(["🦅 Heads", "✖️ Tails"]);
      });
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
  return `<div class="market-row"><img src="${img}" alt="${name}"/><span class="market-name"><b>${name}</b><small>${sym} · $${price}</small></span>${spark(points, pos)}<strong class="market-pct ${pos ? "gain" : "loss"}">${pos ? "+" : ""}${pct}%</strong></div>`;
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
  const saved = state.orders[catKey];
  if (!saved) return [...defaults];
  const valid = saved.filter((id) => WIDGETS[id]);
  const missing = defaults.filter((id) => !valid.includes(id));
  return [...valid, ...missing];
}

function sizeOf(catKey, id) {
  return state.sizes[catKey + ":" + id] || WIDGETS[id].size || "m";
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
    `<button class="w-action act-size" title="Resize S/M/L">⤢</button>` +
    (def.detail ? `<button class="w-action act-detail" title="Details">🔍</button>` : "") +
    `<button class="w-action act-remove" title="Remove from this page">✕</button>`;
  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "widget-body";
  body.appendChild(def.render());
  card.appendChild(body);

  header.querySelector(".act-size").addEventListener("click", () => {
    const cur = sizeOf(catKey, id);
    const next = cur === "s" ? "m" : cur === "m" ? "l" : "s";
    state.sizes[catKey + ":" + id] = next;
    saveState();
    withFlip(() => {
      card.className = "widget size-" + next;
    });
  });

  const detBtn = header.querySelector(".act-detail");
  if (detBtn) detBtn.addEventListener("click", () => openModal(def.title, def.detail()));

  header.querySelector(".act-remove").addEventListener("click", () => {
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
  for (const [ck, cat] of Object.entries(cats)) {
    const ids = Object.keys(WIDGETS).filter((id) => WIDGETS[id].cat === ck);
    if (!ids.length) continue;
    const t = document.createElement("p");
    t.className = "lib-group-title";
    t.textContent = `${cat.icon} ${cat.label}`;
    const chips = document.createElement("div");
    chips.className = "lib-widgets";
    ids.forEach((id) => {
      const b = document.createElement("button");
      b.className = "lib-chip" + (current.includes(id) ? " added" : "");
      b.innerHTML = `${WIDGETS[id].icon} ${WIDGETS[id].title}${current.includes(id) ? " ✓" : " ＋"}`;
      b.addEventListener("click", () => {
        state.orders[catKey] = [...getOrder(catKey), id];
        saveState();
        renderGrid();
        b.classList.add("added");
        b.innerHTML = `${WIDGETS[id].icon} ${WIDGETS[id].title} ✓`;
      });
      chips.appendChild(b);
    });
    wrap.appendChild(t);
    wrap.appendChild(chips);
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
      state.orders[from] = getOrder(from).filter((x) => x !== dragSrcId);
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

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.getElementById("themeBtn").textContent = state.theme === "dark" ? "☀️" : "🌙";
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

document.getElementById("resetBtn").addEventListener("click", () => {
  delete state.orders[state.activeCategory];
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
