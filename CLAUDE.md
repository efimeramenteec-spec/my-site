# CLAUDE.md — Efimeramente Panel de Control

Internal practice-management PWA for the Efimeramente psychology practice (Ecuador).
Owner (Nicolas) + 6 therapists. Spanish UI. Manages sessions, patients, Google
Calendar sync, and WhatsApp appointment reminders.

**This file is the cold-start orientation.** For the live backlog / "what changed last
session," read `EFIMERAMENTE_STATE.md`. For visual/design tokens, read `BRAND.md`.

---

## Stack & infra

- **Frontend:** React 18 + Vite 6, React Router 6, Tailwind 3, Recharts. Plain `.jsx`, no TypeScript.
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
  `mcp__*Supabase*` tools at session start. **Tell Nicolas before running any DDL.** Keep each migration
  mirrored as a `.sql` file in `supabase/`.
- Fallback when the connector is absent: DDL by hand in the Supabase SQL editor; row writes with the
  `SUPABASE_SERVICE_KEY` in `~/my-site/.env` (service_role). Never print it.

---

## Architecture

### App shell & routing (`src/App.jsx`)
`AuthProvider` → `BrowserRouter` → Routes. `/agendar` is **public** (no auth, no chrome — the
patient-facing booking page `PublicBooking.jsx`; it talks ONLY to the `public-booking` Netlify
function, never Supabase). Everything else goes through `Gate` and is **role-gated**:
- **owner** (`fullAccess`): Dashboard, Sesiones, Pacientes, Seguimiento, Finanzas, Marketing, Disponibilidad, DS.
- **therapist**: Sesiones (redirected there from `/`) + Disponibilidad (their own availability only).

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

### Other lib files
- `conflicts.js` — session overlap detection against **Supabase** sessions (local, synchronous).
- `format.js` — date/week helpers (`dateKey`, `weekRange`, `addDays`).
- `auth.jsx` — `AuthProvider` / `useAuth`; loads the `profiles` row to get `role` + `terapeuta_id`.

### Pages (`src/pages/`)
- **Built:** `Dashboard`, `Sesiones`, `Pacientes` (largest, full expediente), `Marketing` (owner-only
  acquisition funnel — see below), `Login`, `DesignSystem`.
- **Placeholders (14 lines each — NOT built yet):** `Seguimiento`, `Finanzas`. These are next-up backlog.
- Session create/edit UI lives in `src/features/sesiones/` (`SesionDrawer.jsx`, `views.jsx`, `PatientSelect.jsx`).

### Marketing module (owner-only, `src/pages/Marketing.jsx`)
Tracks the acquisition funnel **Meta Ads impresiones → WhatsApp conversaciones → llamada 10 min →
paciente** per campaign, plus CPA / LTV / LTV:CAC / ROAS. Hybrid data model:
- **Top of funnel (manual):** `campaigns` table holds per-campaign TOTALS (spend/impressions/
  clicks/conversations) — edited inline ("Actualizar cifras") or recomputed by importing a Meta Ads
  CSV report (`src/lib/metaCsv.js` parses EN/ES headers; daily rows upsert into `campaign_metrics`
  by (campaign_id, fecha) so re-imports never double-count; totals = sum of daily rows, so an
  import overwrites manual totals). The CSV must include a daily breakdown ("Day"/"Día").
- **Bottom of funnel (automatic):** llamadas/pacientes/ingreso derive live from sessions+patients
  via attribution: per-campaign booking links `/agendar?c=<slug>` (PublicBooking echoes `c`,
  public-booking.mjs stamps `sessions.campaign_id` + patient `fuente='ads'`/`campaign_id` — never
  overwriting an existing fuente), or the manual **Fuente/Campaña** selects in Pacientes →
  Configuración (`FUENTE_PACIENTE` in constants.js: ads/referido/organico/otro).
- LTV = total PAID revenue ÷ patients with ≥1 real (non-llamada, non-cancelled) session; a
  campaign "paciente" = attributed patient with ≥1 real session. Patients created during a
  campaign window with no fuente show as an amber "≈ estimate", never mixed into exact numbers.
- Also renders "Llamadas sin sesión" — patients whose last llamada has no real session after it
  (the follow-up list). RLS: campaigns/campaign_metrics owner-only; migration
  `supabase/marketing-campaigns.sql`.

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
POST with `{ action, calendarId, event, eventId }`. Actions: `create` | `update` | `delete` | `freebusy`.
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
  (`confirmed`→`confirmada`, `canceled`→`cancelada`), and on cancellation also deletes the Google
  Calendar event. Always returns empty TwiML 200.

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
