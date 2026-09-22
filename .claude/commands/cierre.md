---
description: Close out a session — update state file, commit, push
---
Close this session cleanly:

1. Move any work completed this session out of `EFIMERAMENTE_STATE.md`'s "Completed Features"
   into `CHANGELOG.md` if it is older than ~1 month. Add this session's completed work to the
   TOP of "Completed Features" in the state file, dated, with the technical details a future
   session would need (file paths, function names, migration names, gotchas).
2. Update "Pending / Backlog": remove what is now done, add what surfaced today.
3. If `EFIMERAMENTE_STATE.md` is over 600 lines, move the oldest completed entries to
   `CHANGELOG.md` until it is under.
4. Build, commit, push.
5. Give me a 5-line summary of what shipped and what the next session should pick up.
