---
description: Delete the staged duplicate project folders
---
There are three dead Efimeramente folders staged for deletion at
`~/Claude/Projects/_to_delete/`:
- `New Efimeramente App` (empty)
- `New Efimeramente App (1)` (empty)
- `New Efimeramente App 3` (91MB stale clone, last commit 2026-06-29, zero unpushed commits,
  all contents superseded by `~/my-site`)

This was already verified: nothing unique inside them.

1. Confirm `~/my-site` is on `main` with nothing unpushed (`git status`, `git log origin/main..HEAD`).
2. If clean, delete `~/Claude/Projects/_to_delete/` entirely.
3. Confirm how much disk space was recovered.

If `~/my-site` has unpushed commits, stop and tell me instead of deleting.
