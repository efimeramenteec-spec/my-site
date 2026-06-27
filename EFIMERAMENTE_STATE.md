# Efimeramente Dashboard — State File

## Project Overview
- **Stack:** React + Vite frontend, Supabase backend, Netlify serverless functions
- **Live URL:** https://genuine-praline-0f8e70.netlify.app
- **GitHub repo:** github.com/efimeramenteec-spec/my-site
- **Supabase project ID:** vnityzpuhnkumsyfnskz
- **Netlify function:** `/.netlify/functions/calendar`
- **Netlify plan:** Personal ($9/mo) — upgraded 2026-06-27

## Key Files
- `src/lib/queries.js` — core data layer: `buildCalendarEvent`, `callCalendar`, `createSession`, `updateSession`, `checkFreebusy`, `getPatientsData`, `createPatient`, `updatePatient`
- `src/lib/demoStore.js` — demo data store: includes `demoCreatePatient`, `demoUpdatePatient`
- `netlify/functions/calendar.js` — serverless Google Calendar API bridge (actions: create, update, delete, freebusy). **Zero ACL/sharing calls — off-limits for computer-use.**
- `src/lib/conflicts.js` — session conflict detection (Supabase only)
- `src/pages/Pacientes.jsx` — patient list, sticky detail panel, create drawer (783 lines)
- `src/layout/icons.jsx` — includes IconSearch, IconX, IconPhone, IconMail

## Google Calendar Sync

### Setup
- Service account: `efimeramente-calendar@efimeramente-dashboard.iam.gserviceaccount.com`
- Key stored in Netlify env var: `GOOGLE_SERVICE_ACCOUNT_KEY` (base64-encoded)
- Each therapist must share their Google Calendar with the service account
- `calendar_email` column on `therapists` table = therapist Gmail = their Calendar ID
- `google_event_id` column on `sessions` table stores the synced Calendar event ID
- **⚠️ IMPORTANT:** Google Calendar settings UI is **off-limits for computer-use**. A previous session accidentally sent a sharing invitation to a patient while navigating settings. Calendar sharing must always be done manually by Nicolas/Mariana.

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

To activate: share Google Calendar with service account, set calendar_email in Supabase therapists table.

## Completed Features
- [x] Sesiones calendar view (week/month/list)
- [x] Create/edit/cancel sessions with Google Calendar sync
- [x] Modalidad (En linea / Presencial) in Calendar event title
- [x] Conflict detection for overlapping sessions (Supabase)
- [x] Google Calendar sync active for Mariana Villegas
- [x] freebusy endpoint in Netlify function (commit b224f2e)
- [x] checkFreebusy() frontend helper in queries.js (commit 204dd3b)
- [x] **Pacientes module** (commit 6f6e3a7, 2026-06-27) — patient list with search + estado + therapist-color filters, sticky 420px detail panel, inline editable tarifa/metodo_pago/estado, session history newest-first, CreatePatientDrawer with full form. Mobile-responsive (list hides when panel open).

## Pending / Backlog

### Immediate — next session
- [ ] **Seguimiento module** — NEXT SPRINT
- [ ] **Finanzas module**
- [ ] **Twilio webhook** — `netlify/functions/twilio-webhook.js` (auto-confirm sessions from WhatsApp replies)

### Pending (no access yet)
- [ ] Activate Google Calendar for 5 remaining therapists

### Future
- [ ] **Llamada Gratuita** — public booking page for free intro calls
  - Backend ready: checkFreebusy() + freebusy action in calendar.js
  - Remaining: public booking UI, therapist selector, confirmation email
- [ ] Trim therapist Sesiones view (hide payment/confirm toggles + therapist filter — scheduling-only)

## Workflow Notes
- GitHub web editor CM6 trick: document.querySelector('.cm-content')?.cmTile?.view then .dispatch({ changes: {...} })
- Files with template literals (${}) must be base64-encoded in bash then decoded via atob() in browser before injecting into CM6 editor
- form_input MCP works for native select and input[type=time]; custom React dropdowns need mouse clicks
- Sandbox has no GitHub credentials — push via GitHub web editor only

## Session Management (Self-Preservation Protocol)

### At the end of every session
1. Update this file with completed items, new pending items, changed technical details
2. Commit updated file to GitHub (repo root: EFIMERAMENTE_STATE.md)
3. At start of next session, fetch from: https://raw.githubusercontent.com/efimeramenteec-spec/my-site/main/EFIMERAMENTE_STATE.md

### When to compact and start a new session
Suggest compacting when ANY of these apply:
- A full feature/module is completed
- Context is getting long or responses feel slower
- Waiting on something external (access, deploy review, etc.)
- Switching to a different type of task

Handoff phrase: Good stopping point — want me to update the state file and set up a clean handoff for next session?
