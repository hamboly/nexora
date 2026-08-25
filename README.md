# Nexora

A calm personal widget dashboard powered by **100% live data** — no fake numbers, no placeholders. Every widget pulls real information from well-known public sources, so users never need to leave their homepage.

## ✨ Highlights

- 🧩 Widget-first UI: drag & drop, resize (S/M), per-page layouts, removable widgets
- 🎨 19 full UI styles (Aurora Glass, Bento, Pixel Art, HUD…) each with working dark/light mode
- 🌙 Global theme toggle tuned for readable contrast in every style
- 💾 Everything persists locally (localStorage) — zero backend required to run

## 🧰 Widgets

| Category | Widgets |
|---|---|
| Today | Today Summary (live weather/BTC/fixtures/player), Weather (Open-Meteo), Clock, Quick Links, Calendar, Notes, Tasks, Quote |
| Sports | Recent Results, Upcoming Fixtures, League Table, Scores Across Leagues, Team Finder |
| Finance | Crypto Watchlist (CoinGecko → CoinPaprika fallback), Stocks & FX (Yahoo Finance + FX rates), Gold Spot |
| Music | Now Playing (real 30s previews), Top Songs, Top Artists, Mood Mixes, Live Radio (Radio-Browser), Concerts (Ticketmaster key) |
| Movies | Top Movies / TV (Apple charts), Browse by Genre, Watchlist |
| Art | Artwork of the Day, Living Gallery (rotating Met highlights), Artist Spotlight, Daily Palette (The Color API), Exhibitions (AIC) |
| Fun | Joke of the Day, Trivia Rounds (10Q scored), Poll of the Day, Fun Facts, RPS League, Higher-or-Lower |

## 🔌 Data sources

Open-Meteo · CoinGecko · CoinPaprika · Yahoo Finance · exchangerate-api · gold-api.com · Apple/iTunes RSS & Search · Radio-Browser · TheSportsDB · The Met Museum · Art Institute of Chicago · OpenTDB · icanhazdadjoke · ZenQuotes · The Color API · Ticketmaster *(optional free key)* · TMDB *(optional free key)*

## 🚀 Run locally

Any static server works — there is no build step:

```bash
npx serve .
# or
python -m http.server 8471
```

## ☁️ Deploy

Static site — deploys to Vercel/Netlify/GitHub Pages with zero config.

## 🗄️ Supabase (phase 2)

`supabase/schema.sql` contains a ready-to-run schema (auth-backed sync for notes/tasks/watchlist/settings with row-level security).
