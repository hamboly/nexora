# Free widget canvas

Goal: every category supports independent pixel positions, arbitrary gaps and eight-edge resizing.

Design: replace grid placement with positioned cards inside an expanding page canvas. Preserve widget DOM, content density, provider behavior and theme appearance. Use a small dependency-free geometry module; keep dashboard integration in app.js. No deployment or unrelated refactoring.

- Store rectangles per category and wide/compact canvas profile. Never overwrite a wide layout merely because a panel narrows.
- Seed new layouts from existing size preferences; auto-pack only until the first manual adjustment. Later additions find vacant space, without moving existing cards.
- Allow touching and overlapping cards deliberately. The moved card comes forward; no mandatory snapping, gaps, rows or collision displacement.
- Drag the body or title; exclude editing/playback controls. Move with arrow keys on the focused title; Alt+arrows resize, Shift increases the step.
- Resize north/west with the opposite edge anchored. Keep cards within the canvas width and above y=0. Extend the canvas downward as needed.
- Preserve no internal scrolling for non-Art cards; content establishes a minimum usable height. S/M/L remain density/size shortcuts. Art keeps its gallery renderer.
- Escape cancels an active gesture. Undo restores the previous layout; Auto arrange packs existing sizes on explicit request. Reset clears only the current category's layouts.

Implementation and verification:

1. Add geometry tests covering arbitrary spacing, anchored resizing, bounds, packing, persistence profiles and invalid stored rectangles; run failing then implement widget-layout.js.
2. Integrate canvas lifecycle, dragging, resize, presets, responsive profiles, keyboard control, undo and reset. Keep local servers' public-asset allowlist up to date.
3. Update isolated browser fixtures for the new interaction model. Run Node geometry/integration checks and static syntax checks. Browser verification is subject to the current Browser URL-policy block; do not route around it or claim visual verification if unavailable.
