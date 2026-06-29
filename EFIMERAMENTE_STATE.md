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

To activate: share Google Calendar with service account, set calendar_email in Supabase therapists table.

## Completed Features
- [x] Sesiones calendar view (week/month/list)
- [x] Create/edit/cancel sessions with Google Calendar sync
- [x] Modalidad (En linea / Presencial) in Calendar event title
- [x] Conflict detection for overlapping sessions (Supabase)
- [x] Google Calendar sync active for Mariana Villegas
- [x] freebusy endpoint in Netlify function (commit b224f2e)
- [x] checkFreebusy() frontend helper in queries.js (commit 204dd3b)
- [x] **Pacientes module** — patient list, patient detail/profile, session history, notes/expediente, create patient w/ tarifa + metodo_pago (Build #5)
- [x] **Auth** — login page, RLS, role-gated routes (owner=all, therapist=sesiones only), 7 accounts live (nicolas@ + 6 therapists @efimeramente.ec)
- [x] **Logo PNGs** — all 3 in `public/logos/`: LOGOTIPOCORTO (1).png, LOGOTIPOLARGO (1).png, ISOTIPO (1).png
- [x] **PWA icon** — ISOTIPO (1).png = ISOTIPOEFIMERAMENTE.png from Drive (butterfly "em+" gradient, Drive id `16K1UqHjY7dX59r8LKj-lVD1ghhxLrpKu`)
- [x] **Pacientes.jsx encoding fix** — all mojibake replaced with correct UTF-8 (Configuracion, Metodo, sesion, Guardando, etc.)

## Pending / Backlog

### Immediate — next session
- [ ] **Seguimiento module** (Phase 4) — analytics: patient retention, sessions/therapist/month, no-show rate, pending payments. Uses recharts.
- [ ] **Finanzas module** (Phase 5) — income/expense ledger from `facturas` table, monthly totals, filter by therapist/month/payment method, mark sessions paid.
- [ ] **Twilio webhook** — `netlify/functions/twilio-webhook.js`: receive Twilio POST, parse body (si/no/reprogramar), match `From` to `patients.telefono`, write to `whatsapp_messages`, update session estado, respond with empty TwiML.
- [ ] **Trim therapist Sesiones view** — hide payment/confirm toggles + therapist filter when logged in as therapist role.

### Pending (no access yet)
- [ ] Activate Google Calendar for 5 remaining therapists

### Future
- [ ] **Llamada Gratuita** — public booking page for free intro calls
  - Backend ready: checkFreebusy() + freebusy action in calendar.js
  - Remaining: public booking UI, therapist selector, confirmation email

## Business Rules (locked)
- **Payment methods:** Transferencia | PayPhone | PayPal | Cash (`transferencia/payphone/paypal/cash`)
- **Session duration (incl. 15-min buffer):** Individual = 75 min, Pareja = 105 min. hora_fin computed from tipo — no field in form.
- **Nueva sesion form:** No estado/pagado/metodo fields. Born as `programada` + unpaid. Confirmation/payment via inline toggles in list view.
- **Per-patient tarifa** (default $39 USD) auto-fills session monto (editable). Per-patient metodo_pago default.
- **Patients created only in Pacientes module** — Nueva sesion picker is read-only.
- **Owner (Nicolas):** Full access — all modules, all therapists, all patients.
- **Therapist role:** Scheduling only — own calendar + own patient list. No Pacientes management, no Finanzas, no Seguimiento, no Dashboard.
- **Each patient belongs to exactly ONE therapist.**
- **33 sessions have hora_inicio = '00:00'** (placeholder from seed — flag for Nicolas to correct in Supabase).
- **Location:** Quito, Ecuador. Currency: USD. Timezone: America/Guayaquil (UTC-5).

## Auth Accounts (live)
| Role | Login email |
|------|------------|
| Owner | nicolas@efimeramente.ec |
| Therapist | mariana@efimeramente.ec |
| Therapist | carolina@efimeramente.ec |
| Therapist | daniela@efimeramente.ec |
| Therapist | camila@efimeramente.ec |
| Therapist | francisco@efimeramente.ec |
| Therapist | mariag@efimeramente.ec |

> Emails are not real domains — used as usernames. Passwords held by Nicolas.

## Supabase Grants (run if live data does not load)
```sql
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
```

## Workflow Notes
- GitHub web editor CM6 trick: document.querySelector('.cm-content')?.cmTile?.view then .dispatch({ changes: {...} })
- form_input MCP works for native select and input[type=time]; custom React dropdowns need mouse clicks
- Sandbox has no GitHub credentials — push via GitHub web editor only
- Drive logo assets: download via MCP -> base64 JSON at Mac temp path -> python3 decode command for Nicolas to run in Terminal -> cp to ~/my-site/public/logos/ -> git push

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
