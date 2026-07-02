# Efimeramente Dashboard — State File

> **Read `CLAUDE.md` first** — it's the stable architecture/orientation doc (auto-loaded each session).
> This file is the **living backlog + session log** only. As of 2026-07-01 the workflow is simplified to a
> **single clone** (`~/my-site`) worked directly with Claude Code; the "two-clone / Cowork / spawn-Opus"
> protocol in the sections below is **retired** — kept only for historical context.

## Project Overview
- **Stack:** React + Vite frontend, Supabase backend, Netlify serverless functions
- **Live URL:** https://efimeramente-panel.netlify.app (renamed session #9; Supabase Auth site URL updated to match)
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
- [x] Session `estado` DB default changed to `'programada'` (was `'confirmada'`) — SQL: `ALTER TABLE sessions ALTER COLUMN estado SET DEFAULT 'programada'`
- [x] ListView defaults to upcoming sessions (fecha >= today), "Ver historial" toggle reveals past sessions sorted newest-first — commit 275baf5
- [x] Session cards colored by therapist (was estado) in WeekView/MonthView — commit 71bb26e
- [x] Estado/pagado synced from Google Sheet (session #9) — 42 sessions updated: 26 marked paid, 14 cancelled, 2 confirmed. Guarded: never downgrades confirmada→programada (blank sheet cell = leave as-is) and never un-pays. One-off via `sync-estados.js` (+ `Sesiones_Consultorio.xlsx`), both now gitignored (PII); `xlsx` is a devDependency

- [x] **WhatsApp reminder system deployed + verified end-to-end** (2026-07-01). Root cause of the day's broken deploys found (with Cowork): Netlify functions ran in AWS **Lambda-compat mode**, whose **4KB combined env-var limit** was exceeded (mostly the ~3.2KB `GOOGLE_SERVICE_ACCOUNT_KEY`), so every deploy since ~yesterday failed at the Deploying stage and Netlify kept serving a stale build — which is why `send-reminders` reported "Supabase key missing" despite the key being set. **Fix:** migrated all three functions to the **modern runtime** (`.mjs`, `export default (req)=>Response`), which runs off Lambda and removes the 4KB cap. Shared logic → `netlify/lib/whatsapp.mjs`. `send-reminders` is now cron-only (`export const config`); the `?test_session_id` manual path + health probe moved to `twilio-webhook`. Verified live: test send → real WhatsApp received; **Confirmo → `confirmada`**, **Cancelar → `cancelada`** both confirmed. Remaining to go fully live: set `REMINDERS_LIVE=true` in Netlify.

- [x] **Post-migration testing round — all core flows verified working** (2026-07-01 PM). Fixed three issues found in live testing: **(1) Calendar CORS preflight 502** — the modern-runtime rewrite returned `new Response('', {status:204})`, but HTTP 204 forbids a body, so the web `Response` constructor threw and the OPTIONS preflight 502'd. Browsers preflight the JSON POST, so this silently blocked EVERY browser call to the calendar function → no Google Calendar event creation and no freebusy conflict checks. Fixed to `Response(null, …)` (commit b7ee6d4). **(2) Therapist color palette collision** — `therapists.color` reused the status colors (Camila=yellow=Pendiente, Mariana=lavender=Confirmada, Carolina=salmon=Cancelada), so week/month/list borders looked mismatched. Reassigned all 6 to a distinct, non-colliding palette (Camila teal `#14B8A6`, Carolina orange `#F97316`, Daniela blue `#3B82F6`, Francisco pink `#EC4899`, Maria Gracia green `#22C55E`, Mariana indigo `#6366F1`) — DB-only change, no deploy. **(3)** Clarified reminder timing (cron top-of-hour, 24h-before, not on-booking). Nicolas confirmed scheduling→Google Calendar, freebusy warnings, colors, and reminder confirm/cancel all work end-to-end. **Practice may begin real use 2026-07-02.**

- [x] **Therapists can create patients inline from the session scheduler** (2026-07-02, commit 249a242). Previously "crear paciente" was owner-only — the whole Pacientes page is owner-gated in routing, and RLS gave therapists read-only on `patients`. Decision (per Nicolas): keep it **inline in the session drawer** (their one screen), not a new page. Added a "+ Crear paciente nuevo" entry to the patient picker (`PatientSelect.jsx`) that opens a nested mini-form in `SesionDrawer.jsx` (nombre, apellido, telefono[required, prefilled `+593`], email, motivo). On save it creates the patient and auto-selects them into the session. **Auto-assign, billing hidden:** therapist → assigned to self; owner → assigned to the session's selected therapist; tarifa/metodo_pago hidden and use DB defaults (39/transferencia). Therapist **UPDATE/DELETE on patients stays owner-only** (edits happen in the owner Pacientes page). RLS: new policy `patients_therapist_insert` (`supabase/therapist-create-patient.sql`) with `WITH CHECK (terapeuta_id = my_terapeuta_id())` — **run + verified in prod by Cowork 2026-07-02** (one row, cmd=INSERT). Gotcha to watch: `patients.telefono` UNIQUE still applies, so reusing an existing number fails with an inline error.

- [x] **Owner can reassign a patient's therapist** (2026-07-02, commit 5b25fda). Added a Terapeuta dropdown to `PatientDetail`'s Configuración section (Pacientes page, owner-only). Persists via the existing `terapeuta_id` whitelist column. Amber caveat when changed: reassignment moves only the patient — sessions already on the calendar keep their original therapist. Rare but real case (e.g. patient switches therapists).

- [x] **Fixed recurring "stale build" problem — orphaned service worker** (2026-07-02, commit f8460d2). Symptom: after every deploy Nicolas's browser kept showing the old app (couldn't see new features), while a fresh `curl` of the live bundle already had the new code. Root cause (diagnosed with Cowork): an early deploy registered a PWA service worker; the current build ships none, so browsers stuck with the old SW served a cached stale app shell forever — the SW's `/sw.js` update check hit the SPA fallback (HTML), which browsers reject, so the orphan never died. Fix: shipped a **self-destroying `public/sw.js`** (skipWaiting → clear all caches → `unregister()` → reload open tabs) + `public/_headers` pinning `/sw.js` to `Cache-Control: no-cache`. The app uses **no** service worker by design (always-online tool, needs fresh data) — do NOT re-add `vite-plugin-pwa`. Verified live: `/sw.js` serves `application/javascript` + `no-cache`. See CLAUDE.md § Conventions & gotchas. **Tip:** to check a deploy is really live, grep the served bundle for a known-new string — Netlify's build hash differs from a local build, so hash comparison gives false alarms.

