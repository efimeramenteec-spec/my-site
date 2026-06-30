# Efimeramente Dashboard — State File

## Project Overview
- **Stack:** React + Vite frontend, Supabase backend, Netlify serverless functions
- **Live URL:** https://genuine-praline-0f8e70.netlify.app
- **GitHub repo:** github.com/efimeramenteec-spec/my-site
- **Supabase project ID:** vnityzpuhnkumsyfnskz
- **Netlify function:** `/.netlify/functions/calendar`

## Key Files
- `src/lib/queries.js` — core data layer: `buildCalendarEvent`, `callCalendar`, `createSession`, `updateSession`, `checkFreebusy`
- `netlify/functions/calendar.js` — serverless Google Calendar API bridge (actions: create, update, delete, freebusy)
- `src/lib/conflicts.js` — session conflict detection (Supabase only)
- `src/features/sesiones/SesionDrawer.jsx` — new/edit session drawer; `checkFreebusy` wired in (debounced 350ms, amber warning)

## Google Calendar Sync

### Setup
- Service account: `efimeramente-calendar@efimeramente-dashboard.iam.gserviceaccount.com`
- Key stored in Netlify env var: `GOOGLE_SERVICE_ACCOUNT_KEY` (base64-encoded)
- Each therapist must share their Google Calendar with the service account
- `calendar_email` column on `therapists` table = therapist Gmail = their Calendar ID
- `google_event_id` column on `sessions` table stores the synced Calendar event ID

### Event Title Format
`Sesión — {patient name} · {En línea | Presencial}`

### Conflict Detection
- App checks conflicts against Supabase sessions (via `conflicts.js`)
- `checkFreebusy` checks Google Calendar for external busy periods (wired into SesionDrawer, debounced 350ms, non-blocking, amber inline warning)
- `TZ_OFFSET = '-05:00'` in queries.js (Ecuador, no DST)

### Therapist Calendar Status
| Therapist | calendar_email | Synced |
|---|---|---|
| Camila Maya | camimaya22@gmail.com | ✅ yes |
| Carolina Almeida | carolinnalmeidaa@gmail.com | ✅ yes |
| Daniela Espinosa | daniela.espinosa.psic@gmail.com | ✅ yes |
| Francisco Mena | rfmena1@gmail.com | ✅ yes |
| Maria Gracia Villalba | mariamariavc8@gmail.com | ✅ yes |
| Mariana Villegas | marianavillegaskraemer@gmail.com | ✅ yes |

## Completed Features
- [x] Sesiones calendar view (week/month/list)
- [x] Create/edit/cancel sessions with Google Calendar sync
- [x] Conflict detection (Supabase) + Google Calendar freebusy check in drawer
- [x] All 6 therapists have calendar_email set in Supabase
- [x] Pacientes module (list, detail, create, expediente)
- [x] Auth (login, RLS, role-gated routes — owner + 6 therapist accounts)
- [x] Dashboard (KPIs, upcoming sessions, weekly chart)
- [x] `SUPABASE_SERVICE_KEY` (legacy service_role JWT) saved in `~/my-site/.env` — Opus agent can do Supabase writes autonomously

## Pending / Backlog

### Next (confirm with Nicolas before starting)
- [ ] **Seguimiento** — analytics: retention, sessions/therapist/month, no-show rate, pending payments (recharts)
- [ ] **Finanzas** — facturas ledger, monthly totals, mark-as-paid
- [ ] **Twilio webhook** — `netlify/functions/twilio-webhook.js`: receive Twilio POST, parse reply, update `whatsapp_messages` + session estado
- [ ] **Trim therapist Sesiones view** — hide pay/confirm toggles and owner-only filters from therapist role

### Pending (no access yet)
- Nothing blocking — all 6 therapists are synced

## Working Protocol

### Push workflow
- **Code changes:** Spawn Opus agent (model: opus) via Claude Code terminal at `~/my-site`
- Opus writes → `vite build --emptyOutDir false` → `git push` (SSH credentials in `~/my-site`)
- **Never use GitHub web editor CM6 injection** — no build verification, risk of bad commits
- Cowork (Sonnet) = project manager: prompts, memory, coordination. Opus = code maker

### Supabase writes
- Use `SUPABASE_SERVICE_KEY` from `~/my-site/.env` (legacy service_role JWT, role: service_role)
- Opus agent reads it in-process, never prints it
- Grants already applied: service_role has full access to all public tables

### DB grants (already applied)
```sql
-- anon + authenticated
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
-- service_role
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
```

### ⚠️ Gmail vs App login — never confuse these
- **App login:** `@efimeramente.ec` addresses (e.g. `mariana@efimeramente.ec`)
- **Google Calendar sync:** personal Gmails in `therapists.calendar_email`
- Always confirm Gmail addresses with Nicolas before setting — never infer or guess

## Session Management (Self-Preservation Protocol)

### At the end of every session
1. Update this file with completed items, new pending items, changed technical details
2. Commit updated file to GitHub via Opus agent (`git push` from `~/my-site`)
3. At start of next session, fetch from: https://raw.githubusercontent.com/efimeramenteec-spec/my-site/main/EFIMERAMENTE_STATE.md

### When to compact and start a new session
Suggest compacting when ANY of these apply:
- A full feature/module is completed
- Context is getting long or responses feel slower
- Switching to a different type of task
