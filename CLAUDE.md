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
- DDL (schema changes) can NOT go through the API — run `.sql` files by hand in the Supabase SQL editor.
- Data writes (rows) CAN be done with the `SUPABASE_SERVICE_KEY` in `~/my-site/.env` (service_role). Never print it.

---

## Architecture

### App shell & routing (`src/App.jsx`)
`AuthProvider` → `BrowserRouter` → `Gate`. Routes are **role-gated**:
- **owner** (`fullAccess`): Dashboard, Sesiones, Pacientes, Seguimiento, Finanzas, DS.
- **therapist**: Sesiones only (redirected there from `/`).

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
- **Built:** `Dashboard`, `Sesiones`, `Pacientes` (largest, full expediente), `Login`, `DesignSystem`.
- **Placeholders (14 lines each — NOT built yet):** `Seguimiento`, `Finanzas`. These are next-up backlog.
- Session create/edit UI lives in `src/features/sesiones/` (`SesionDrawer.jsx`, `views.jsx`, `PatientSelect.jsx`).

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

---

## Database & migrations (`supabase/`)

Tables in active use: **`patients`**, **`sessions`**, **`therapists`**, **`profiles`** (auth role linkage).
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
  vars, and `REMINDERS_LIVE`. Never put these in the repo.

## Conventions & gotchas

- Times from the DB are `HH:MM:SS`; form state often holds `HH:MM`. `checkFreebusy` appends `:00` before
  building RFC3339 timestamps — mind this when constructing datetimes.
- Session/patient writes: add any new persisted column to the whitelist arrays in `queries.js`.
- Keep all enum→label logic in `constants.js`, not in components.
- Calendar/reminder sync must stay best-effort — never let it block or fail a core DB write.
- No TypeScript, no tests, no linter — verify by building and running.
- **Modern-runtime Response gotcha:** HTTP 204/205/304 are null-body statuses — return `new Response(null, {status:204})`, never `Response('', …)`, or the constructor throws and the function 502s (this silently broke the calendar CORS preflight once). Also test CORS-protected functions via an actual OPTIONS preflight, not just the POST — curl a POST works even when the preflight is broken, but browsers won't.
- **No service worker — and keep it that way.** This is an always-online tool; it must serve fresh data, not a cached offline shell. An early deploy once registered a PWA service worker, and orphaned copies kept serving users a stale app shell after every deploy (fresh `curl` saw new code, the browser didn't). Fix shipped: a self-destroying `public/sw.js` (skipWaiting → clear caches → unregister → reload tabs) + a `public/_headers` rule pinning `/sw.js` to `Cache-Control: no-cache`. **Leave both in place** so late stragglers still get evicted, and **do not add `vite-plugin-pwa` / register a SW** without a deliberate caching strategy. `manifest.webmanifest` is fine (installability only; registers nothing). To verify a deploy is actually live, grep the served bundle for a known-new string rather than comparing hashes (Netlify's build hash differs from a local build).
```
