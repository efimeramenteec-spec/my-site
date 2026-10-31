---
description: Close out a session — update state file, commit, push, update the Drive TO-DO
---
Close this session cleanly. If this session was an Efimeramente HQ employee (/michael, /alex,
/vince, /tim, /wes), say which one at the top of your summary.

1. Move any work completed this session out of `EFIMERAMENTE_STATE.md`'s "Completed Features"
   into `CHANGELOG.md` if it is older than ~1 month. Add this session's completed work to the
   TOP of "Completed Features" in the state file, dated, with the technical details a future
   session would need (file paths, function names, migration names, gotchas).
2. Update "Pending / Backlog": remove what is now done, add what surfaced today.
3. If `EFIMERAMENTE_STATE.md` is over 600 lines, move the oldest completed entries to
   `CHANGELOG.md` until it is under.
4. Build, commit, push. Push rejected (someone else pushed): `git pull --rebase`, then push. Never force-push.
5. **Update `PERMANENT TO-DO.md` in Google Drive** (folder "Efimeramente · Claude",
   id `16av_FWmaWjsw_WdyFwSuOqwd-Yf893bI`; find the file by title — its id changes on each replace).
   Download it, then: mark what's done in ONE line each (with the commit hash), add what came up,
   AND make it reflect every decision or live-state change from this session — update ACTIVE
   BACKLOG, LIVE / UNDER OBSERVATION and DECISIONS IN FORCE accordingly (add, reword or remove
   what changed). Keep it under 15 KB. Replace it: `create_file` the full new content
   (same title, same folder, `text/markdown`, `disableConversionToGoogleType: true`), verify it
   reads back, then trash the old file id. No Drive connector → say so; don't skip silently.
   This is the ONE company memory file: every employee session updates it on closing. Each
   line you add or change is signed with the employee who did the work, e.g. `(Wes, 29 Oct)`
   (`(Michael, …)` when no employee was named), and the WHO'S WHO status of that employee
   is updated if it changed. Never create a second memory/handoff file.
6. **Refresh the HQ desk** (the WhatsApp desk reads these; it can't read Drive):
   - Upsert `hq_contexto` row `clave='prioridades'` with the top 5 of ACTIVE BACKLOG by score, what is
     waiting on Nicolás, and standing facts (plain English, max ~1,500 chars, `actualizado_por` = who
     closed, `updated_at = now()`).
   - Every `hq_orders` row this session finished: set `estado='hecho'` (by id) so its "!" clears.
7. Give me a 5-line summary of what shipped and what the next session should pick up.
