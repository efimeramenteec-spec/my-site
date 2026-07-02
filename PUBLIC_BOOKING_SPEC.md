# Public Booking ("Llamada") — Build Spec

> **Purpose:** Replace the last Calendly dependency — a **public, patient-facing** page where a
> prospective patient books a **free 10-minute "llamada"** with a therapist they choose, seeing only
> that therapist's genuinely-free slots (Google Calendar + existing sessions). This is the marketing
> funnel's entry point. Read `CLAUDE.md` and `EFIMERAMENTE_STATE.md` first for architecture.
>
> **Status:** SPEC — not yet built. Intended to be built on Claude Fable 5.
> **Decisions already made (do not re-litigate):**
> 1. **Per-therapist availability** — each therapist has configurable weekly bookable hours + an
>    enable toggle, editable by the owner. (Not global hours.)
> 2. **No WhatsApp reminder** for llamadas — calendar event + on-screen confirmation only.
> 3. **Baseline anti-abuse** — honeypot + server-side rate limit + strict validation.

---

## Why this is the trickiest feature so far

It is the **first public, unauthenticated surface**. Everything else sits behind Supabase Auth.
Anonymous strangers must read availability and create `patients` + `sessions` rows. **Do NOT open
`anon` INSERT via RLS** — that's a spam/data-exfiltration vector. All public writes go through a
**dedicated Netlify function using `SUPABASE_SERVICE_KEY` server-side**, which is the only thing that
validates and writes. The public page never touches Supabase directly (it only calls the function).

---

## A. Database changes (DDL — run by hand in the Supabase SQL editor; not via API)

Current state (verified 2026-07-02): `sessions.tipo` ∈ {`individual`, `pareja`}. `therapists` columns:
`id, nombre, apellido, email, telefono, color, activo, created_at, calendar_email`. No booking columns.

1. **Add `llamada` tipo.** Find any existing check constraint on `sessions.tipo` and extend it (verify
   the constraint name in the SQL editor first — it may not exist):
   ```sql
   alter table sessions drop constraint if exists sessions_tipo_check;
   alter table sessions add constraint sessions_tipo_check
     check (tipo in ('individual','pareja','llamada'));
   ```
2. **Per-therapist booking config** on `therapists`:
   ```sql
   alter table therapists add column if not exists booking_enabled boolean not null default false;
   -- Weekly bookable windows in Ecuador local time. Keys: mon..sun. Each day = array of [start,end] HH:MM ranges.
   alter table therapists add column if not exists booking_availability jsonb not null default '{}'::jsonb;
   -- Example value:
   -- {"mon":[["09:00","13:00"],["15:00","18:00"]],"tue":[["08:00","13:00"]],"wed":[],...}
   ```
   Slot cadence, minimum notice, and booking horizon are **global config constants** in the function for
   v1 (see B) — promote to per-therapist columns later if needed.
3. **RLS:** no new public policies. The booking function uses the service role (bypasses RLS). The
   owner edits `booking_enabled` / `booking_availability` through the existing authenticated app
   (owner already has full CRUD on `therapists` via `therapists_owner_write`). Confirm the owner UPDATE
   path reaches these new columns.

---

## B. Backend — new function `netlify/functions/public-booking.mjs`

Modern runtime (`export default async (req) => Response`), like `calendar.mjs`. Uses
`SUPABASE_SERVICE_KEY`. Action-based (query param `action`). Reuse `normalizePhone` from
`netlify/lib/whatsapp.mjs`. Factor the Google Calendar **freebusy** logic out of `calendar.mjs` into
`netlify/lib/calendar.mjs` (shared) so both functions use one implementation — do not duplicate.

**Global config constants (v1):** slot cadence `30` min; call length `10` min; min notice `12` h;
horizon `14` days; timezone `America/Guayaquil` / `-05:00` (no DST). Rate limits: **2 bookings / phone /
day**, **5 bookings / IP / hour** (tunable).

### `GET ?action=therapists`
Return only `booking_enabled = true` therapists, **public-safe fields only** (`id, nombre, apellido,
color`). Never expose `calendar_email`, `telefono`, `email`.

