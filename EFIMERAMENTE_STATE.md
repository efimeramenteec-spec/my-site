# Efimeramente Dashboard — State File

## HANDOFF PROTOCOL (read this first)
At the START of every build session: fetch https://raw.githubusercontent.com/efimeramenteec-spec/my-site/main/EFIMERAMENTE_STATE.md
At the END of every build session: update this file and commit it to GitHub via the web editor.
Memory files are read-only in Cowork — GitHub is the only persistent store. Do NOT use memory for handoffs.

---

## Project Overview
- **Stack:** React + Vite frontend, Supabase backend, Netlify serverless functions
- **Live URL:** https://genuine-praline-0f8e70.netlify.app
- **GitHub repo:** github.com/efimeramenteec-spec/my-site
- **Supabase project ID:** vnityzpuhnkumsyfnskz
- **Netlify function:** `/.netlify/functions/calendar`
- **Netlify plan:** Personal ($9/mo) — upgraded, build minutes no longer an issue

## Key Files
- `src/lib/queries.js` — core data layer: `buildCalendarEvent`, `callCalendar`, `createSession`, `updateSession`, `checkFreebusy`
- `netlify/functions/calendar.js` — serverless Google Calendar API bridge (actions: create, update, delete, freebusy)
- `src/lib/conflicts.js` — session conflict detection (Supabase only)

## Google Calendar Sync

### Setup
- Service account: `efimeramente-calendar@efimeramente-dashboard.iam.gserviceaccount.com`
- Key stored in Netlify env var: `GOOGLE_SERVICE_ACCOUNT_KEY` (base64-encoded)
- Each therapist must share their Google Calendar with the service account
- `calendar_email` column on `therapists` table = therapist Gmail = their Calendar ID
- `google_event_id` column on `sessions` table stores the synced Calendar event ID

### Event Title Format
`Sesion — {patient name} · {En linea | Presencial}`
- DB stores `en_linea` or `presencial` in `sessions.modalidad`
- `buildCalendarEvent` maps `en_linea` to En linea, else Presencial

### Conflict Detection
- App checks conflicts against Supabase sessions only (intentional)
- `checkFreebusy(calendarEmail, fecha, horaInicio, horaFin)` returns busy periods for Llamada Gratuita
- `TZ_OFFSET = '-05:00'` in queries.js (Ecuador, no DST)

### Therapist Calendar Status
| Therapist | calendar_email | Calendar shared |
|---|---|---|
| Mariana Villegas | marianavillegaskraemer@gmail.com | yes |
| Carolina | no | no |
| Daniela Espinosa | no | no |
| Camila | no | no |
| Francisco | no | no |
| Maria Gracia | no | no |

To activate: share Google Calendar with service account, set `calendar_email` in Supabase `therapists` table.
**Note:** Google Calendar settings UI is off-limits for computer-use going forward.

## Build Phases

| Phase | Module | Status |
|---|---|---|
| 1 | Dashboard | done |
| 2 | Sesiones | done |
| 3 | Pacientes | done (commit 6f6e3a7) |
| 4 | Seguimiento | NEXT |
| 5 | Finanzas | pending |
| - | Twilio webhook | pending |

## Completed Features
- [x] Dashboard (Phase 1)
- [x] Sesiones calendar view (week/month/list)
- [x] Create/edit/cancel sessions with Google Calendar sync
- [x] Modalidad (En linea / Presencial) in Calendar event title
- [x] Conflict detection for overlapping sessions (Supabase)
- [x] Google Calendar sync active for Mariana Villegas
- [x] freebusy endpoint in Netlify function (commit b224f2e)
- [x] checkFreebusy() frontend helper in queries.js (commit 204dd3b)
- [x] Pacientes module (commit 6f6e3a7) — patient list, profile, session history, notes/expediente

## Pending / Backlog

### Immediate — next session
- [ ] **Seguimiento** module — NEXT SPRINT

### Pending (no access yet)
- [ ] Activate Google Calendar for 5 remaining therapists

### Future
- [ ] **Finanzas** module
- [ ] **Twilio webhook** integration
- [ ] **Llamada Gratuita** — public booking page for free intro calls
  - Backend ready: checkFreebusy() + freebusy action in calendar.js
  - Remaining: public booking UI, therapist selector, confirmation email

## Workflow Notes
- GitHub web editor CM6 trick: `document.querySelector('.cm-content')?.cmTile?.view` then `.dispatch({ changes: {...} })`
- `form_input` MCP works for native `<select>` and `<input type="time">`; custom React dropdowns need mouse clicks
- Sandbox has no GitHub credentials — push via GitHub web editor only
- **Google Calendar settings UI is off-limits for computer-use**
- Memory files are READ-ONLY in Cowork — never attempt memory writes for handoffs

## Session Management (Self-Preservation Protocol)

### At the end of every session
1. Update this file with completed items, new pending items, changed technical details
2. Commit updated file to GitHub via web editor (this file: EFIMERAMENTE_STATE.md at repo root)
3. Tell Nicolas: "Start next session with: Fetch the Efimeramente state file from GitHub and let's continue."

### When to compact and start a new session
Suggest compacting when ANY of these apply:
- A full feature/module is completed
- Context is getting long or responses feel slower
- Waiting on something external (access, deploy review, etc.)
- Switching to a different type of task

Handoff phrase: "Good stopping point — want me to update the state file and set up a clean handoff?"
