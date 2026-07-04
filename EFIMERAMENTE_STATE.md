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

## Pending / Backlog

### Go-live remainder (public booking + push)
- [x] ~~Nicolas: set `VAPID_PRIVATE_KEY` in Netlify~~ — DONE 2026-07-02: verified live via the
      `?health` probe (`"VAPID_PRIVATE_KEY": true`). Push sending is fully operational server-side.
- [x] ~~Therapist push onboarding~~ — DONE 2026-07-03: all 6 subscribed (Francisco Android/FCM,
      rest iOS/Apple) and receipt verified for every trigger. Re-activation still needed if a
      therapist deletes the Home-Screen icon (subscription gets pruned on next send).
- [x] ~~Run `supabase/therapist-availability.sql`~~ — RESOLVED 2026-07-02: verified via the Supabase
      connector that `therapists_self_update` already exists in `pg_policies` (1 row, cmd=UPDATE,
      using/with check = `my_terapeuta_id()`). It had been applied earlier; nothing was re-run.
- [ ] Each therapist (or Nicolas) sets real hours in **Disponibilidad**. Prod state 2026-07-03:
      all 6 visible, 5 of 6 have weekly hours — only **Carolina's is still empty** (she shows
      "no hay horarios" publicly). **Decision (Nicolas, 2026-07-02 evening): leave all 6
      `booking_enabled=true`**; do NOT toggle her off.
- [x] ~~Clean up the test llamada/patient~~ — done 2026-07-02 (see verification pass above).
- [ ] Add the marketing site origin to `ALLOWED_ORIGINS` in `public-booking.mjs` if the page is ever
      embedded/linked cross-origin (list currently mirrors `calendar.mjs`).

### Immediate — next session
- [ ] **Next module: Seguimiento or Finanzas** (Nicolas picks at session start) — the last two
      14-line placeholders. Marketing is DONE and live.
- [ ] **Marketing follow-ups (when campaigns start running):** create the first real campaign in
      /marketing and start using its ?c= links; patients created in-app (drawer/Pacientes) have
      no fuente by default — set it manually when known. Watch the "≈ sin atribución" estimates.
- [ ] **"Prueba Marte" test data** (+593983701092, session Jul 4 19:30, Mariana, created by
      Nicolas 2026-07-03): its 24h WhatsApp reminder fired ~19:05 EC 2026-07-03. Patient +
      session (+ any calendar event) still need deletion once Nicolas is done testing.
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
- [ ] **Seguimiento** — analytics: retention, sessions/therapist/month, no-show rate, pending payments (recharts)
- [ ] **Finanzas** — facturas ledger, monthly totals, mark-as-paid
- Both are still 14-line placeholders (`src/pages/Seguimiento.jsx`, `src/pages/Finanzas.jsx`).
  Architecture/building only — NO cosmetics/polish (deferred to cheaper models post-architecture).
  Confirm scope with Nicolas before writing code.
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