- [x] **Public booking page / "Llamada" — BUILT** (2026-07-02, Fable 5, per `PUBLIC_BOOKING_SPEC.md`).
  The last Calendly replacement. **⚠️ NOT live until Nicolas runs `supabase/public-booking.sql` in the
  Supabase SQL editor** (adds `llamada` to the `sessions.tipo` check, `therapists.booking_enabled` +
  `booking_availability` jsonb, and the `booking_attempts` rate-limit table — verified missing in prod
  before build). What shipped:
  - **`netlify/functions/public-booking.mjs`** — the first public/unauthenticated surface; service-key
    only (NO anon RLS opened). `GET ?action=therapists` (public-safe fields only: id/nombre/apellido/color),
    `GET ?action=slots&therapist&date` (configured weekly windows − Google freebusy − existing sessions,
    30-min cadence, 10-min calls, 12h min notice, 14-day horizon, Ecuador tz; freebusy failures FAIL
    CLOSED), `POST ?action=book` (honeypot → fake 200; rate limits 2/phone/day + 5/IP/hour via
    `booking_attempts`, fail-open if ledger breaks; strict validation; slot re-verified server-side →
    409 `slot_taken`; patient reused by phone match [same norm/last-9 logic as the Twilio webhook] or
    created; session tipo=`llamada`, modalidad=`en_linea` (verified real enum value), monto 0; Google
    Calendar event `Llamada — {nombre} · 10 min` best-effort).
  - **`netlify/lib/calendar.mjs`** — shared Google auth + freebusy, factored out of `calendar.mjs`
    (which now imports it; behavior unchanged).
  - **`send-reminders.mjs`** hardened with `.neq('tipo','llamada')` — llamadas NEVER get a WhatsApp
    reminder however created. (Checked: no NULL-tipo rows in prod, so `.neq` drops nothing else.)
  - **`/agendar` public page** (`src/pages/PublicBooking.jsx`) — outside `Gate`, no auth/chrome, only
    fetches the function. Therapist cards → date strip (14 days) → slot grid → intake form (Nombre,
    Apellido, Teléfono +593, Email/motivo opcionales, hidden `website` honeypot) → confirmation. Deep
    link `/agendar?terapeuta=<id>` skips step 1. 409 → toast + slot re-fetch; 429 → friendly message.
  - **Owner editor** `/agenda-publica` (nav "Llamadas", owner-only; `src/pages/AgendaPublica.jsx`) —
    per-therapist Visible toggle (saves immediately), weekly hour ranges per day (mon..sun jsonb,
    add/remove + Guardar), copy buttons for `/agendar` and per-therapist links. Data via new
    `getTherapistsBooking` / `updateTherapistBooking` in `queries.js` (write whitelist: only the two
    booking columns).
  - `constants.js`: `llamada` in `TIPO_SESION`/`TIPO_FORM` ("Llamada (10 min)"), `DURACION_MIN`=10 —
    internal drawer can also schedule llamadas (auto 10-min end; set monto 0 manually there).

