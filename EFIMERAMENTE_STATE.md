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
- [x] **Six-feature brainstorm batch — BUILT + PUSHED** (2026-08-31, Opus). Built
  simplest→complex in one session, single push; Nicolas live-checks on deploy. All
  ideas captured in **`IDEAS-BACKLOG.md`**. DB migrations applied to prod via the Supabase
  connector (all additive/safe). What shipped:
  - **C1 — Expediente removed.** The patient free-text `notas` ("Expediente") is gone from the
    UI + data layer AND the DB column was **dropped** (`supabase/drop-patients-notas.sql`) — no
    PII stored while security isn't guaranteed. The 10 existing notes were backed up first to
    `~/Downloads/EFIMERAMENTE-expediente-notas-respaldo.md` (8 were package-payment notes with
    first-session dates — useful for seeding the #4 ⭐ anchors). `motivo_consulta` left intact
    (only "expediente" was named). NOTE: session-level `sessions.notas` (calendar description) is
    unrelated and stays.
  - **C2 — Patient states collapsed to activo | inactivo.** 44 `descontinuado` → `inactivo`,
    CHECK tightened (`supabase/migrate-descontinuado-to-inactivo.sql`). constants/filters/demo updated.
  - **#2 — Payment method on pay.** The Lista pago on/off toggle became a compact select
    **Sin pagar / PayPal / Transferencia / PayPhone** (`PagoSelect` in views.jsx); choosing a
    method marks paid + writes `metodo_pago`. `METODO_PAGO` trimmed to exactly 3 (dropped unused
    `cash`). `handleSetPago` replaces `handleTogglePaid`.
  - **#3 — Llamada Convirtió/No Convirtió.** Llamada rows swap the estado control (`ConfSeg`) for
    a 2-state **No convirtió (red, default) / Convirtió (green)** control (`ConvSeg`), therapist-
    settable. Manual override in `sessions.convirtio` (nullable); when NULL it's **derived live**
    (patient has a later non-llamada, non-cancelled session) — NO cron. Logic:
    `src/lib/conversion.js` (`sessions-convirtio.sql`).
  - **#1 — Patient type (Individual / Pareja / Menor de edad).** New
    `patients.tipo_paciente` + `nombre_2`/`apellido_2` (`supabase/patient-type-second-person.sql`,
    existing rows default individual). Registration + edit (create drawer, inline SesionDrawer
    create, PatientDetail) show a type picker + a second-person name pair with role labels
    (Persona 1/2, or Tutor/Menor). Display + search via new **`patientLabel`** /
    **`patientSearchText`** in format.js (`Juan Perez + María Gonzalez`,
    `Juan Perez (Tutor) + Miguel Alvarez (Menor)`), wired into Sesiones/Pacientes/Seguimiento/
    Marketing/Finanzas/report/calendar-title/pickers; search finds either person. Person 1 =
    contact (tutor for a minor).
  - **#4 — 4-session packages.** `sessions.package_anchor` flag
    (`supabase/sessions-package-anchor.sql`) marks the FIRST session of a prepaid 4-pack; the
    owner sets it in the **session drawer (edit, owner-only)**. Everything else derives
    (`src/lib/packages.js`): pack covers the anchor + next 3 real (non-llamada, non-cancelled)
    sessions; scheduling a new session for a patient with open pack slots **defaults it to paid**
    (pre-checked, overridable checkbox in the create drawer); a **⭐ star** shows next to any
    patient who has ever had a pack (Sesiones Lista + Pacientes list/detail). This is the
    midflight-seeding mechanism Nicolas asked for — no upfront list needed, he'll mark anchors
    in-app one by one.
  - **Verified:** `npm run build` green; pure helpers node-unit-checked (conversion 7/7,
    patientLabel 6/6, packages all pass). Pushed to `main` → Netlify; **Nicolas to live-check.**
- [x] **Therapist session report (PDF) + Pareja $30 provision** (2026-08-03, Opus, commits
  674c7ec + ea3e71c, both deployed + verified live). Kicked off a **design-flaws polish pass**
  now that the architecture phase is done — running list lives in **`DESIGN-FLAWS-TODO.md`**
  (read it to resume). Shipped this session:
  - **"Descargar reporte" button in Sesiones → Lista** — exports the currently-filtered rows
    to a branded PDF, for sending each therapist a verifiable list of their sessions so they can
    confirm pay. New **Desde/Hasta date filters** in Lista (WYSIWYG: report == on-screen rows).
    `src/lib/sessionReport.js` (jsPDF + jspdf-autotable, **lazy-loaded** via dynamic import so
    they stay out of the main bundle — verified as separate chunks). Totals footer: session count
    + **Monto a pagar** with a per-rate breakdown. Llamadas excluded; pay counts only
    confirmada/completada rows so it's correct even without an estado filter. `queries.js` now
    fetches `provision_rate` with the Sesiones therapists; `icons.jsx` gained `IconDownload`.
    **USAGE:** filter Estado=Confirmada for a clean payroll report (count line then matches pay).
  - **Pareja (couple) sessions provision $30**, not the $24 base (Nicolas). Factored the
    per-session provision into **`src/lib/provision.js`** (`sessionProvision(session, baseRate)`)
    — Pareja $30, else base ($24 default), **Mariana always $0** (0-base = keeps 100%, any type).
    Both the **report** and **Finanzas** (trend, período, mensual, per-therapist provisión) call
    it, so they can't drift. Report shows a breakdown (e.g. `3 × $24 + 1 × $30`); Finanzas
    per-therapist caption changed from a now-inaccurate "N × $rate" to a plain session count.
    Verified: 6/6 helper unit cases + headless report ($102 for 3×$24+1×$30) + build green.
  - **OPEN / next:** design-flaw **#1 — llamadas born `confirmada`** (spec'd in
    `DESIGN-FLAWS-TODO.md`, NOT built): overrides the "Born Pendiente" invariant for
    `tipo==='llamada'` in `queries.js#createSession` + `public-booking.mjs`.
- [x] **MARKETING v2 — full redo, BUILT + DEPLOYED** (2026-07-13, Fable 5, commits 42d32bf +
  bookedOn fix). v1's ?c=-link attribution was unrealistic and was removed entirely.
  **Everything (protocol, schema, flags, Meta report template, backfill plan) lives in
  `MARKETING-CONSULTORIO-2026.md` — that doc is self-sufficient; read it, not this entry.**
  Key facts: weekly Meta CSV (`EFIMERAMENTE-SEMANAL` saved report, scheduled Monday email) →
  `/marketize` (user-level command, `~/.claude/commands/marketize.md`; Gmail → Downloads →
  Chrome) → `scripts/marketize-import.mjs` (idempotent upsert into `campaign_weeks` +
  campaign-window maintenance + terminal briefing). Attribution is date-based
  (`bookedOn = min(created_at, fecha)` — seeded rows have import-date created_at);
  `fuente='referido'` excludes a patient. Math shared page↔briefing in `src/lib/marketing.js`.
  Migrations `marketing_v2` + `marketing_v2_drop_columns` applied in prod (old
  campaigns/campaign_metrics + patients/sessions.campaign_id dropped; public booking verified
  live after). Gmail connector activated by Nicolas 2026-07-13 (usable next session).
  **NEXT SESSION = the 4-item checklist in that doc's §7** (create+schedule the Meta saved
  report via Chrome, backfill May→today, fix May's overlapping windows, test Gmail retrieval).
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

