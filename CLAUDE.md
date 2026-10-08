# CLAUDE.md — Efimeramente Panel de Control

> **AUTONOMY** — this session runs with permission prompts disabled. You are
> trusted to use your own judgment and you should keep moving. Do not
> stop to ask permission for technical decisions; Nicolás is not a
> developer and cannot usefully adjudicate them, so asking wastes his
> time and yours.
>
> The one thing to slow down for: before an action that cannot be undone,
> think twice. Prefer the recoverable path when one exists — move rather
> than delete, add rather than drop, revert rather than force. Make sure
> the work is committed and pushed before anything destructive, so git
> is the safety net. Then act, and say plainly in your report what you
> did and what it cost.
>
> Never work around this by asking Nicolás to approve something as a
> formality. Either you judge it safe and do it, or you judge it unsafe
> and don't.

---

Internal practice-management PWA for the Efimeramente psychology practice (Ecuador).
Owner (Nicolas) + 6 therapists. Spanish UI. Manages sessions, patients, Google
Calendar sync, and WhatsApp appointment reminders.

**This file is the cold-start orientation.** For the live backlog / "what changed last
session," read `EFIMERAMENTE_STATE.md`. For visual/design tokens, read `BRAND.md`.

## Director docs (Google Drive)

Since 2026-10-04 (pm): the **cloud session = director only** (prioritizes, scores, writes the prompts,
verifies read-only via Drive/Supabase/Netlify); the **Mac terminal Claude Code = executor** (builds,
migrations, deploys, /facturar — it has blanket permissions; `git pull` first). Priorities live in
Google Drive, folder **"Efimeramente · Claude"** (id `16av_FWmaWjsw_WdyFwSuOqwd-Yf893bI`), via the
Drive connector: **`PERMANENT TO-DO.md`** (scored backlog, live state, decisions in force — source of
truth for priorities; find it by title, its id changes on every replace), `MAPA DE CASOS.md` (therapist
routing + education), `ASEGURADORAS - COBERTURA PSICOLOGIA.md`. No Drive connector → stop and say so.
`/cierre` updates the TO-DO.

---

## Stack & infra

- **Frontend:** React 18 + Vite 6, React Router 6, Tailwind 3, Recharts. Plain `.jsx`, no TypeScript.
  `jspdf` + `jspdf-autotable` are used ONLY by the Sesiones session report and are **dynamically
  imported** (`src/lib/sessionReport.js`) so they stay out of the main bundle — keep it that way.
- **Backend:** Supabase (Postgres + Auth + RLS). Netlify serverless functions for anything needing secrets.
- **Hosting:** Netlify. Live at **https://efimeramente-panel.netlify.app** (deploys on push to `main`).
- **Supabase project ID:** `vnityzpuhnkumsyfnskz` → `https://vnityzpuhnkumsyfnskz.supabase.co`
- **GitHub:** `github.com/efimeramenteec-spec/my-site`

## Commands

```bash
npm run dev      # local dev server (localhost:5173)
npm run build    # production app build → dist/ (this is what Netlify runs)
npm run preview  # preview the built app
```

There is **no test suite and no linter configured.** "Verify" means `npm run build` succeeds
and, for behavior, checking the running app. Always build before committing.

`npm run build:lib` is a *separate, unused-in-prod* design-system library build (entry
`src/lib.js`, outputs `dist/efimeramente-ds.*`). Ignore it unless working on the DS package.

## Deploy / working protocol (SIMPLE — single clone)

- Work directly in **`~/my-site`** with Claude Code. This is the canonical repo and has push credentials.
- `main` auto-deploys to Netlify. To ship: build → commit → push `main`.
- Ignore any older "two-clone / Cowork / port-between-workspaces" instructions in `EFIMERAMENTE_STATE.md`;
  that workflow has been retired in favor of this single-clone flow.
- **Netlify access:** Nicolas enabled the Claude **Netlify connector** (MCP) on 2026-07-02, AFTER the
  running session started — tool lists are fixed at session start, so it first becomes usable in the
  NEXT session. Check for `mcp__*Netlify*` tools at session start; if present, the agent can inspect
  deploys/env vars/logs directly instead of asking Nicolas to check the dashboard.
- **Supabase access:** the Claude **Supabase connector** (MCP, enabled 2026-07-02) can run SQL directly —
  reads, row writes, and DDL via `apply_migration` — against project `vnityzpuhnkumsyfnskz`. Check for the
  `mcp__*Supabase*` tools at session start. Keep each migration mirrored as a `.sql` file in `supabase/`.