- [x] **Public booking VERIFIED LIVE end-to-end** (2026-07-02). Migration `supabase/public-booking.sql`
  run + verified by Cowork (tipo check, booking columns, `booking_attempts` RLS on/no policies).
  Deployed function verified: OPTIONS preflight 204, therapists endpoint (no PII), slots math
  cross-checked EXACTLY against Daniela's real Google freebusy (busy 09:00–10:15 + 16:00–17:15 EC
  correctly removed from her 09:00–17:00 Friday window), horizon + no-hours cases correct. Nicolas
  ran the real booking test: "works beautifully on all ends." Note: Nicolas toggled all 6 therapists
  visible while testing — only therapists WITH hours configured show slots; the rest show "no hay
  horarios" publicly until hours are set (or they're toggled off).

- [x] **Disponibilidad module (renamed from "Llamadas") now therapist-accessible** (2026-07-02).
  Route `/agenda-publica` → **`/disponibilidad`**, page `src/pages/Disponibilidad.jsx`, nav label
  "Disponibilidad" (no longer ownerOnly). Owner sees/edits all therapists; a therapist sees ONLY her
  own card (filtered by `useAuth().terapeutaId`). **⚠️ Requires `supabase/therapist-availability.sql`**
  (new RLS policy `therapists_self_update`: therapist may UPDATE her own therapists row) — until it's
  run, therapist saves fail with an RLS error (owner unaffected). Caveat noted in the .sql: row-level
  policy means a therapist could technically update other columns of her own row via the API; the app
  only writes the two booking columns — accepted for this internal tool.