### `GET ?action=slots&therapist=<id>&date=<YYYY-MM-DD>`
Compute available 10-min slots for that therapist on that date:
1. Look up the weekday's windows in `booking_availability`. Empty ⇒ no slots.
2. Generate candidate start times at slot cadence within each window; each needs `call length` free.
3. Subtract **Google Calendar busy** periods (shared freebusy on the therapist's `calendar_email`).
4. Subtract **existing Supabase sessions** for that therapist that day (any tipo).
5. Drop slots earlier than `now + min notice`; drop dates beyond `horizon`.
6. Return array of available start times (Ecuador tz, e.g. `["09:00","09:30",...]` or ISO).
CORS: allow the site origin(s) (same allow-list pattern as `calendar.mjs`).

### `POST ?action=book`
Body: `{ therapist_id, date, start_time, patient:{nombre,apellido,telefono,email?,motivo?}, website }`
(`website` = honeypot; must be empty).
1. **Honeypot:** if `website` non-empty ⇒ return a fake `200 {ok:true}` and do nothing.
2. **Rate limit:** enforce per-phone/day and per-IP/hour (IP from `x-forwarded-for`). Simplest store: a
   `booking_attempts` table (`id, ip, phone, created_at`) — insert on each attempt, count recent rows.
3. **Validate:** names non-empty; `normalizePhone(telefono)` valid E.164; email format if present.
4. **Re-verify the slot is still free** (recompute step-B availability for that exact slot). If taken ⇒
   `409 {error:"slot_taken"}` — the frontend re-fetches slots.
5. **Upsert patient by phone:** look up by normalized phone. If found, **reuse** that patient id (do not
   overwrite their record). If not, create a new patient assigned `terapeuta_id = therapist_id`
   (whitelist columns via the existing `PATIENT_COLUMNS` shape — nombre, apellido, telefono, email,
   motivo_consulta, terapeuta_id; tarifa/metodo_pago use DB defaults).
6. **Insert session:** `tipo='llamada'`, `terapeuta_id`, `patient_id`, `fecha=date`,
   `hora_inicio=start_time+':00'`, `hora_fin=start+10min+':00'`, `estado='programada'`,
   `modalidad='virtual'` (a call is online — confirm the modalidad enum value; use the existing "en
   línea" value), `monto=0`, `pagado=false`.
7. **Google Calendar sync** (best-effort, never blocks the save): create event, title
   `Llamada — {patient} · 10 min`. Store `google_event_id`.
8. **No reminder.** Also harden `send-reminders.mjs`: add `tipo <> 'llamada'` to the eligible-sessions
   query so a llamada can never trigger a WhatsApp send regardless of how it was created.
9. Return confirmation `{ ok:true, therapist_name, date, start_time }` — no sensitive data.

**Never** return patient/therapist PII from any public endpoint beyond the confirmation echo.

---

## C. Frontend — public page (outside the auth gate)

1. **Routing (`src/App.jsx`):** add a public path that bypasses `Gate`/`AppShell` entirely. E.g.:
   ```jsx
   <Routes>
     <Route path="/agendar/*" element={<PublicBooking />} />
     <Route path="/*" element={<Gate />} />
   </Routes>
   ```
   `PublicBooking` requires no login and must not render owner/therapist chrome. It only `fetch`es the
   `public-booking` function (it doesn't need the Supabase client). Support a deep link
   `/agendar?terapeuta=<id>` that preselects a therapist.
2. **Flow (Calendly-like, Spanish, mobile-first, BRAND.md tokens — brand-lavender, warm surfaces):**
   - Step 1 — pick therapist (cards: name + color/initial). Skipped if `?terapeuta=` present.
   - Step 2 — pick a date (next `horizon` days) → fetch slots → show available 10-min times in Ecuador
     time, with a "hora de Ecuador" note.
   - Step 3 — intake form: **Nombre, Apellido, Teléfono** (`+593` prefilled, required), **Email**
     (optional), **¿De qué te gustaría hablar?** (motivo, optional) + hidden honeypot `website`.
   - Step 4 — confirmation screen: "¡Listo! Tu llamada con {terapeuta} el {fecha} a las {hora}." Handle
     `409 slot_taken` gracefully (toast + re-fetch slots).
3. **Owner availability editor (authenticated, owner-only):** a settings surface to (a) toggle
   `booking_enabled` per therapist, (b) edit weekly hours (weekday rows with add/remove time ranges),
   and (c) copy the public link (`/agendar` and the per-therapist `/agendar?terapeuta=<id>`). Keep enum
   → label logic in `constants.js`. Persist via the existing authenticated data layer (`queries.js`);
   add `booking_enabled` / `booking_availability` to `THERAPIST` select + any write whitelist.

---

## D. Constants (`src/lib/constants.js`)
- Add `llamada` to the tipo label map ("Llamada") and to `TIPO_FORM` if internal creation is also
  wanted ("Llamada (10 min)"). Add `DURACION_MIN['llamada'] = 10` (no buffer — exact 10 min).
- Keep the therapist-color fallback neutral (see the existing `#b48ae4` note in `views.jsx`).

---

## E. Conventions & gotchas to respect (from CLAUDE.md)
- Modern runtime null-body statuses: `return new Response(null, {status:204})` — never `Response('',…)`
  (502s the CORS preflight). Test the OPTIONS preflight, not just POST.
- Times are `HH:MM:SS` in the DB; append `:00` when building from `HH:MM`.
- Calendar/reminder sync is best-effort — never let it block or fail a core DB write.
- DDL runs by hand in the SQL editor; row writes can use the service key.
- No service worker (see the self-destroying `sw.js` note) — don't add one.

---

## F. Test checklist (verify before shipping — `npm run build` + live)
- [ ] `/agendar` loads with **no** auth and no owner/therapist chrome.
- [ ] Therapist list shows only `booking_enabled = true`; no PII leaked.
- [ ] Slots = configured hours **minus** Google Calendar busy **minus** existing sessions; min-notice &
      horizon applied; Ecuador tz correct.
- [ ] Booking creates (or reuses by phone) a patient + a `llamada` session + a Google Calendar event.
- [ ] Concurrent double-book returns `409` and the UI recovers.
- [ ] Honeypot + rate limits block spam; validation rejects junk.
- [ ] A `llamada` is **never** picked up by `send-reminders.mjs`.
- [ ] Owner can toggle availability, edit hours, and copy the link.

---

## G. Suggested build order (for the Fable 5 session)
1. DDL (tipo + therapist booking columns) in the SQL editor. 2. `constants.js` (llamada). 3. Shared
freebusy lib + `public-booking.mjs` (therapists → slots → book), with `send-reminders` exclusion.
4. Owner availability editor + link copy. 5. `PublicBooking` public page + routing. 6. End-to-end test
against the checklist. Give Fable 5 this whole file as the brief and run at high/xhigh effort.
