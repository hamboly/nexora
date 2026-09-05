# Project Notes

## Workflow preferences
- After each completed, verified change, create a numbered checkpoint with `node scripts/versions.cjs create "Short description"`. This prints the next vNNN number and verifies its snapshot. Do not report a version before its snapshot verifies.
- Always include the version number, local preview link `http://127.0.0.1:8471/`, and production link `https://nexora-ham.vercel.app/` in the delivery. Clearly label whether that numbered version has actually been published; providing a production link does not authorize deployment.
- Keep the local preview in Codex's right-side browser panel when allowed. Do not automatically open an external browser. Respect browser security blocks; if refresh is blocked, say so and ask the user to refresh the existing panel.
- Checkpoints are stored locally under `.versions/vNNN/`. Run `node scripts/versions.cjs verify vNNN` before a requested rollback. First checkpoint the current work, then restore the requested snapshot's source files without touching `.env*`, `.git`, `.vercel`, or browser data. Review files added since that snapshot separately; do not delete unrelated work. Create a new numbered checkpoint describing the rollback and its source version.
- These version checkpoints cover source code, not browser-local notes, tasks, preferences or layout data. Keep persisted-data formats backward compatible; explain any data migration before a rollback that would affect them.
