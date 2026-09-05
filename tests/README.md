Run `node tests/serve.cjs`, then open:

- `http://127.0.0.1:8472/tests/widget-sizes.html`
- `http://127.0.0.1:8472/tests/widget-sizes.html?mobile=1` at a mobile browser viewport.

The page runs all 51 non-Art widget renderers across 20 styles, both theme
settings (OLED retains its existing dark-only behavior), and all three sizes.
It checks internal overflow, clipped containers, content density, whole-row
disclosure, complete F1 results, late data, long notes, unsaved edits, game
continuity, style switching, size restoration, and the original Art controls.
Compact headers without S/M/L controls, removal of full-widget footers, and the light-mode
style dialog are also checked. Add `?manual=1` for isolated mouse testing.

Free canvas checks:

- `node --test tests/widget-layout.test.cjs tests/widget-canvas.test.cjs`
  validates exact coordinates, geometry helpers, bottom-right-only resizing,
  bounds, packing, independent cards, cancellation, undo, persistence, separate
  category/compact profiles, keyboard controls and the press-only drag cursor. The controller runs with a
  small DOM host, not a browser; these tests do not validate CSS rendering.
- `http://127.0.0.1:8472/tests/widget-canvas.html` exercises the live renderers
  across categories and styles. Add `?manual=1` to try the isolated canvas.

The server also accepts a port: `node tests/serve.cjs 8471` serves the real
dashboard at the existing preview address. After changing its asset allowlist,
restart the local server.

`node --test tests/clock-times.test.cjs` checks actual city times in winter and
summer, midnight updates and exclusion of the local timezone (including aliases).
It also checks separated AM/PM at noon and midnight without losing seconds.
The sizing browser fixture also checks inline hourly/weekly forecasts and world
clocks, with no Weather/Clock Details buttons, a single clock header row, compact
city times and weather content filling the available vertical space.

Provider responses and storage are isolated fixtures; this validates layout
and interactions, not the availability or accuracy of external APIs. The local
server serves only an explicit list of public assets and test files.