- [x] **Loose-end verification pass** (2026-07-02 PM, Fable 5): **(1)** `therapists_self_update`
  RLS policy could NOT be verified from the terminal (REST API can't read `pg_policies`; no
  psql/supabase CLI installed) — SQL re-given to Nicolas, idempotent, pending re-run (see backlog).
  **(2)** Confirmed prod booking state: all 6 therapists `booking_enabled=true`, ONLY Daniela has
  hours (fri 09:00–17:00) — the other 5 show "no hay horarios" publicly. **(3)** Nicolas's live-test
  llamada was NOT cleaned up → cleaned by agent: patient "Prueba Daniela" (+593987196498), its
  single llamada session (2026-07-03 13:00), and the Google Calendar event on Daniela's calendar
  all deleted (calendar via the deployed function, rows via service key).

- [x] **Supabase connector CONFIRMED WORKING** (2026-07-02 evening session, Fable 5). The
  `mcp__claude_ai_Supabase__*` tools surfaced and work: `execute_sql` for reads/row writes,
  `apply_migration` for DDL. The "DDL by hand in the SQL editor" rule is **lifted** while the
  connector is present — but the agent must **tell Nicolas before running any DDL**, and mirror
  every migration as a `.sql` file in `supabase/`. First uses this session: verified
  `therapists_self_update` in `pg_policies` (1 row, cmd=UPDATE — the .sql had already been applied;
  nothing to re-run) and created the `push_subscriptions` table (migration
  `create_push_subscriptions`).

- [x] **Web Push notifications for therapists — BUILT** (2026-07-02 evening, Fable 5). Therapists
  get real push notifications on their phones for: **paciente confirma** (Twilio quick reply),
  **paciente cancela** (Twilio quick reply), **nueva llamada agendada** (/agendar). No Wallet-pass
  hack needed — Web Push works in installed PWAs on iOS 16.4+ and Android. What shipped:
  - `public/sw.js` replaced: self-destroying SW → **push-only SW** (`push` + `notificationclick`,
    **NO fetch handler** so the old stale-shell bug is structurally impossible; keeps activate-time
    cache wipe). Registered in `main.jsx`. CLAUDE.md gotcha updated accordingly.
  - `push_subscriptions` table (+ RLS `push_subs_self`: therapist ↔ own rows via
    `my_terapeuta_id()`, owner all) — applied via connector, mirrored in
    `supabase/push-subscriptions.sql`.
  - VAPID pair generated: public key committed (`src/lib/push-public-key.js`); **private key must
    be set by Nicolas as Netlify env var `VAPID_PRIVATE_KEY`** (pushes are skipped with a log
    until then).
  - `netlify/lib/push.mjs` — `notifyTherapist()` (never throws; prunes dead subscriptions on
    404/410). Wired into `twilio-webhook.mjs` (step 5, after estado update) and
    `public-booking.mjs` (after session insert). `web-push` added to dependencies.
  - Opt-in UI: "Notificaciones en este dispositivo" card at the top of **Disponibilidad**
    (therapists only — owner has no terapeuta_id). Per-device activation; iOS shows the
    add-to-Home-Screen hint when opened in a Safari tab.
  - **Not covered (v1):** llamadas/sessions created in-app by owner/therapist don't push (client-side
    writes; the therapist is the one acting anyway).
  - **v1.1 same session (commit 82aa12b):** OWNER receives ALL notifications. `terapeuta_id` made
    nullable (migration `push_subscriptions_owner_rows`); NULL row = owner subscription; RLS already
    restricts NULL rows to `is_owner()`. `notifyTherapist` sends to therapist subs + all NULL subs.
    The Disponibilidad card now also renders for the owner ("recibe TODAS las notificaciones").
  - **v1.2 same session:** in-app estado changes ALSO push (per Nicolas). New
    `netlify/functions/notify-estado.mjs` (JWT-verified; rebuilds payload from the DB row; excludes
    the acting user's own devices). Hooked in `Sesiones.jsx` — the Confirmado/Cancelado toggle and
    drawer edits that change estado — via fire-and-forget `queries.js#notifySessionEstado`.
    Note: in-app and patient-initiated pushes read the same ("Sesión confirmada ✅") — differentiate
    later if it matters.
  - Session commits: e32260c (v1) → 5d2d5e7 (health probe + docs) → 82aa12b (owner-all) →
    7d37685 (in-app estado). All deploys verified live (sw.js content, bundle grep, health probe
    `VAPID_PRIVATE_KEY:true`, notify-estado OPTIONS 204 + unauthenticated POST 401).
  - ⚠️ Nicolas reported "some bugs already" at session end, details deferred — see backlog top.

- [x] **Netlify connector CONFIRMED WORKING** (2026-07-03, Fable 5). `mcp__claude_ai_Netlify__*`
  tools work: deploy status/details (`netlify-deploy-services-reader`, incl. per-function bundle
  hashes — useful to verify a function really redeployed), env vars READ+WRITE
  (`netlify-project-services-updater` → `manage-env-vars` with `getAllEnvVars:true`; secret-marked
  values come back masked, but `VAPID_PRIVATE_KEY`/`REMINDERS_LIVE` are readable). Site id
  `f8418788-d4a9-4c79-88e1-767545c5de32`. **Limitation: NO function-log access via MCP** (readers
  only cover projects/deploys/teams/user/extensions/forms) — for runtime behavior, test directly
  (send a push with the VAPID key, curl the function) instead of hunting for logs.

- [x] **Web Push "bugs" diagnosed + fixed — system fully working** (2026-07-03, Fable 5).
  Nicolas's "therapists receive nothing" report had NO code bug behind it. Root causes found:
  **(1) Subscription timing** — last night's tests fired pushes BEFORE the therapists subscribed
  (owner 01:42 UTC, test booking 01:43, Camila 01:54, Daniela 02:38 — nothing to deliver to).
  **(2) Actor exclusion (v1.2 design)** — Nicolas toggled from his own owner account, whose
  devices were deliberately excluded, so HE never saw toggle pushes and assumed failure.
  Diagnostics that proved the pipeline: direct `web-push` sends from the Mac using the prod
  VAPID key (read via Netlify connector) → Apple 201 for Camila/Daniela/Carolina, all received
  "Prueba técnica 🔧"; browser-driven toggle test via Claude-in-Chrome (owner login, Lista view)
  → `notify-estado` POST 200 → Mariana received the push. **Change shipped (f10cc32): the actor
  exclusion is REMOVED per Nicolas** — `notify-estado` now notifies the session's therapist +
  all owner devices on EVERY estado change to confirmada/cancelada, regardless of who acted
  (he needs self-testability; "no restrictions"). CLAUDE.md updated. All 6 therapists are now
  subscribed (Francisco on Android/FCM, rest iOS/Apple). Verified received by Nicolas + Mariana;
  Carolina's toggle-push receipt was still unconfirmed at session end (her direct-send DID
  arrive, so expected fine — see backlog).

- [x] **"Born Pendiente" rule audited + hard-enforced** (2026-07-03, commit 8d813e9). Nicolas's
  rule: EVERY session is created estado `programada`, zero exceptions. Audit: already true
  everywhere (drawer create hardcodes it and has NO estado field — estado is ONLY changeable via
  the Lista toggle; drawer edit preserves initial estado; public-booking hardcodes it; DB default
  is `programada`). Added a belt-and-braces override in `queries.js#createSession` so no future
  UI change can bypass it. Corollary: the "created-as-confirmada doesn't push" gap mentioned in
  v1.2 notes does NOT exist — there is no such path.

