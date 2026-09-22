---
description: Build, verify, commit and push to production
---
Deploy the current work to production. Steps, in order — stop and report if any step fails:

1. `git status --short` — show me what is about to ship.
2. `npm run build` (or `npx vite build --emptyOutDir false`). Fix build errors before continuing.
3. Commit with a specific message describing what changed. No generic "update" messages.
4. `git push origin main`.
5. Wait ~60s, then verify the deploy is actually live: `curl -s` the live site and grep the
   served bundle for a string you know is new in this change. Netlify's build hash differs
   from a local build, so hash comparison gives false alarms — grep for content.
6. Report: commit hash, what shipped, and confirmation the new code is being served.

If the build fails, do not commit. Report the error and stop.