- [x] **Therapist color palette reassigned per Nicolas** (2026-07-02, DB-only, no deploy needed):
  Camila **pink `#EC4899`**, Carolina **yellow `#EAB308`**, Daniela **red `#EF4444`**, Francisco
  **dark green `#15803D`**, Maria Gracia **orange `#F97316`**, Mariana **blue `#3B82F6`**.
  (Supersedes the 2026-07-01 palette. Heads-up: Carolina's yellow is close to the Pendiente status
  yellow `#ffd84a` — explicitly Nicolas's choice.)

## Pending / Backlog

### Immediate — go-live remainder (public booking)
- [ ] **Run `supabase/therapist-availability.sql`** in the Supabase SQL editor (idempotent) — unblocks
      therapists saving their own hours in Disponibilidad.
- [ ] Each therapist (or Nicolas) sets real hours in **Disponibilidad**; toggle OFF anyone who
      shouldn't appear publicly yet (all 6 are currently visible from testing; 5 have no hours).
- [ ] Clean up the test llamada/patient from Nicolas's live test if not already cancelled.
- [ ] Add the marketing site origin to `ALLOWED_ORIGINS` in `public-booking.mjs` if the page is ever
      embedded/linked cross-origin (list currently mirrors `calendar.mjs`).

### Immediate — next session
- [ ] **Minor UI / aesthetic polish** (non-blocking, per Nicolas 2026-07-01): assorted cosmetic/UI bugs remain across the app — collect specifics at the start of next session. Core architecture (scheduling, Google Calendar sync, freebusy, WhatsApp reminders, auth/roles) is verified working, so these are low-priority.
- [ ] **Optional polish:** `src/features/sesiones/views.jsx` still uses `#b48ae4` as the therapist-color fallback (an old status color) — consider a neutral gray so a therapist-less session can't masquerade. Cosmetic only; every session currently has a therapist.
- [x] ~~**GO LIVE**~~ — DONE 2026-07-01. Cowork set `REMINDERS_LIVE=true` (All scopes) + redeployed; health probe confirms `"REMINDERS_LIVE": true`. Reminder sending is now LIVE. Safety check at go-live: 0 real sessions in the next 23–25h window, so nothing sent immediately — reminders begin as future appointments enter the 24h window. (Note: `SUPABASE_URL` shows false in the probe by design — functions use a hardcoded fallback; `VITE_SUPABASE_URL` is the separate frontend build var. Do not "fix" this.)
- [ ] **Fake test patients per therapist** (requested, NOT done): BLOCKED by the `patients.telefono` UNIQUE constraint — six patients can't share +593968029896 (all inserts failed `patients_telefono_key`). Options: **(a)** drop/relax that unique constraint via SQL, then create `PacienteFalso <Therapist>` per therapist — but the inbound webhook resolves phone→patient by first match, so with several sharing a number, test ONE therapist at a time; **(b)** skip it — the single **"Nicolas QA-TEST"** patient (+593968029896) already tests every therapist via per-SESSION `terapeuta_id` (calendar + reminders key off the session's therapist, not the patient's). QA session `08a16ef9…` (2026-07-08) reset to `programada` + reminder cleared, reusable via `?test_session_id`.
- [x] ~~Update calendar function CORS~~ — done session #9 (commit becec56): added `https://efimeramente-panel.netlify.app` to `ALLOWED_ORIGINS` (new domain first). Verify after deploy: create/edit a session on the live site, confirm the Calendar event appears and the amber freebusy warning shows on overlap.
- [ ] **Verify live fixes** — create a test session, confirm it appears in Lista as "Pend." immediately
- [x] ~~Sync session estados from Google Sheet~~ — done session #9 (see Completed Features)

### Next modules (confirm with Nicolas before starting)
- [ ] **Seguimiento** — analytics: retention, sessions/therapist/month, no-show rate, pending payments (recharts)
- [ ] **Finanzas** — facturas ledger, monthly totals, mark-as-paid
- [x] ~~**Twilio webhook**~~ — DONE (commits 8a8f47c, fc84adb). Full WhatsApp reminder flow shipped: hourly `send-reminders.js` (kill-switch `REMINDERS_LIVE`, default OFF/dry-run + `?test_session_id` manual path) + inbound `twilio-webhook.js` (button tap → session estado) + `supabase/add-reminder-sent-at.sql` migration. See CLAUDE.md § Netlify functions.
- [ ] **Trim therapist Sesiones view** — hide pay/confirm toggles and owner-only filters from therapist role

### Known data issue
- Seed sessions imported from the old Google Sheet originally all had `estado = 'confirmada'`. Session #9 ran the guarded sync (`sync-estados.js`): 240 of 316 sessions matched by patient+date, 42 corrected (26 paid, 14 cancelled, 2 confirmed). 76 had no sheet match (left untouched); 14 confirmada→programada downgrades and 1 un-pay were intentionally skipped (blank sheet cell = leave as-is). Re-runnable if the sheet changes.

## Working Protocol

### Agent spawning
- Cowork (Sonnet) = project manager only: reads state, coordinates, writes prompts, updates .md
- **Spawn Opus agents freely** for any code task — Opus is better at heavy lifting
- Cowork can spawn agents at any model (opus, sonnet, haiku) as needed

### Nicolas's role — simple
- Nicolas works exclusively in Cowork chat. Screenshots go here. Decisions happen here.
- The ONLY thing Nicolas does in the Claude Code terminal is paste a single `git push` command when Cowork tells him to. Nothing else.
- Cowork gives Nicolas the exact command to paste. Nicolas does not need to know git.

### Push workflow — TWO CLONES, clear roles
- **`~/my-site`** = the canonical git repo. All pushes happen from here. Claude Code terminal has SSH credentials here.
- **`~/Claude/Projects/New Efimeramente App 3`** = Cowork workspace. Opus agents write code here (sandbox-mounted). No network access from sandbox — cannot push directly.
- **Correct flow:** Cowork Opus writes code to `New Efimeramente App 3` → tell Nicolas to paste in Claude Code terminal: `cd "/Users/nicolasdelatorre/Claude/Projects/New Efimeramente App 3" && git push origin main` — but ONLY after Claude Code agent has ported the change cleanly to `~/my-site` first (see two-clone divergence issue from session #8).
- **Safer flow (avoids divergence):** Have Claude Code agent pull the changed file directly from the `New Efimeramente App 3` path, apply it to `~/my-site`, build, and push — all in one Claude Code prompt.
- If the two clones diverge: port only the changed file(s) into `~/my-site` (do NOT rebase or force-push)
- Build before every push: `vite build --emptyOutDir false` — fix errors before committing
- **Never use GitHub web editor CM6 injection** — no build verification, risk of bad commits

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