- [x] **Test-data cleanup** (2026-07-03). Deleted 13 test sessions + 5 test patients (PRUEBA
  UNO/FRANCISCO/CAROLINA, Prueba DE, "prueba tres") and their 7 Google Calendar events (3 deleted
  via the calendar function; 4 were already gone — cancel flows remove events). KEPT: patient
  **"Nicolas QA-TEST"** (+593968029896) with ONE reusable QA session `08a16ef9-…` (2026-07-08
  10:00, Mariana) reset to `programada` + `reminder_sent_at` cleared — reusable via
  `twilio-webhook?test_session_id=08a16ef9-fb81-4071-a3ef-4f4cda785428` (sends a REAL WhatsApp to
  Nicolas's test phone, bypasses kill-switch + 23–25h window).

- [x] **Push system 100% VERIFIED — all triggers, all therapists** (2026-07-03 session 2).
  Carolina confirmed the toggle push arrived (closed the last device question). /agendar trigger
  re-tested with all 6 subscribed: agent booked a test llamada (Daniela, via the live function),
  Nicolas + Daniela received "Nueva llamada agendada 📞", test cleaned up (session + calendar
  event deleted; the reusable "Nicolas QA-TEST" patient was reused, not duplicated, and kept).
  Trigger scoreboard: WhatsApp confirm/cancel ✅, in-app toggle ✅, /agendar booking ✅,
  /reservar booking ✅ (see below). Also noted: therapists set their own hours — 5 of 6 now have
  weekly windows in Disponibilidad (all but Carolina).

- [x] **/reservar — public booking of REAL sessions — BUILT + VERIFIED LIVE** (2026-07-03
  session 2, commit 0567f28). Per Nicolas: same self-scheduling flow as /agendar but for actual
  therapy sessions; rarely used (therapists normally schedule), shared privately when practical.
  Decisions (Nicolas): open to ANYONE (unknown phone creates a patient, same honeypot + rate
  limits), **individual only** (75 min = DURACION_MIN.individual incl. buffer), **patient picks
  modalidad** (presencial/en línea), separate route **/reservar** (+ `?terapeuta=<id>` deep link).
  No DDL needed. Implementation — one shared function + one shared component, parameterized:
  - `public-booking.mjs`: `KINDS` map (llamada 10 min / sesion 75 min), duration-aware
    `computeSlots`, `kind` on slots+book, modalidad validated server-side, tipo=`individual`,
    monto = existing patient's tarifa (else 39 default), calendar title uses the internal
    `Sesión — {nombre} · {modalidad}` format, push "Nueva sesión agendada 📅". Sessions enter
    the normal 24h WhatsApp reminder flow (only tipo=llamada is excluded) — intended.
  - `PublicBooking.jsx`: `kind` prop drives all copy + a modalidad pill picker; mounted at
    `/reservar/*` in App.jsx. `/agendar` behavior unchanged.
  - Disponibilidad: per-therapist "Enlace sesión" copy button next to "Enlace llamada"; both
    flows share the same weekly `booking_availability` windows.
  Verified live end-to-end: 75-min slot math exact vs Daniela's real calendar (subset of
  llamada slots; window-end + busy collisions both respected), test booking created
  11:30–12:45 / individual / presencial / monto 39 / estado programada / Google event created,
  new session correctly blocked overlapping slots on re-fetch, pushes received, test cleaned up.
  **Nicolas confirmed at session end: "the feature works perfectly."** Nothing pending on it.

- [x] **24h reminder cron VERIFIED FIRING in production** (2026-07-03 session 3). Nicolas suspected
  the 23–25h reminder wasn't firing — investigated and proven healthy, NO code change needed:
  - Evidence: cron ran 16:02 UTC (sent the first 2 real patient reminders ever — Cinthya Perez +
    Camila Padilla, both Jul 4; Padilla then tapped "Confirmo" → `confirmada`, full loop worked in
    prod) and 22:04 UTC (live test: QA session moved into the window → real WhatsApp received by
    Nicolas). Netlify cron has ~2–5 min jitter past the hour.
  - Why it LOOKED dead: reminders go ONLY to estado `programada` (Pendiente) — **confirmed by
    Nicolas as intended, do not change**. Sessions confirmed in-app before the 24h window, or
    created <23h before start, never get one. Jul 1–2 simply had zero eligible sessions.
  - QA session `08a16ef9-…` reset afterwards (Jul 8 10:00, Mariana, `programada`, stamp cleared) —
    still reusable. Nicolas's own "Prueba Marte" test (+593983701092, Jul 4 19:30, Mariana) was
    left in place — it fires at the ~00:00 UTC cron (~19:05 EC 2026-07-03); patient+session+event
    still need cleanup once he's done with it.