- **New tables need explicit GRANTs** (#62): this project does NOT auto-grant new tables to `service_role`.
  Every `CREATE TABLE` must add `grant select, insert, update, delete on table public.<t> to service_role,
  authenticated;` — `lead_inbox` shipped without it and the lead bot was silent for a day ("permission denied").
- **DDL approval (hard rule):** additive migrations (`CREATE TABLE`, `ADD COLUMN`, `CREATE INDEX`,
  new RLS policies) run **without asking** — just announce them. **DESTRUCTIVE DDL requires explicit
  approval from Nicolás in chat before running, every time, with no exception:** `DROP TABLE`,
  `DROP COLUMN`, `TRUNCATE`, `ALTER COLUMN TYPE`, `DELETE` without a `WHERE` clause, and any migration
  that drops or rewrites existing data. State exactly what will be lost and wait for a yes.
- Fallback when the connector is absent: DDL by hand in the Supabase SQL editor; row writes with the
  `SUPABASE_SERVICE_KEY` in `~/my-site/.env` (service_role). Never print it.

---

## Architecture

### App shell & routing (`src/App.jsx`)
`AuthProvider` → `BrowserRouter` → Routes. `/agendar` is **public** (no auth, no chrome — the
patient-facing booking page `PublicBooking.jsx`; it talks ONLY to the `public-booking` Netlify
function, never Supabase). Everything else goes through `Gate` and is **role-gated**:
- **owner** (`fullAccess`): Finanzas (the home page at `/` — absorbed the old Dashboard 2026-07-04),
  Sesiones, Pacientes, Seguimiento, Marketing, Disponibilidad, DS.
- **therapist**: Sesiones (redirected there from `/`), Seguimiento (RLS scopes it to their own
  patients/sessions) + Disponibilidad (their own availability only).

### Demo-mode fallback (important — this shapes the whole data layer)
`src/lib/supabase.js` exports `isSupabaseConfigured` (true only when BOTH `VITE_SUPABASE_URL`
and `VITE_SUPABASE_ANON_KEY` are set). When **not** configured, or when a live query throws,
the data layer transparently serves realistic demo data from `src/lib/demoStore.js` /
`mockData.js`. Every read returns a `source: 'live' | 'demo'` flag the UI can surface.
In demo mode, auth is bypassed and the user acts as the owner.

### Data layer (`src/lib/queries.js`) — the core file
All DB access lives here. Pattern for every function: try Supabase → on error, fall back to demo.
- Reads: `getDashboardData`, `getSessionsData`, `getPatientsData` (each does parallel joined selects).
- Writes: `createSession` / `updateSession` / `cancelSession`, `createPatient` / `updatePatient`.
- Writes are column-whitelisted via `pickColumns` / `pickPatientColumns` — only real table columns
  are sent, so extra UI fields never break an insert. **If you add a DB column you want to persist,
  add it to `SESSION_COLUMNS` / `PATIENT_COLUMNS` too.**
- Google Calendar sync is fired from inside `createSession`/`updateSession` (see below), best-effort.

### Enums & labels (`src/lib/constants.js`) — single source of truth
Maps DB enum values → Spanish labels + Badge variants + colors. Touch this (not individual
screens) when confirmation states, session types, payment methods, patient states, etc. change.
Key detail: session `estado` is `programada` (Pendiente) | `confirmada` | `cancelada`; legacy
`completada`/`no_show` are display-mapped for old rows. DB default for new sessions is `programada`.
Llamadas: sessions.estado is a legacy value and is ignored. Their only state is Convirtió/No convirtió (convirtio + conversion.js). Never report, query or ask about llamadas as Pendiente.

### Other lib files
- `conflicts.js` — session overlap detection against **Supabase** sessions (local, synchronous).
- `format.js` — date/week helpers (`dateKey`, `weekRange`, `addDays`).
- `provision.js` — `sessionProvision(session, baseRate)`: what the practice owes a therapist per
  session. Base = `therapists.provision_rate` ($24 default, Mariana 0 = keeps 100%); **Pareja
  sessions pay $30**. Shared by Finanzas AND the Sesiones report so payroll numbers can't drift.
- `sessionReport.js` — builds the Sesiones → Lista payroll PDF (lazy jsPDF; llamadas excluded).
- `auth.jsx` — `AuthProvider` / `useAuth`; loads the `profiles` row to get `role` + `terapeuta_id`.

### Pages (`src/pages/`)
- **Built:** `Finanzas` (home page — money metrics: por cobrar + expandable Deudores list
  [oldest debt first], bruto, proyectado, neto, provisión de terapeutas via
  `therapists.provision_rate` [$24 default, Mariana 0; Pareja $30 — shared calc in `provision.js`], ingreso por terapeuta, pendientes de
  facturar [= pagadas sin factura], 12-month trend chart; period selector; llamadas + cancelled
  sessions never count anywhere. Related session columns: `pagado`, `facturada` [manual toggle],
  `paid_at` [server-stamped on pago flip — cash-flow groundwork]. Hard rule: cancelled sessions
  can never be pagado/facturada — enforced in `queries.js#updateSession`), `Sesiones`,
  `Pacientes` (largest), `Seguimiento` (see below), `Marketing` (owner-only
  acquisition funnel — see below), `Login`, `DesignSystem`.
- **All modules are built** — no placeholders remain (2026-07-04).
- Session create/edit UI lives in `src/features/sesiones/` (`SesionDrawer.jsx`, `views.jsx`, `PatientSelect.jsx`).

### 2026-09-14 changes (UX polish batch — see EFIMERAMENTE_STATE.md)
- **LEADS vs patients:** `patients.es_lead` (bool, default false). A person who books a free
  **llamada** via `/agendar` is a LEAD (es_lead=true), NOT a patient. They're auto-promoted
  (es_lead→false) on their **first real (non-llamada) session** OR when a llamada is toggled
  **"Convirtió"** (both in `queries.js`; `public-booking.mjs` sets the flag on new llamada
  bookings). Pacientes page has a **"Pacientes / Leads" tab** (leads hidden from the patient
  list); Seguimiento excludes leads; **Marketing still sees everyone** (its "nuevos" already
  needs a real session). `SesionDrawer` has a **"¿Es primera sesión?"** toggle → picker lists
  the therapist's leads so a converting lead is scheduled without re-registering. es_lead is in
  `PATIENT_SELECT`/`PATIENT_COLUMNS`. Migration `supabase/patient-es-lead.sql`.
- **Therapists can now edit EVERY field of their own patients** (was estado+frecuencia only) —
  UI gate only; RLS `patients_therapist_update` already allowed it. **Reassign + delete stay
  owner-only.** Create-patient drawer matched (therapists set tarifa/método too).
- **Public booking link preview:** `/agendar` + `/reservar` serve a separate **`agendar.html`**
  shell (title "Conoce a tu terapeuta", no "Panel de Control" leak). It's a **2nd Vite entry**
  (`vite.config.js` rollupOptions.input = main + agendar, shares `/src/main.jsx`) + **netlify.toml
  rewrites BEFORE the `/*` SPA fallback**. Don't remove those rewrites or the preview reverts.
  `dist/agendar.html` is gitignored (build output). The entry chunk is now `main-*.js` (was
  `index-*.js`) — mind this when grepping the served bundle to verify a deploy.

### 2026-09-04 changes (second batch — see EFIMERAMENTE_STATE.md)
- **3 consultorios cap:** at most **3 concurrent `presencial` sessions** (across ALL therapists);
  a 4th overlapping presencial is blocked. Logic in `conflicts.js` (`roomsFull` /
  `presencialOverlapCount` / `CONSULTORIOS`), enforced in `SesionDrawer` + `Sesiones#handleSubmit`.
  En línea/llamada don't count. Now enforced EVERYWHERE: the client checks
  (drawer + Sesiones) are backed by public `/reservar` (`public-booking.mjs`
  `rooms_full` 409) AND an authoritative DB trigger `enforce_presencial_room_cap`
  (`supabase/presencial-room-cap-trigger.sql`) that rejects a 4th overlapping
  presencial from ANY write path (raises `ROOMS_FULL …`; `queries.js`
  `friendlySessionError` maps it to the drawer copy).
- **⭐ star** now marks the **first session of a 4-pack** (per-row `s.package_anchor` in Sesiones
  Lista), NOT "this patient buys packages" (patient-level stars removed).
- **`patients.fuente` removed** from the app (attribution is fully automatic now). Column left
  dormant in the DB. Marketing no longer excludes `fuente==='referido'` — referrals now count.
- Inline "Nuevo paciente" (in the session drawer) has an **owner therapist picker** now.

### 2026-08-31 model changes (six-feature batch — see EFIMERAMENTE_STATE.md)
- **Patients have a type:** `patients.tipo_paciente` = `individual` | `pareja` | `menor`, with a
  second person in `nombre_2`/`apellido_2` (person 1 = contact / tutor). NEVER build a patient
  display name by hand — use `patientLabel(p)` (format.js); search with `patientSearchText(p)`
  (covers both people). `pareja`→"A + B", `menor`→"A (Tutor) + B (Menor)".
- **Patient states are just `activo` | `inactivo`** now (descontinuado was merged into inactivo).
- **No patient "Expediente"/free-text `notas`** — removed for privacy (C1). `patients.notas` may
  still exist in the DB (drop pending) but is neither read nor written. (Session-level `notas`,
  used as the calendar description, is unrelated and still active.)
- **New session columns:** `metodo_pago` is now chosen when marking paid in Lista (exactly 3:
  transferencia/paypal/payphone); `convirtio` (nullable) = llamada conversion override, else
  derived live (`src/lib/conversion.js`, no cron); `package_anchor` (bool) marks the first session
  of a prepaid 4-pack (`src/lib/packages.js`) — pack covers anchor + next 3 real sessions, which
  default to paid at scheduling, and any patient with an anchor shows a ⭐.

### Seguimiento module (owner + therapists, `src/pages/Seguimiento.jsx`)
**Patient adherence to therapy** (Nicolas's spec, 2026-07-04). Core input: `patients.frecuencia`
(`semanal` | `quincenal`, nullable — set in Pacientes → Configuración or the create drawer;
migration `supabase/patient-frecuencia.sql`). Core metric: **historic attendance rate** =
attended sessions (estado `confirmada`/legacy `completada`, non-llamada, fecha ≤ hoy) vs
expected from the frequency — **fixed monthly quota** (semanal = 4/mes, quincenal = 2/mes),
prorated for partial first/current calendar months, window = first attended session → today,
expected floored at 1. **Rates above 100% are allowed by design** (e.g. a weekly patient
attending all 5 weeks of a 5-week month). All math in `src/lib/adherence.js` (pure, unit-check
with node); the page (`Seguimiento.jsx`) only aggregates. Also renders: **pacientes en riesgo**
(≥1 attended session, nothing real scheduled from today on, silent > 2× their interval —
semanal 14d / quincenal 28d / sin frecuencia 21d; alta/baja excluded), **activos por mes**
(12-month chart, nuevos vs recurrentes stacked + % retención line = share of last month's
actives who returned), and a lifetime sessions-per-patient distribution. Therapists see the
same page auto-scoped by RLS to their own patients/sessions — no role logic in the page.

### Marketing module v2 (owner-only, `src/pages/Marketing.jsx`)
**Fully documented in `MARKETING-CONSULTORIO-2026.md` — read that for ANY marketing work**
(protocol, flag thresholds, Meta report template, backfill). One-paragraph orientation:
funnel **Meta Ads → WhatsApp conversaciones → llamada gratuita → paciente**. Data arrives
weekly: Meta emails the saved report `EFIMERAMENTE-SEMANAL` every Monday; the `/marketize`
command (project-level, `.claude/commands/marketize.md` — in the repo so cloud sessions get it too) asks Nicolas for the CSV (manual
hand-off — auto-download deferred), runs `scripts/marketize-import.mjs` (restores the week
column from the filename if a manual export dropped it; upserts `campaign_weeks` by
(campaign_id, semana_inicio); auto-creates campaigns by exact Meta name; maintains
fecha_inicio/fecha_fin windows) and prints a briefing. **Attribution is date-based:** one
campaign runs at a time, so a new patient (first real session) belongs to the campaign whose
window covers the day that session was BOOKED (`sessions.created_at`); `fuente='referido'`
excludes a patient from attribution (the only manual step). No link tagging — the v1 ?c=/slug
machinery was removed 2026-07-13. All metric math is in `src/lib/marketing.js` (pure, shared
by page + briefing); parser in `src/lib/metaCsv.js`; schema mirror `supabase/marketing-v2.sql`.

### Design system (`src/components/`)
Six primitives: `Button`, `Card`, `Badge`, `Input`, `Select`, `Toggle`. Re-exported from
`src/components/index.js`. Brand tokens/colors defined in `tailwind.config.js` + `BRAND.md`
(brand color `brand-lavender`, warm surfaces). `.design-sync/` is Claude Design tooling.

---

## Netlify functions (`netlify/functions/`)

Secrets live in the Netlify dashboard, never in the repo. All functions use the **modern
Netlify runtime** (`.mjs`, `export default async (req) => Response`) — NOT the legacy
`exports.handler`. This matters: the modern runtime runs off AWS Lambda, so it has **no 4KB
env-var limit** (the legacy Lambda-compat mode capped total function env vars at 4KB and was
silently failing every deploy; see the migration in commit history). HTTP functions are reachable
at `/.netlify/functions/<name>` or `/api/<name>`. Shared send logic lives in
`netlify/lib/whatsapp.mjs` (`normalizePhone`, `sendWhatsAppReminder`, `deliverReminder`).

### `calendar.mjs` — Google Calendar write-back
POST with `{ action, calendarId, event, eventId }`. Actions: `create` | `update` | `cancel` | `delete` | `freebusy`.
- `cancel` soft-cancels a session's event: `events.patch` prefixes the title with `CANCELADA — `, sets
  `colorId:'8'` (grey) and `transparency:'transparent'` so it stays visible but no longer blocks the slot
  (freebusy ignores transparent events). Idempotent (no double-prefix). Reactivating a session runs a full
  `update`, which rebuilds a normal opaque/default-colour event. `delete` remains for hard removals only.
- Auth: `GOOGLE_SERVICE_ACCOUNT_KEY` env (base64 JSON of service account `efimeramente-calendar@…`).
- Each therapist shares their Google Calendar with that service account; their Gmail is stored in
  `therapists.calendar_email` and used as the calendarId. Synced event id → `sessions.google_event_id`.
- Called from `queries.js` (`callCalendar`, `buildCalendarEvent`, `checkFreebusy`). Sync is **best-effort
  and never blocks a session save.** Event title: `Sesión — {patient} · {En línea|Presencial}`.
- CORS allow-list is hardcoded in the file — add new front-end origins there.
- Timezone is Ecuador: `America/Guayaquil`, `TZ_OFFSET = '-05:00'`, no DST.

### `public-booking.mjs` — public booking (the ONLY unauthenticated surface)
Serves TWO patient-facing flows, parameterized by `kind` (`?kind=` on slots, body field on book):
**`/agendar`** (kind=`llamada`, default) — free 10-min intro call, linked publicly — and
**`/reservar`** (kind=`sesion`) — real 75-min individual session (patient picks modalidad;
monto = patient tarifa or 39; enters the normal 24h WhatsApp reminder flow), link shared
privately by the practice. Both use the same page component (`PublicBooking.jsx`, `kind` prop),
the same weekly Disponibilidad windows, and per-therapist deep links (`?terapeuta=<id>`).
Endpoints: `GET ?action=therapists` (bookable therapists, public-safe fields only),
`GET ?action=slots&therapist&date[&kind]` (configured weekly windows − Google freebusy −
existing sessions; 30-min cadence, duration per kind, 12h min notice, 14-day horizon, Ecuador
tz; freebusy failure ⇒ FAIL CLOSED, no slots), `POST ?action=book` (honeypot; rate limits via
the `booking_attempts` table; strict validation; slot re-verified server-side → 409 `slot_taken`;
patient reused by phone or created; estado always `programada`; best-effort Calendar event).
Uses `SUPABASE_SERVICE_KEY` — **never open anon RLS on patients/sessions for this.** Shared Google
auth/freebusy lives in `netlify/lib/calendar.mjs`. Llamadas get NO WhatsApp reminder (excluded in
`send-reminders`). Availability is edited in the app's **Disponibilidad** page (owner: everyone;
therapist: own row via RLS `therapists_self_update`).
**The slot + booking engine now lives in `netlify/lib/booking.mjs`** (`computeSlots`, `nextSlots`,
`createBooking`) — extracted so the lead bot books free calls through the exact same code. This file
keeps only its HTTP shell (CORS, honeypot, rate limits, validation) and delegates the core. Do NOT
re-inline a second slot engine.

### Lead funnel / WhatsApp button bot (#4 + #20, shipped 2026-09-26 — behind `LEAD_BOT_LIVE=false`)
Turns Meta ad leads into booked free calls, no hand-typed replies. **Measurement is always on**; the bot
only SENDS when `LEAD_BOT_LIVE=true`. See `EFIMERAMENTE_STATE.md` for the go-live gate + test checklist.
- **`netlify/lib/leadBot.mjs`** — the brain. Classifies an inbound sender (patient/therapist/payer vs
  lead), creates/advances the `leads` row, runs the button state machine (message 1 → categoría list →
  therapist cards → slot list → booking → confirmation; FAQ list with canned answers), and the follow-up
  entry points. Wired into `whatsapp-cloud-webhook.mjs` (which also handles `smb_message_echoes` →
  `bot_paused`, the manual-reply pause, and the therapist's `Se hizo`/`No contestó` result reply).
- **Three-tier free-text handling (#24, 2026-09-26):** button taps (T1) never touch a model. FREE TEXT
  (T2) → **`netlify/lib/leadBrain.mjs`** → Claude via the **Anthropic Messages API** (Sonnet,
  `ANTHROPIC_API_KEY`, raw fetch, 8s AbortController, forced tool-call → `{accion, texto, motivo}`). Claude
  may answer ONLY from a curated **fact sheet** (`funnel_knowledge` table + live therapist captions), else
  it DERIVES (T3): crisis/self-harm/violence/clinical → `motivo:"urgente"` (reply includes ECU 911 on
  life-risk) + URGENTE push + `bot_paused`; out-of-scope/uncertain → standard handoff line + pause.
  Greetings/thanks never derive. Every T2 decision is logged to **`lead_ai_decisions`** (Marketing →
  Embudo). The old keyword path (`classifyKeywords`/`classifyFreeText`, APIMart) is the **fallback only**
  when the Anthropic call is missing/fails/times out. **`ANTHROPIC_API_KEY` (Netlify, functions scope) is
  required for T2** — absent ⇒ silent keyword fallback. Fact sheet editable in Marketing → Configuración
  ("Hoja de datos"); it deliberately excludes home visits (those derive to Nicolás). Migration
  `supabase/lead-funnel-04-knowledge.sql`.
- **Turns (#59, 2026-10-07):** free text is queued in `lead_inbox` and answered by `lead-reply-background` →
  `netlify/lib/leadTurns.mjs#processInbox`: 4 s of quiet → ALL queued messages = ONE turn, one turn per lead
  (`leads.turn_lock_at`). Inside `runBot` every send is buffered (`beginTurn`/`endTurn`): texts, then at most ONE
  tail — link > one card block (≤4, merged) > one question. New sends in a turn must go through `txt`/`question`/
  `renderCards`/`sendBookingLink`, never `tx.*` directly. CANNED already sent → `leads.canned_enviados`.
- **Send log (#66, 2026-10-08):** every LEAD-facing send (sendNow/cards/link/nudge/lead templates) goes through
  `netlify/lib/botSendLog.mjs#loggedSend` → `lead_bot_sends` (text + wamid + es_prueba; failed send → `error`, re-thrown
  unchanged). Inserts are fire-and-forget, flushed after the sends (`flushBotSendLogs`, 3 s cap) — never delay a send.
  New lead sends must use it; staff/owner/broadcast sends must not. View **`funnel_v`** (one row per real ad lead,
  outage excluded) = `supabase/funnel-v-66.sql`. Harness: `node scripts/harness-sendlog-66.mjs`.
- **`netlify/lib/waSend.mjs`** — Cloud-API session sends (text, reply buttons, list, image cards) via
  Dualhook, valid inside the free 72h CTWA window ($0). Templates live in **`netlify/lib/leadTemplates.mjs`**
  (recordatorio_llamada, resultado_llamada, rebook_llamada, primera_sesion + submit/send).
- **`netlify/functions/lead-followups.mjs`** — `*/15` cron: +2h/+22h silent nudges (quiet hours
  21:00–08:00 GYE), call reminder 1h before, therapist result 5 min after, 48h first-session nudge.
  Kill-switch = `LEAD_BOT_LIVE`. **Never touches `convirtio`** (read-only).
- **DB:** `leads` (owner-only RLS, one row per phone, stage timestamps), `funnel_categorias` (editable
  category→cards mapping), `therapists.recibe_nuevos` / `funnel_caption` / `funnel_card_url`. Migrations
  `supabase/lead-funnel-0{1,2,3}-*.sql`. Config `recibe_nuevos` OFF for Daniela + Mariana.
- **Marketing Module** (`src/pages/MarketingFunnel.jsx` + `src/lib/funnel.js`): Embudo tab (funnel by
  day/week + by ad, % between steps, median time to booking) and Configuración tab (category ordering +
  captions/recibe_nuevos editors). Legacy campaign spend view kept under the Campañas tab.

### Owner outbox — `netlify/lib/ownerOutbox.mjs` (#45, 2026-10-05)
**Any workflow that must reach Nicolás uses `notifyOwner` — never a new template**, and never a
push that asks him to remember to type a command. `notifyOwner(supabase, { kind, resumen, messages })`
queues the exact WhatsApp message(s) (`[{type:'text',body} | {type:'buttons',body,buttons:[{id,title}]}]`)
in `owner_outbox` (owner-only RLS, `supabase/owner-outbox.sql`):
- his 24h window open (inbound from the owner phone in `whatsapp_messages` < 24h − 5 min ago) → sent now, `enviado`;
- closed → stays `pendiente` + ONE `ping_nico` template per closed window (UTILITY, `{{1}}` = resumen,
  quick-reply "Ver"; defined in `leadTemplates.mjs#OWNER_TEMPLATES`, submitted via
  `submit-lead-templates?name=ping_nico`); several pending → "{n} pendientes: …" (≤100 chars);
- `ping_nico` not APPROVED as UTILITY, or the send fails → Web Push fallback, row stays `pendiente`.
- `whatsapp-cloud-webhook` calls `flushOwnerOutbox()` on ANY owner inbound (oldest first) before his
  command; the "Ver" tap does nothing else. Owner-phone messages never enter the lead bot (except in bot test mode, #56).
First consumer: `facturar-report` (Mon+Thu 09:00 GYE) → snapshot (origen `cron`) + the same list +
[Aprobar] [Ahora no] the "facturas" command sends. Invoices are emitted ONLY by his Aprobar tap.

### Bot test mode — `netlify/lib/botTestMode.mjs` (#56, 2026-10-06)
Nicolás tests the lead flow from the OWNER phone. Commands to the 9933 (exact message, case/accent-insensitive;
replies go to him via `sendStaffText`, no sanitizer, no "Hola, hablas con Nico"):
- **"modo prueba"** → `bot_test_mode` (one row per owner phone, owner-only RLS) activo, `expira_at` = now + 2h.
- **"reiniciar"** → deletes his TEST lead (`leads.es_prueba` AND last-9 = owner) so the next message is a first contact;
  its `lead_ai_decisions` are kept (flagged `es_prueba`, `lead_id` → null); his "[PRUEBA]" llamadas → cancelada + calendar cancel.
- **"fin prueba"** → off. Expired → the normal owner path, no warning.
While active, every other owner message goes to recordLead(`esPrueba`) + runBot, renewing expira_at; "facturas",
Aprobar/Ahora no, the "Ver" tap and `flushOwnerOutbox` keep working as owner (handled first in the webhook).
**`es_prueba` isolation — keep it in any new lead query/sender:** no CAPI event (sweep filter + guard in `capi.mjs#fire`),
no lead-followups (A–D filter), excluded from `getFunnelData` (leads + decisions) and capi-admin counts. `/agendar` booked
with the owner phone while active → `createBooking({prueba:true})`: notas "[PRUEBA] …", owner-only push, no therapist push,
no Calendar, patient reused/created as es_lead and never promoted. Handoff pushes to Nicolás work normally.
Harness: `node scripts/harness-modo-prueba.mjs`. Migration `supabase/lead-funnel-11-modo-prueba.sql`.

### `sesiones-pendientes.mjs` — past sessions can't stay in Pendiente (#52, 2026-10-05)
Scheduled `30 13 * * *` (08:30 GYE), logic in `netlify/lib/sesionesPendientes.mjs`. Scope: estado
`programada` AND tipo ≠ `llamada` (never llamadas) AND fecha < today GYE, therapist activo with a
telefono. One WhatsApp per stuck session (therapist, fecha, hora order): "Hola {nombre}! Hay una sesión
que se quedó en estado pendiente. / {patientLabel}, del {2 de octubre} / Se dio la sesión? / Att: La
Caracola Mágica🐚✨" + [Ocurrió] [No ocurrió] (Daniela → "Dani"; therapist copy keeps the emoji and
goes through `waSend.mjs#sendStaffButtons`, NOT the lead-bot sanitizer).
- therapist's 24h window open → free-form buttons, ids `est_ok:/est_no:<session_id>`;
- closed → template `sesion_pendiente` (UTILITY, `leadTemplates.mjs#STAFF_TEMPLATES`, submit via
  `submit-lead-templates?name=sesion_pendiente`; quick-reply payloads set per send) once APPROVED;
- not approved / send fails → ONE Web Push per therapist per day, therapist only (`skipOwner`).
- Logged in `session_estado_reminders` (owner-only RLS, `supabase/session-estado-reminders.sql`); same-day
  reruns don't resend. Reminded on 3 different days, unanswered → `notifyOwner` once (kind
  `sesion_sin_cerrar`, `escalated_at`); the therapist keeps getting reminded daily.
- **Tap** (`whatsapp-cloud-webhook` → `handleEstadoTap`, before the patient estado flip + lead bot):
  only the session's own therapist (last-9) counts; must still be `programada` (else "Esa sesión ya
  estaba cerrada."); est_ok → `confirmada` via a plain service-role UPDATE (so `consume_saldo_on_confirm`
  and the sessions triggers fire), est_no → `cancelada` + calendar `cancel` (best-effort); no push;
  reply "Listo, quedó como Confirmada/Cancelada."; stamps `respuesta`/`respondida_at`. Nothing else in
  this flow ever changes an estado. Harness: `node scripts/harness-sesiones-pendientes.mjs`.

### Broadcasts — `broadcast-sweep.mjs` + `netlify/lib/broadcast.mjs` (#53, 2026-10-05)
Reusable one-message-to-a-list sends. Tables `broadcasts` (nombre, terapeuta_id, template_name, body with
`{{1}}` = saludo, estado `borrador|filtrando|listo|enviado`, notified_at) + `broadcast_recipients` (orden,
telefono, saludo, etiqueta, excluido/excluido_motivo, canal, claimed_at, wamid, sent_at, error); owner-only
RLS, `supabase/broadcasts.sql`. Flow: build recipients with `buildRecipients()` (dedupe by last-9 AND full
name, keeps the row with most sessions; greeting = first word of nombre, couples "X y Y" in full, parens
stripped) → `filtrando`: send the numbered `etiqueta` list to the therapist via **`broadcast-admin`** (POST
`?token=<LEAD_TOOLS_TOKEN>` `{broadcast_id, body}` — can ONLY message that broadcast's therapist; needed
because `WA_DUALHOOK_API_KEY` is a masked secret, unreadable locally) → mark exclusions → `listo`.
Sweep (`*/15`, sends only 08:00–21:00 GYE, ≤25 sends/run): open 24h window → free-form `body`
(`waSend.mjs#sendStaffText`, no sanitizer); closed → `template_name` once APPROVED (any category); else waits.
Atomic claim (`claimed_at`) before each send — a claimed row is never resent; failures → `error`. Async
'failed' statuses (e.g. **131049** marketing cap) reconciled from `whatsapp_delivery_status`. All done +
30 min settle → `enviado` + ONE `notifyOwner` (kind `broadcast_resultado`) listing who didn't get it.
Templates live in `leadTemplates.mjs#BROADCAST_TEMPLATES` (submit via `submit-lead-templates?name=`).

### `send-reminders.mjs` — hourly WhatsApp reminder (SCHEDULED, cron-only)
Cron `0 * * * *` declared **in-code** via `export const config = { schedule }` (not `netlify.toml`).
Sends a ~24h-before reminder via Twilio Content API (approved quick-reply template, one variable
`{{1}}` = patient name), then stamps `sessions.reminder_sent_at` so each session is reminded once.
Window = appointments 23–25h out.
- **KILL-SWITCH:** only sends when env `REMINDERS_LIVE === 'true'`. Default/unset ⇒ **dry run**
  (logs eligible count, sends nothing, leaves `reminder_sent_at` untouched). **Leave OFF unless intentionally going live.**
- ⚠️ **Scheduled functions are NOT HTTP-invocable** in the modern runtime. Trigger manually via the
  Netlify UI → Functions → "Run now" (respects the kill-switch), or use the webhook's `?test_session_id`
  path below for a controlled single send.
- Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_CONTENT_SID`, `SUPABASE_SERVICE_KEY`.
  ⚠️ Never hardcode the Twilio Content SID in source — Netlify's secret scanner fails the build.

### `twilio-webhook.mjs` — HTTP surface (health, test-send, inbound replies)
The one HTTP-reachable WhatsApp function. Three paths:
- `GET ?health` — presence-only env diagnostics (booleans, never values) + `build` marker.
- `GET ?test_session_id=<uuid>` — controlled single test send, bypassing the kill-switch AND the
  23–25h window (stamps `reminder_sent_at`). ⚠️ Sends a REAL WhatsApp — point at a test number.
  Lives here (not on `send-reminders`) because scheduled functions can't be hit over HTTP.
- `POST` — Twilio inbound: a quick-reply tap matches the patient by phone (normalized E.164 or
  last-9-digits), finds their soonest reminded `programada` session, sets estado
  (`confirmed`→`confirmada`, `canceled`→`cancelada`), and on cancellation also soft-cancels the
  Google Calendar event (greyed "CANCELADA — " title + `transparency:transparent` so the slot frees
  but stays visible — the `cancel` action, not a delete). Always returns empty TwiML 200.

### Web Push notifications (therapists' + owner's phones)
Pushes fire on: patient **confirms** (Twilio reply), patient **cancels** (Twilio reply),
**new llamada** booked on `/agendar`, and **in-app estado changes** to Confirmado/Cancelado
(toggle or drawer edit → `notify-estado` function). Pieces:
- `netlify/functions/notify-estado.mjs` — POST `{session_id}` + `Authorization: Bearer <Supabase
  access token>`. Verifies the token and rebuilds the notification from the DB row (client input
  is just the id). Notifies the session's therapist + owner regardless of who acted (the
  actor-exclusion shipped in v1.2 was removed 2026-07-03 per Nicolas — it made testing
  impossible). Called fire-and-forget from `queries.js#notifySessionEstado` (hooked in
  `Sesiones.jsx` where estado actually changes — note: only on estado CHANGE; creating a session
  already set to confirmada does not push).
- `netlify/lib/push.mjs` — `notifyTherapist(supabase, terapeutaId, {title, body, url})` via the
  `web-push` package. Sends to the therapist's subscriptions AND all owner subscriptions
  (`terapeuta_id IS NULL` rows = the owner, who receives EVERYTHING; RLS lets only `is_owner()`
  hold NULL rows). Never throws (best-effort like calendar sync). Prunes dead subscriptions
  (push service 404/410 — e.g. PWA deleted from the Home Screen). Callers: `twilio-webhook.mjs`
  (after estado update) and `public-booking.mjs` (after session insert).
- **VAPID keys:** public half committed in `src/lib/push-public-key.js` (safe by design); private
  half ONLY in the Netlify env var `VAPID_PRIVATE_KEY` — pushes are silently skipped (with a log)
  until it's set.
- Client: `src/lib/push.js` (subscribe/unsubscribe/status) + opt-in card in `Disponibilidad.jsx`
  (per-device; therapists AND the owner — the owner subscribes with `terapeuta_id` null).
  SW registration in `main.jsx`.
- Subscriptions live in `push_subscriptions` (see `supabase/push-subscriptions.sql`).
- **iOS reality:** needs iOS 16.4+ AND the PWA installed to the Home Screen; permission must be
  requested from a tap. Deleting the Home-Screen icon silently kills the subscription (it gets
  pruned on next send; the therapist must reinstall + re-activate).

---

## Database & migrations (`supabase/`)

Tables in active use: **`patients`**, **`sessions`**, **`therapists`**, **`profiles`** (auth role linkage),
**`push_subscriptions`** (Web Push, per-device), **`booking_attempts`** (public-booking rate limits),
**`campaigns`** + **`campaign_metrics`** (Marketing module, owner-only — `marketing-campaigns.sql`).
- `auth-setup.sql` — GO-LIVE migration: adds `patients.tarifa`/`metodo_pago`, `profiles` table, RLS policies,
  and `is_owner()` / `my_terapeuta_id()` helpers. Idempotent (guarded). Run once in SQL editor.
- `add-reminder-sent-at.sql` — adds `sessions.reminder_sent_at` (+ partial index). **Required** for the
  reminder flow; the reminder queries fail without it.
- `seed-data.sql` — seed rows.

**RLS model:** owner = full access to everything. Therapist = read only their own patients; full CRUD only
on their own sessions. Anon/service_role grants already applied.

### Two identity systems — DO NOT CONFUSE
- **App login** = `@efimeramente.ec` addresses (Supabase Auth).
- **Google Calendar sync** = personal Gmails in `therapists.calendar_email`.
- Always confirm real Gmail/emails with Nicolas — never infer or guess an address.

## Environment variables

- `.env` (local, gitignored): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (browser); plus
  `SUPABASE_SERVICE_KEY` used by Claude Code for autonomous row writes. See `.env.example`.
- Netlify dashboard (functions only): `SUPABASE_SERVICE_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`, the Twilio
  vars, `REMINDERS_LIVE`, and `VAPID_PRIVATE_KEY` (Web Push). Never put these in the repo.

## Conventions & gotchas

- Times from the DB are `HH:MM:SS`; form state often holds `HH:MM`. `checkFreebusy` appends `:00` before
  building RFC3339 timestamps — mind this when constructing datetimes.
- Session/patient writes: add any new persisted column to the whitelist arrays in `queries.js`.
- Keep all enum→label logic in `constants.js`, not in components.
- Calendar/reminder sync must stay best-effort — never let it block or fail a core DB write.
- No TypeScript, no tests, no linter — verify by building and running.
- **Modern-runtime Response gotcha:** HTTP 204/205/304 are null-body statuses — return `new Response(null, {status:204})`, never `Response('', …)`, or the constructor throws and the function 502s (this silently broke the calendar CORS preflight once). Also test CORS-protected functions via an actual OPTIONS preflight, not just the POST — curl a POST works even when the preflight is broken, but browsers won't.
- **Service worker: PUSH-ONLY — never add a `fetch` handler.** This is an always-online tool; it must serve fresh data, not a cached offline shell. History: an early deploy registered a caching SW whose orphans served users a stale app shell after every deploy; it was killed with a self-destroying SW. Since 2026-07-02, `public/sw.js` is a **push-only** worker (Web Push notifications for therapists — `push` + `notificationclick` listeners, activate-time cache wipe). Because it has **no `fetch` handler**, the browser goes straight to the network for everything, so the stale-shell failure is structurally impossible — and that's the invariant to protect: **never add a `fetch` handler or `vite-plugin-pwa`** without a deliberate caching strategy. `public/_headers` keeps `/sw.js` at `Cache-Control: no-cache` so SW updates always propagate. To verify a deploy is actually live, grep the served bundle for a known-new string rather than comparing hashes (Netlify's build hash differs from a local build).
```
