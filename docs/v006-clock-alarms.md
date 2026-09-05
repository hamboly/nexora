# Clock alarms and twelve shortcuts (v006)

- Clock shows exactly eight world cities after excluding the device's local timezone, including canonical aliases. Its analog clock and small AM/PM remain on the same row.
- The header + button opens alarm settings: local time, label, daily or dated one-time repeat, two soft synthesized sounds, volume, and sound preview. Existing alarms remain compatible and receive stable IDs.
- One application-level scheduler runs independently of widget/category rendering. Occurrence claims persist before ringing; Web Locks serialize claims across supported same-origin tabs. Stop and five-minute snooze are available in a separate notification.
- Audio requires a user gesture after opening the page. The page must remain open, the device awake, and sound enabled. Browser background throttling can delay an alarm; occurrences more than five minutes late are skipped. This is not an operating-system alarm or a guarantee while the browser/device is asleep. Without Web Locks, simultaneous-tab deduplication is best effort.
- Quick Links reveals its existing third row (LinkedIn, X, Reddit, Dropbox): twelve tiles at medium/large density; small retains the existing four-tile summary.

## Verification

- 25 Node tests pass: timezone/DST formatting, layout and drag behavior, daily/one-time alarm claims, reload deduplication, snooze, soft audio envelopes, and two-tab scheduling with shared storage.
- JavaScript syntax checks pass. Local homepage, app, alarm module and stylesheet return HTTP 200. Private dotfiles remain HTTP 404.
- Browser fixture assertions updated for eight cities, alarm button, twelve visible shortcuts, normal Clock height and no internal overflow. These visual checks were NOT executed because the in-app browser's URL security block remains in force. Real sound output and browser autoplay behavior were NOT heard/verified.
- Local changes only; production was not deployed.