- [x] **MARKETING module — BUILT** (2026-07-03 session 3, commit 03f304c, Fable 5). Owner-only
  acquisition-funnel tracker per Nicolas's spec: **Meta Ads impresiones → WhatsApp conversaciones
  → llamada 10 min → paciente**, with CPA / LTV / LTV:CAC / ROAS. Architecture only, no cosmetics.
  - **DDL** (migration `marketing_campaigns`, mirrored `supabase/marketing-campaigns.sql`):
    `campaigns` (totals for spend/impressions/clicks/conversations live HERE), `campaign_metrics`
    (daily rows from CSV imports, unique (campaign_id,fecha)), `patients.fuente` +
    `patients.campaign_id`, `sessions.campaign_id`. RLS owner-only on both new tables.
  - **Attribution (3 layers):** (1) per-campaign links `/agendar?c=<slug>` + `/reservar?c=<slug>`
    — PublicBooking echoes `c`, public-booking.mjs stamps session.campaign_id and, for new
    patients (or known patients with NULL fuente), fuente='ads' + campaign_id; never overwrites
    an existing attribution; unknown slugs ignored (attribution never blocks a booking).
    (2) Fuente/Campaña selects in Pacientes → Configuración (FUENTE_PACIENTE: ads/referido/
    organico/otro). (3) Patients created in the campaign window with no fuente → amber "≈"
    estimate on the campaign card, kept separate from exact numbers.
  - **/marketing page:** KPI header (Inversión, CPA global, LTV global = ingreso PAGADO promedio
    por paciente con ≥1 sesión real, LTV:CAC con meta 3x), conversión llamada→paciente histórica,
    campaign cards (funnel con % por etapa, gasto/CPA/ingreso atribuido/LTV/ROAS/leads,
    Toggle activa, copy de ambos enlaces, editor manual de cifras, import CSV), y
    **Llamadas sin sesión** (lista de seguimiento: llamada hecha, sin sesión real después).
  - **Meta CSV import** (`src/lib/metaCsv.js`, dependency-free): EN/ES headers by substring,
    BOM/quotes/CRLF safe, daily breakdown required ("Day"/"Día"), summary rows skipped, localized
    numbers ("1.234,56"/"1,234.56") handled, same-day rows collapsed; upsert by fecha then
    campaign totals recomputed from ALL daily rows (import overwrites manual totals).
  - **Verified LIVE:** build green; parser unit-tested EN+ES (incl. localized "1.234,56" numbers
    and Meta's dateless summary row); deploy confirmed by bundle grep; **attribution tested
    end-to-end against the live function** — booked a llamada with `campaign:'qa-test'` →
    session.campaign_id stamped AND the existing null-fuente patient got fuente='ads' +
    campaign_id, exactly as designed. All test artifacts cleaned (session, Daniela's calendar
    event, qa-test campaign, QA patient's fuente reset to NULL, booking_attempts cleared).
    Note: agent cleared +593968029896's booking_attempts twice during testing (Nicolas's earlier
    tests had used up the 2/day phone cap).

- [x] **Lista QoL round + tab-switch reset bug FIXED** (2026-07-04, commit 273d1b8, Fable 5,
  deploy verified by bundle grep). Four fixes Nicolas requested before starting the next module:
  - **WhatsApp reminder legend in Lista** (per session, from `reminder_sent_at`, now included in
    `SESSION_SELECT` — read-only, deliberately NOT in the write whitelist): amber
    "WhatsApp enviado · sin respuesta" (sent, still Pendiente), muted "WhatsApp enviado" (sent,
    estado since resolved), muted "WhatsApp no enviado aún" (future Pendiente, not sent).
    Llamadas show nothing (excluded from the cron); past unsent rows show nothing (noise).
  - **Tab-switch reset bug** — root cause in `auth.jsx`: Supabase fires `TOKEN_REFRESHED` /
    `SIGNED_IN` on tab refocus; the listener set `loading=true` + reloaded the profile on EVERY
    event, so Gate swapped the tree for the Splash and remounted the page, wiping view/filter
    state. Now the profile reload only happens when the user id actually CHANGES. Belt-and-braces:
    Sesiones persists view/filters/cursor in sessionStorage (`sesiones-ui` key) so even a real
    page reload (iOS discarding the backgrounded PWA) restores where you were.
  - **Lista dates show month + year** ("Mié, 3 jul" / "2026 · 10:00") and the list is now ONE
    continuous descending list — furthest-future session at top, scroll down through today into
    the past. The "Ver historial" toggle from 275baf5 is removed (superseded by Nicolas's request).
  - **Estado de pago filter** (Todos los pagos / Pagadas / Sin pagar) next to the therapist +
    estado filters; applies to all three views.

- [x] **Hard-delete buttons for sessions + patients** (2026-07-04, commit 19e18ce, Fable 5).
  Per Nicolas: needed for duplicated patients and mistaken/test bookings.
  - **Lista view:** red "Eliminar" button per row, **owner-only** (therapists keep cancel;
    RLS would allow them to delete their own sessions, but the UI doesn't expose it — easy
    to open up later if wanted). `window.confirm` guard; deletes the row, then removes the
    Google Calendar event best-effort (`queries.js#deleteSession`).
  - **Pacientes detail:** "Eliminar paciente" danger button at the bottom of the panel.
    ⚠️ `sessions.patient_id` is **ON DELETE CASCADE** (verified in prod), so deleting a patient
    deletes ALL their sessions — the confirm states the session count, and
    `queries.js#deletePatient` collects the sessions' `google_event_id`s FIRST and removes the
    Calendar events best-effort after the row delete lands. Page is owner-only by routing.
  - RLS verified sufficient (`patients_owner_all`, `sessions_access` are cmd=ALL) — no DDL.
    Demo mode mirrors both deletes (incl. the cascade). Deploy verified by bundle grep.

- [x] **Patient detail panel scroll bug FIXED** (2026-07-04, commit c56d383). The panel body
  never scrolled (bottom unreachable — surfaced by the new delete button). Root cause: the DS
  `Card` wraps children in its own auto-height `relative z-10` div, so `h-full` inside
  `PatientDetail` never resolved; the Card's `maxHeight` + `overflow-hidden` clipped instead of
  constraining the inner `overflow-y-auto`. Fix: the `calc(100vh - 5rem)` clamp now lives on
  PatientDetail's own flex column (+ `min-h-0` on the scroll body); Card keeps only `sticky`.
  **Gotcha for future panels:** don't rely on an `h-full` chain through `Card` — clamp heights
  inside the child itself.

- [x] **"Cancelada nunca se cobra" rule enforced** (2026-07-04, commit c34203b). Per Nicolas:
  a cancelled session by definition didn't happen, so it can never be pagado. Enforced at
  every layer: `updateSession` forces `pagado=false` whenever estado becomes cancelada/no_show
  (covers Lista toggle, drawer, cancelSession, in-app cancel of a PREPAID session) and rejects
  "mark as paid" on a cancelled row at the query level (`.not estado in (cancelada,no_show)` →
  friendly error); Lista disables the pago toggle on cancelled rows (monto struck through,
  "No se cobra"); `twilio-webhook.mjs` WhatsApp-cancel also clears pagado. Findings during the
  audit: Dashboard "Sesiones por cobrar" ALREADY excluded cancelled via `isActive()` (no bug
  there), and prod had ZERO cancelada+pagado rows — no data repair needed. Note for later:
  that dashboard metric only fetches sessions from the current week's Monday onward, so unpaid
  sessions OLDER than this week never appear in "por cobrar" — flagged to Nicolas, not changed.

- [x] **FINANZAS module — BUILT, replaces the Dashboard at `/`** (2026-07-04, commit f7b256e,
  Fable 5). Per Nicolas: the Dashboard was never used and redundant with Finanzas, so the home
  page IS Finanzas now (nav entry renamed, IconWallet; the 14-line `/finanzas` placeholder route
  removed; old `Dashboard.jsx` + its dead query code deleted). Owner-only as before; therapists
  still land on /sesiones. Definitions decided with Nicolas this session:
  - "Real" session = not cancelled AND not a llamada (free intro calls never charge/provision).
  - **Period selector** (todo el historial [default] / este mes / mes pasado / esta semana /
    este año / custom from–to) scopes every metric EXCEPT Provisión.
  - **Sesiones por cobrar** — unpaid real sessions with fecha < hoy. Now looks at ALL history
    (the old dashboard silently capped it to the current week — fixed per Nicolas).
  - **Ingreso Bruto** = paid only; **Proyectado** = paid + scheduled unpaid; **Neto** = bruto −
    provisión of the SAME period (the coherent subtraction; the standalone card differs).
  - **Provisión de Terapeutas** — strictly CURRENT MONTH, counts confirmadas + pendientes
    (Nicolas chose "todas menos canceladas"), paid regardless of cobrado. Rate lives in the new
    **`therapists.provision_rate`** column (default 24; **Mariana = 0**, she keeps 100%) —
    migration `therapist_provision_rate`, mirrored `supabase/therapist-provision-rate.sql`.
    Card shows the per-therapist payroll breakdown (n × rate = $).
  - **Ingreso por Terapeuta** — paid revenue + session count per therapist, period-scoped.
  - Verified against prod SQL (todo el historial): por cobrar 72/$2,705; bruto $6,314;
    proyectado $9,909; provisión julio $816 (39 sesiones). ⚠️ Data caveat: the 72 por-cobrar
    includes old seed sessions the sheet sync couldn't match (76 unmatched) — some may actually
    be paid; numbers improve as Nicolas marks history.

- [x] **Finanzas v1.1: Deudores + paid_at + tendencia mensual** (2026-07-04, Fable 5). Per
  Nicolas after reviewing metric suggestions:
  - **Deudores** — tapping the "Sesiones por cobrar" KPI expands a per-patient debt list,
    ordered OLDEST debt first (the collection order): name + phone, unpaid session count,
    "desde {fecha} · N días", total owed. Follows the period selector like the KPI.
  - **`sessions.paid_at`** (migration `sessions_paid_at`, mirrored `supabase/sessions-paid-at.sql`)
    — real payment timestamp for future cash-flow metrics. Server-stamped in
    `queries.js#updateSession` whenever pagado flips true, cleared on false (incl. cancel +
    the twilio-webhook WhatsApp cancel). Deliberately NOT in SESSION_COLUMNS (clients can't
    set it). Sessions paid before 2026-07-04 stay NULL — unknowable. A "cash view" metric
    (ingreso por fecha de PAGO, not de sesión) becomes buildable once data accumulates.
  - **Tendencia mensual** — 12-month ComposedChart (bruto bars + neto line), fixed window,
    ignores the period selector by design.

- [x] **Facturación tracking** (2026-07-04, commit b273235). New `sessions.facturada` boolean
  (migration `sessions_facturada`, mirrored `supabase/sessions-facturada.sql`), set MANUALLY.
  - **Lista:** second toggle per row — sky blue with a "FACTURA" label so it can't be confused
    with the lavender pago toggle (the DS `Toggle` gained an `onClass` prop for this). States:
    Facturada / Sin facturar; cancelled rows show "No se factura", toggle locked.
  - **Cancelled rule extended:** cancelling clears `facturada` like `pagado`; setting either
    flag on a cancelled row is rejected at the query level (shared guard in `updateSession`).
  - **Finanzas:** 5th KPI "Pendientes de facturar" = **pagadas sin factura** (Nicolas chose:
    factura follows payment; unpaid sessions don't appear until paid) — $ total + count,
    caption shows the period's facturadas count. Follows the period selector.

- [x] **SEGUIMIENTO module — BUILT, the LAST placeholder is gone** (2026-07-04, commit 8d262c8,
  Fable 5, deploy verified by bundle grep). Nicolas REDEFINED the module at session start
  (superseding the old retention/no-show sketch): **patient adherence to therapy**, available
  to owner AND therapists.
  - **DDL** (migration `patient_frecuencia`, mirrored `supabase/patient-frecuencia.sql`):
    `patients.frecuencia` text CHECK in (`semanal`,`quincenal`), nullable. Editable in
    Pacientes → Configuración AND the create-patient drawer; in `PATIENT_COLUMNS` whitelist;
    `FRECUENCIA_PACIENTE` in constants.js.
  - **Adherence formula** (`src/lib/adherence.js`, pure + node-unit-checked against Nicolas's
    own examples): rate = attended (confirmada/completada, non-llamada, fecha ≤ hoy) ÷ expected,
    where expected = fixed monthly quota (semanal 4/mes, quincenal 2/mes) prorated per calendar
    month over the window first-attended-session → today, floored at 1. Matches his examples
    exactly: 3-de-4 = 75%, quincenal 1-de-2 = 50%, and **>100% is allowed by design** (5-week
    months). Patients with frecuencia NULL are excluded (listed as an amber hint).
  - **Page sections:** KPI row (adherencia promedio, en seguimiento, en riesgo, sesiones/
    paciente promedio), adherence table worst-first (asistidas vs esperadas, % color-coded),
    **pacientes en riesgo** (≥1 attended, nothing scheduled, silent >2× interval: 14d/28d/21d
    sin frecuencia; alta/baja excluded; most-absent first, phone shown), **activos por mes**
    12-month chart (nuevos vs recurrentes stacked + % retención line), lifetime distribution
    (1 / 2–5 / 6–10 / 11+ sesiones).
  - **Therapist access:** route added to the therapist branch in App.jsx, nav entry no longer
    ownerOnly. NO role logic in the page — RLS (`patients_therapist_read`, `sessions_access`)
    scopes their data automatically (verified against pg_policies).
  - `_Placeholder.jsx` deleted — every module is now built. Demo mode: 4 mock patients got
    frecuencia so the page renders in demo.
  - **Frecuencia backfilled** (2026-07-04, same day): Nicolas had ALL 154 patients set to
    `semanal` via one SQL UPDATE; he flips the few quincenal cases manually in Pacientes.
  - **v1.1 same day:** "Pacientes en riesgo" list moved behind the KPI card (click-to-expand,
    same pattern as Finanzas Deudores) — per Nicolas, it's the therapists' daily
    "who to contact" list. KpiCard gained onClick/active like the Finanzas one.
  - **⚠️ Netlify usage pause incident (2026-07-04 evening):** the site 503'd
    (`usage_exceeded`) — free Starter plan hit its monthly allowance (heavy build cadence).
    Nicolas UPGRADED the team plan; site back. **New rule (Nicolas, budget): batch commits —
    ONE push/deploy per work session, docs included in the same commit; never push docs-only
    commits separately.**

- [x] **Final-touches round: estados overhaul + Pacientes for therapists + unpaid-payment
  warning** (2026-07-04 late, Fable 5, single batched push per the new rule).
  - **Patient states redefined** (Nicolas never understood alta/baja): `estado_general` is now
    **activo (default) | inactivo (might come back) | descontinuado (gone/quit)** — migration
    `patient_estado_overhaul` (mirrored `supabase/patient-estado-overhaul.sql`): legacy
    pausado→inactivo, alta/baja→descontinuado (0 prod rows affected — all were activo), CHECK
    constraint replaced, default confirmed activo. constants/filters/demo data updated.
    **Seguimiento only tracks ACTIVO patients** (adherencia, sin frecuencia, en riesgo);
    the historical activos-por-mes chart + distribution still count everyone (the past
    doesn't change when a patient leaves — flagged to Nicolas as the chosen interpretation).
  - **Pacientes module opened to therapists** (route + nav no longer ownerOnly). RLS: new
    `patients_therapist_update` policy (mirrored `supabase/therapist-update-patient.sql`) —
    UPDATE own patients only, WITH CHECK prevents reassigning away. UI for therapists hides:
    Terapeuta reassign, Tarifa/Método, Fuente/Campaña, delete button; they edit estado,
    frecuencia, expediente/notas only (handleSave sends just that trio). Create drawer:
    auto-assigns to self, billing hidden (defaults), same as the SesionDrawer inline create.
  - **Unpaid-payments warning in SesionDrawer** (Nueva sesión/edit): when the chosen patient
    has unpaid real past sessions AND the oldest is ≥5 days old, a red bold uppercase notice
    shows: "EL PACIENTE TIENE (X) SESIONES PENDIENTES DE PAGO. SOLICITAR PAGO PREVIO A
    FINALIZAR EL AGENDAMIENTO." (X = ALL unpaid past real sessions once triggered).
    Deliberately a NOTICE not a block — discretional trusted-patient cases exist (Nicolas).
    Excludes llamadas/cancelled/future and the session being edited.

- [x] **APRIL+MAY HISTORY IMPORTED from the Google Sheet** (2026-07-04 night, Fable 5).
  Nicolas provided `Sesiones_Consultorio (6).xlsx` (tab "Sesiones", 641 rows Apr 2–Jul 24).
  **Scope per Nicolas: April+May ONLY — June/July rows ignored, existing DB data untouched**
  (verified: June stayed 285, July stayed 43). One-off direct REST insert with the service key
  (scratchpad script, not committed): NO calendar events / reminders / pushes fired.
  - **Inserted 266 sessions** (Apr 74, May 192): 238 confirmadas (235 pagadas, 112 facturadas),
    28 canceladas (pagado/facturada forced false per rule). tipo=individual, 75-min duration,
    hora 12:00 placeholder where sheet said "n/a" (~old April rows), modalidad mapped
    physical/google_conference→presencial/en_linea else NULL, monto from sheet (patient tarifa
    fallback), notas preserved.
  - **Matching:** 98.6% by phone (last-9 digits) — 627/641; name fallback 5. Sheet quirks
    handled: "Carolin Almeida"→Carolina, "Confirmo, ahí estaré"→confirmada, all "Cancelar"
    variants→cancelada, Cobrada/Sin cobrar/NA→pagado bool. **Skipped by decision (Nicolas):**
    26 reagendadas (the moved slot's replacement is its own row), 4 identical duplicate rows.
  - **1 new patient created:** Paul Cisneros (estado inactivo, semanal). The other 8 unmatched
    names were June/July rows — out of scope, NOT created.
  - **Post-import bulk (Nicolas approved): 23 activo patients with no real session since
    June 1 → INACTIVO** (24 inactivo total, 131 activo) so "pacientes en riesgo" stays a
    short recent-lapse list. Reminder: inactivo/descontinuado are excluded from Seguimiento
    tracking by design.
  - **Consequences now visible:** Finanzas "todo el historial" now starts April (bruto +~$8k
    from Apr+May paid sessions); adherence windows extend back to each patient's real first
    session; activos-por-mes chart fills Apr+May. ⚠️ "Pendientes de facturar" grew (~123 more
    pagadas sin factura from Apr+May) — the **facturada backfill decision** is now more
    relevant than ever (backlog).

- [x] **Bug-fix + polish batch** (2026-07-09, Opus, single push per the budget rule). Eight items:
  - **Tarifa/método now prefill from the patient in Nueva Sesión** (`queries.js`). Root cause:
    `getSessionsData` selected patients without `tarifa`/`metodo_pago`, so the drawer's existing
    prefill (`p?.tarifa ?? f.monto`) always saw `undefined` and fell back to the $39 default. Fix:
    added `tarifa,metodo_pago` to that patient select — a session now inherits the patient's fixed
    rate (e.g. $32) and saved payment method. Frontend-only; existing sessions untouched.
  - **Debt definition tightened + unified across the app.** A session is debt ONLY if it actually
    happened: **estado `confirmada` + past-dated + unpaid** (llamadas always excluded). Before, the
    SesionDrawer pending-payment disclaimer AND Finanzas "Sesiones por cobrar"/Deudores counted
    `programada` (Pendiente) past sessions too — which read as false debt. Fixed in both
    `SesionDrawer.jsx` and `Finanzas.jsx`. **Ingreso Proyectado is deliberately NOT changed** — it
    still counts Pendiente and excludes only canceladas (per Nicolas). Legacy `completada` rows are
    out of scope (Nicolas: recent data is all up to date).
  - **Owner can edit patient identity/contact** (`Pacientes.jsx`). Nombre, Apellido, Teléfono, Email
    are now editable in the patient panel's Configuración (owner-only; therapists keep read-only
    Contacto — their RLS `WITH CHECK` would reject identity edits anyway). All four are already in
    `PATIENT_COLUMNS`, so no query/DB change. Guardrail: name/apellido/teléfono can't be blanked.
    Note: `patients.telefono` UNIQUE still applies — fixing a phone to a number already on file fails
    with an inline DB error.
  - **Mobile logo un-anchored** (`TopNav.jsx`). The compact logo was inside the `sticky top-0`
    header, so it stayed pinned and ate ~half the phone screen. Moved it into a non-sticky bar ABOVE
    the header — it now scrolls away; title/date/chip stay pinned. Desktop unchanged (logo in
    sidebar).
  - **Logo PNGs trimmed** (`public/logos/`). Both were 2000×2000 with the horizontal wordmark
    centered in transparent dead space (CORTO content was only 1776×690). Lossless alpha-bbox crop +
    small margin → CORTO 1872×786 (2.38:1), LARGO 1838×436 (4.22:1). No redraw; originals in git
    history. Combined with the un-anchor, the mobile top area is ~⅓ its old height.
  - **Individual session 75 → 60 min.** `DURACION_MIN.individual` (`constants.js`, drives drawer
    end-time/conflict math) and `SESSION_MIN` in `public-booking.mjs` (the `/reservar` flow), kept in
    sync. Other types unchanged (pareja 105, familia/grupo/evaluación 75, llamada 10). Copy updated
    in Disponibilidad + comments. Existing sessions keep their stored end times. NOTE: the drawer
    still labels duration "(incluye buffer)" — shared across types; left as-is (offered to adjust).
  - **Removed the redundant top-bar "Nueva sesión" button** (`TopNav.jsx`) — it appeared on every
    page and only navigated to `/sesiones` (duplicate of the real button in the Sesiones module).
    Cleaned up now-unused imports. Header now shows title + date + demo/live chip only.

- [x] **Dropped the `patients.telefono` UNIQUE constraint** (2026-07-09, DDL via Supabase connector,
  migration `drop_patients_telefono_unique`, mirrored `supabase/drop-patients-telefono-unique.sql`).
  Real case: a guardian (Laura Vasquez) registers herself + her minor nephews (no phones of their
  own) all under ONE number, and the `patients_telefono_key` UNIQUE blocked it. Phone isn't a unique
  patient identifier; the real key is `patients_pkey` on `id`. Verified safe first: neither the
  Twilio webhook nor public-booking use `.single()` on a phone lookup — both `.find()` the first
  match + `.limit(1)`, so duplicates don't error. Accepted trade-offs: (1) no more automatic
  duplicate-patient guard (was bypassable anyway); (2) a WhatsApp reply from a shared number resolves
  to the first-matching patient's soonest reminded session (reminder messages still name the
  patient). No deploy needed — DDL applied directly. **This unblocks the old "fake test patients per
  therapist" backlog item** (was blocked by exactly this constraint).

- [x] **Llamadas gratuitas: cobro + factura locked off** (2026-07-09). Free intro calls are never
  charged and never invoiced, so their pago/factura toggles now behave like a cancelled row's:
  `views.jsx` computes `noBilling = cancelled || llamada` and disables both toggles (pago caption
  "Gratis", factura "No se factura"); `Sesiones.jsx` handlers early-return on `tipo === 'llamada'`
  as defense-in-depth. Note: the money metrics were ALREADY llamada-safe — both `Finanzas.isReal`
  and `Marketing.isRealSession` exclude `tipo === 'llamada'`, so por-cobrar / pendientes-de-facturar
  never counted them. Prod check: all 8 llamadas were already `pagado=false`/`facturada=false`, so no
  data cleanup was needed. Frontend-only.

- [x] **CONTÍFICO INVOICING — groundwork + Protocol 1 (create client) DONE; Protocol 2 (invoice)
  mapped, not built** (2026-07-09, Opus). Goal: a `/facturar` tool that finds sessions eligible for
  automatic invoicing (**estado `confirmada` + `pagado` + NOT `facturada` + non-llamada + rolling
  last 7 days + patient is client-ready**) and issues the factura in Contífico. Contífico API is
  paid → **browser automation** (Contífico = Siigo; empresa RUC `1760388700001`, URL
  `https://1760388700001.contifico.com`, login user `MarianaVillegasK`). ⚠️ The MCP/automation
  browser tab does NOT share Nicolas's Contífico login — he logs in manually in the automation tab
  once per session.
  - **DB (migration `add_patient_cedula_contifico`, mirrored `supabase/add-patient-cedula.sql`):**
    `patients.cedula` + `patients.contifico_id` (both nullable in DB). `contifico_id` = marker that
    the patient exists as a Contífico client (currently set to the 10-digit core cédula, NOT the real
    Contífico persona id — see backlog). Both whitelisted in `queries.js` PATIENT_COLUMNS/SELECT.
  - **Frontend (pushed, commit 51b9cd1):** cédula + email now **required** when creating a patient
    (Pacientes create drawer AND the inline SesionDrawer create); cédula editable in Pacientes →
    Configuración. Invoice address is a constant **"QUITO"** (no per-patient column).
  - **Data backfill** from Nicolas's `Sesiones_Consultorio (6).xlsx` (sheet "Sesiones" has
    Cédula/RUC + Email per patient): matched to DB by name+phone, cédulas **validated with the
    official SRI check-digit algorithm**. Result: **75 patients got a verified cédula**, ~129 got a
    real email (blanks + `sin@mail.com` placeholders filled). Review list of the rest →
    **`~/Downloads/cedulas_por_revisar.csv`** (96 still need a cédula: 24 had an invalid value in the
    sheet, 72 none).
  - **Protocol 1 = BULK client import (not per-patient).** Contífico has a persona mass-upload
    (`/sistema/persona/importacion_masiva_personas/`, template `Plantilla_importacion_persona.xls`).
    Flow: generate a filled `.xls` from the app's patient data → upload → review grid → Save.
    Gotchas learned: **Cuenta Contable Cliente must be exactly `Clientes Comerciales`** (not
    "CLIENTES" — it's account code `1.1.2.5…`); Nombre format = **APELLIDOS NOMBRES**; Tipo `N`,
    Rol `Cliente`, Contribuyente Especial `No`, Extranjero `No`, Dirección `QUITO`; 13-digit RUC rows
    fill both RUC + Cédula(first 10). **Deduped against the 74 existing Contífico clients** (export
    via Consultar Personas → Excel): of 66 ready patients, 25 already existed, **41 were created
    (“41 persona(s) cargados exitosamente”)**. **All 66 now clients + `contifico_id` stamped.** The
    9 placeholder-email patients were deliberately excluded.
  - **Protocol 2 = invoice (MAPPED, NOT built).** Screen: "Crear una factura electrónica" →
    `Registrar Documento Electrónico`. Steps: pick **Persona** (client, lookup by cédula) → **Servicios
    ▸ Agregar detalle** (Producto, Cant `1`, Precio U. = session `monto`, IVA) → fill **Descripción**
    (required) → **Formas de Pago** tab → then **"Guardar"** (draft) or **"Guardar y enviar al SRI"**
    (irreversible emission). After success → set session `facturada=true`. NOT yet encoded as
    `/facturar` — blocked on 5 config answers from Nicolas (see backlog).

- [x] **CONTÍFICO INVOICING — Protocol 2 (`/facturar`) BUILT + first real run done** (2026-07-13,
  Opus). The invoicing protocol now lives as a **Claude Code slash command**:
  **`~/my-site/.claude/commands/facturar.md`** → in any future session type **`/facturar`** to
  activate the whole flow (find eligible sessions → emit Contífico facturas via browser → mark
  `facturada`). Config locked with Nicolas: Producto **SESION INDIVIDUAL** (auto-IVA 0%),
  Descripción **"Sesión del <fecha>"**, forma de pago **Otros con Utilización del Sistema
  Financiero** (= transferencia; no literal "Transferencia" option exists), address **QUITO**,
  **emit directly** to SRI. Consumidor Final = type `9999999999999` in Persona (patients without a
  cédula, all sessions <$50). Learned gotchas captured in the command file (Persona field needs a
  re-click after navigate; product auto-adds a blank row to delete; verify Persona is populated
  before emitting).
  - **First real run:** 24 facturas emitted end-to-end (docs `001-001-000000226` → `…249`) for the
    weeks up to 2026-07-13 — mix of real facturas + Consumidor Final; all marked `facturada`.
    4 new Contífico clients created (Jonathan Tapia, Richard Pérez, Daniela Rivadeneira, Rafaela
    Orrego), tarifas corrected (Jonathan $35, Diana $45), Pamela/Diana cédulas pulled from Contífico,
    Sharian's name fixed.
  - **⚠️ NEVER-INVOICE exemptions** (insurance-format cases Nicolas issues by hand): **Sharian
    Narvaez, Raguel Conforme (Vasquez), Emilie Conforme, Laura Vasquez.** Enforced by
    `patients.facturacion_manual = true` (migration `add_patient_facturacion_manual`, mirrored
    `supabase/add-patient-facturacion-manual.sql`) — the `/facturar` eligibility query excludes them,
    and they're also listed by name in the command file as a safety net. To exempt more later:
    `update patients set facturacion_manual=true where id='…'`.
  - Still needing a cédula before they can be invoiced: the ~96 in `~/Downloads/cedulas_por_revisar.csv`
    plus any new no-cédula patients (invoice those as Consumidor Final or collect the cédula).

## Pending / Backlog

### Design-flaws polish pass (started 2026-08-03) — see `DESIGN-FLAWS-TODO.md`
Running list of small flaws/nice-to-haves now that all modules are built. Doc is the source
of truth; open items as of 2026-08-03:
- [ ] **#1 Llamadas born `confirmada`** (spec'd, NOT built) — carve a `tipo==='llamada'`
      exception into the "Born Pendiente" invariant: `queries.js#createSession` +
      `public-booking.mjs`. Reasoning: a 10-min cold call isn't confirmed by the patient; it's
      `confirmada` from scheduling through any outcome.
- [x] ~~#2 Therapist session report (PDF)~~ — DONE 2026-08-03 (+ Pareja $30 provision). See
      Completed Features.

### Go-live remainder (public booking + push)
- [x] ~~Nicolas: set `VAPID_PRIVATE_KEY` in Netlify~~ — DONE 2026-07-02: verified live via the
      `?health` probe (`"VAPID_PRIVATE_KEY": true`). Push sending is fully operational server-side.
- [x] ~~Therapist push onboarding~~ — DONE 2026-07-03: all 6 subscribed (Francisco Android/FCM,
      rest iOS/Apple) and receipt verified for every trigger. Re-activation still needed if a
      therapist deletes the Home-Screen icon (subscription gets pruned on next send).
- [x] ~~Run `supabase/therapist-availability.sql`~~ — RESOLVED 2026-07-02: verified via the Supabase
      connector that `therapists_self_update` already exists in `pg_policies` (1 row, cmd=UPDATE,
      using/with check = `my_terapeuta_id()`). It had been applied earlier; nothing was re-run.
- [x] ~~Each therapist sets real hours in **Disponibilidad**~~ — DONE (Nicolas, by 2026-07-09):
      all 6 visible AND all 6 now have weekly hours (Carolina's is filled). Decision still stands:
      leave all 6 `booking_enabled=true`.
- [x] ~~Clean up the test llamada/patient~~ — done 2026-07-02 (see verification pass above).
- [ ] Add the marketing site origin to `ALLOWED_ORIGINS` in `public-booking.mjs` if the page is ever
      embedded/linked cross-origin (list currently mirrors `calendar.mjs`).

### Contífico invoicing — resume here
- [x] ~~**Build `/facturar` (Protocol 2)**~~ — **SHIPPED.** Full protocol lives in
      `.claude/commands/facturar.md` (project-level command). All 5 config questions are answered and
      locked in its "Config reference (confirmed with Nicolas)" section: Producto **SESION INDIVIDUAL**
      (auto-sets IVA 0%) · Descripción **"Sesión del <fecha>"** · Forma de pago **Otros con Utilización
      del Sistema Financiero** (= transferencia) · **Emit directly** to SRI (no draft step). Platform =
      **Contífico (Siigo)**, RUC 1760388700001, browser automation (no free API). Also encodes:
      Consumidor Final fallback (no cédula, legal <$50), Registrar Persona flow, and the NEVER-INVOICE
      insurance-format safety list (Sharian Narvaez, Raguel Conforme, Emilie Conforme, Laura Vasquez —
      enforced by both `patients.facturacion_manual=true` AND by name). **The command file is the source
      of truth — do NOT re-ask the config questions.**
- [x] ~~**Eligible-session query for /facturar**~~ — encoded in the command (§1): `estado='confirmada'
      AND pagado AND NOT facturada AND tipo<>'llamada' AND fecha within rolling last 7 days AND
      patient.facturacion_manual=false`. Client-ready vs no-cédula (Consumidor Final) vs
      has-cédula-not-yet-client are split and handled there.
- [ ] **Finish the 10 client-pending patients:** get the 9 placeholder emails (Aichele Oliver,
      Huidobro Juliana, Cevallos Jacqueline, Racines Alisson, Conforme Emilie, Padilla Camila,
      Almache Karina, Ortiz Shally, Chiriboga Joaquin), then bulk-create them (Protocol 1) + stamp.
- [ ] **Fill the missing cédulas** — IN PROGRESS (session 2026-07-17). Mined `Sesiones_Consultorio (6).xlsx`
      (cédulas live only in the `Sesiones` tab "Cédula / RUC" col; `Pacientes` tab has none) + cross-checked
      `~/Downloads/cedulas_por_revisar.csv`. Of 98 missing, only **3 were cleanly recoverable + SRI-checksum
      valid** → WROTE them: **Ericka Rosero 1711714467, Luis Rodríguez 1761592334, María Pernia 1762003042**.
      The rest can't be salvaged from files: ~72 are blank (must ask patient), ~18 have a wrong/partial value
      (mostly 9-digit = a dropped digit), Kamila Ramírez has two valid options (`1350954739` vs `1350974539` —
      Nicolas picks). **Remaining gather list → `~/Downloads/cedulas_por_recolectar.csv`** (categorized:
      HAS-A-LEAD / BLANK / COMPOSITE / TEST-JUNK / NEVER-INVOICE). Hand the filled CSV back and Claude will
      checksum-validate + bulk-write. Verified all 4 NEVER-INVOICE patients are `facturacion_manual=true`
      (Emilie & Laura already have cédulas so they weren't in the missing set — that's why they looked absent).
- [x] ~~**Patient data hygiene**~~ — DONE 2026-07-17. Merged 2 duplicate patients created by phone-format
      variants slipping past the `telefono` UNIQUE constraint: **Renata Hidalgo** (llamadas + real session were
      split across 2 rows) and **Isabel Durán**. Repointed `sessions` + `whatsapp_messages` to the survivor,
      then deleted the dup. Also normalized phones table-wide: **9 fixed** (stripped spaces/dashes/hidden
      Unicode, dropped stray trunk-0s), 166 already clean. **6 flagged, can't auto-fix → `~/Downloads/
      telefonos_por_revisar.csv`** (Juan Flores & M. de Lourdes Altamirano = missing digits; Micaela Castro =
      collides with Germania Domínguez's number; Santiago Maldonado = ambiguous trailing `-2`; Daniel y Daniela
      `8` & Michelle Tinajero `9` = garbage). NOT an error: the Conforme/Vásquez trio share `+593999643019`
      (insurance family). Still-open cleanup: split the composite rows ("Daniel y Daniela", "Thomas (Gabriela
      P. y Matheo Q.)") into individual patients. NOTE: app-side, phones aren't normalized on write — spaces
      bypass the UNIQUE constraint, so dups can recur until an input-normalization fix lands.
- [ ] **`contifico_id` is a marker (= core cédula), not the real Contífico persona id.** Fine for the
      cédula-based Persona lookup in Protocol 2; upgrade to the real id only if a flow needs it.

### Immediate — next session
- [x] ~~**Next module: SEGUIMIENTO**~~ — DONE 2026-07-04 (see Completed Features; scope was
      redefined by Nicolas to patient adherence — the old retention/no-show sketch is obsolete).
- [x] ~~Set frecuencia per patient~~ — bulk-set ALL 154 to `semanal` 2026-07-04 per Nicolas
      (one SQL UPDATE). REMAINING for Nicolas: flip the few quincenal patients manually in
      Pacientes → Configuración as he identifies them.
- [x] ~~Facturada backfill~~ — DONE 2026-07-04 night: Nicolas chose cutoff June 15. One
      UPDATE marked every PAID non-cancelled session with fecha < 2026-06-15 as facturada
      (June 15 itself left as-is — his two sentences overlapped on the boundary; conservative
      reading chosen and flagged to him). Result: 333 facturadas, 88 pendientes (oldest
      2026-06-15). Unpaid old sessions deliberately NOT marked — factura follows payment.
- [ ] **Dashboard "por cobrar" data hygiene:** the 72 unpaid past sessions include old seed
      rows the sheet sync couldn't match (76 unmatched) — some may actually be paid. Numbers
      self-correct as Nicolas marks history via the Deudores list.
- [x] ~~**Marketing v1 follow-ups (?c= links, fuente estimates)**~~ — OBSOLETE: **Marketing was
      fully redone as v2 on 2026-07-13** (weekly Meta report + date-based attribution; the ?c=
      link machinery was removed). **Everything about the module now lives in
      `MARKETING-CONSULTORIO-2026.md` — read THAT, not this file, for marketing work.**
      Remaining marketing to-dos = the checklist in its section 7 (create the Meta saved report
      `EFIMERAMENTE-SEMANAL` + weekly email, enable the Gmail connector, run the May→today
      backfill, verify attachment-vs-link on the first real `/marketize`).
- [x] ~~**"Prueba Marte" test data**~~ — DELETED (confirmed by Nicolas 2026-07-09). Patient,
      session, and calendar event are gone; nothing left to clean up.
- [ ] **Minor UI / aesthetic polish — DEFERRED** (per Nicolas 2026-07-02): do NOT spend building
  sessions on cosmetics. All aesthetic/UI-bug work waits until the whole architecture is finished,
  and will be done with cheaper models. Building sessions (Fable) are for new modules only.
- [ ] **Optional polish:** `src/features/sesiones/views.jsx` still uses `#b48ae4` as the therapist-color fallback (an old status color) — consider a neutral gray so a therapist-less session can't masquerade. Cosmetic only; every session currently has a therapist.
- [x] ~~**GO LIVE**~~ — DONE 2026-07-01. Cowork set `REMINDERS_LIVE=true` (All scopes) + redeployed; health probe confirms `"REMINDERS_LIVE": true`. Reminder sending is now LIVE. Safety check at go-live: 0 real sessions in the next 23–25h window, so nothing sent immediately — reminders begin as future appointments enter the 24h window. (Note: `SUPABASE_URL` shows false in the probe by design — functions use a hardcoded fallback; `VITE_SUPABASE_URL` is the separate frontend build var. Do not "fix" this.)
- [ ] **Fake test patients per therapist** (requested, NOT done): BLOCKED by the `patients.telefono` UNIQUE constraint — six patients can't share +593968029896 (all inserts failed `patients_telefono_key`). Options: **(a)** drop/relax that unique constraint via SQL, then create `PacienteFalso <Therapist>` per therapist — but the inbound webhook resolves phone→patient by first match, so with several sharing a number, test ONE therapist at a time; **(b)** skip it — the single **"Nicolas QA-TEST"** patient (+593968029896) already tests every therapist via per-SESSION `terapeuta_id` (calendar + reminders key off the session's therapist, not the patient's). QA session `08a16ef9…` (2026-07-08) reset to `programada` + reminder cleared, reusable via `?test_session_id`.
- [x] ~~Update calendar function CORS~~ — done session #9 (commit becec56): added `https://efimeramente-panel.netlify.app` to `ALLOWED_ORIGINS` (new domain first). Verify after deploy: create/edit a session on the live site, confirm the Calendar event appears and the amber freebusy warning shows on overlap.
- [ ] **Verify live fixes** — create a test session, confirm it appears in Lista as "Pend." immediately
- [x] ~~Sync session estados from Google Sheet~~ — done session #9 (see Completed Features)

### Next modules (confirm with Nicolas before starting — he will pick at session start)
- [x] ~~**Seguimiento**~~ — DONE 2026-07-04 as patient-adherence module (see Completed Features).
- [x] ~~**Finanzas**~~ — DONE 2026-07-04 (replaced the Dashboard at `/`, see Completed Features).
- **ALL modules are now built** — the architecture phase is complete. What remains is the
  deferred cosmetic/UI-polish pass (cheaper models) and the backlog items above.
- [x] ~~**Twilio webhook**~~ — DONE (commits 8a8f47c, fc84adb). Full WhatsApp reminder flow shipped: hourly `send-reminders.js` (kill-switch `REMINDERS_LIVE`, default OFF/dry-run + `?test_session_id` manual path) + inbound `twilio-webhook.js` (button tap → session estado) + `supabase/add-reminder-sent-at.sql` migration. See CLAUDE.md § Netlify functions.
- ~~**Trim therapist Sesiones view**~~ — WON'T DO (per Nicolas 2026-07-02): therapists keep the
  pay/confirm toggles; having them use these is useful to the practice. Do not hide them.

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
- **Preferred (since 2026-07-02): Claude Supabase connector** (`mcp__claude_ai_Supabase__*` tools) —
  reads, row writes, and DDL (`apply_migration`) directly against project `vnityzpuhnkumsyfnskz`.
  Tell Nicolas before any DDL; mirror migrations in `supabase/*.sql`.
- Fallback: `SUPABASE_SERVICE_KEY` from `~/my-site/.env` (legacy service_role JWT) — read in-process,
  never print it; DDL by hand in the SQL editor.
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
