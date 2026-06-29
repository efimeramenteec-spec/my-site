# Efimeramente Panel de Control — Handoff State

> Last updated: 2026-06-29 (Build #6 session close)
> Read this file at the START of every new session before touching any code.

---

## Live URLs

| Resource | URL |
|----------|-----|
| Netlify (live app) | https://genuine-praline-0f8e70.netlify.app |
| GitHub repo | https://github.com/efimeramenteec-spec/my-site |
| Supabase project | https://vnityzpuhnkumsyfnskz.supabase.co |

---

## Phase Status

| Phase | Module | Status |
|-------|--------|--------|
| 1 | Dashboard | ✅ Live |
| 2 | Sesiones (calendar, nueva sesión, confirm/pay toggles) | ✅ Live |
| 3 | Pacientes (list + detail + create) | ✅ Live |
| — | Auth (login, RLS, role-gated routes) | ✅ Live |
| — | Seed data (6 therapists, 150 patients, 301 sessions) | ✅ In Supabase |
| 4 | Seguimiento (analytics) | ⏳ Pending |
| 5 | Finanzas (ledger) | ⏳ Pending |
| — | Twilio webhook (`netlify/functions/twilio-webhook.js`) | ⏳ Pending |
| — | Therapist scheduling-only view (trim for therapist role) | ⏳ Pending |

---

## Repo / Codebase Notes

- **Two clones on Nicolas's Mac:** `~/my-site` is the live one (push from here). `~/Claude/Projects/New Efimeramente App 3` is the Cowork workspace (may be stale). Always verify with `git log` before editing.
- **Workflow:** Write/edit in workspace → Nicolas `cp` to `~/my-site` → `git add && commit && push`.
- **Demo mode:** No `VITE_SUPABASE_ANON_KEY` → demo data. Key is in Netlify env → live Supabase data.
- **Font:** `ChettaVissto.woff2` does NOT exist in the repo (not needed yet).
- **Logo PNGs:** All three are now in `public/logos/` and pushed:
  - `LOGOTIPOCORTO (1).png` — sidebar logo (short wordmark)
  - `LOGOTIPOLARGO (1).png` — long wordmark
  - `ISOTIPO (1).png` — PWA icon (butterfly "em✦" — `ISOTIPOEFIMERAMENTE.png` from Drive)
- **PWA manifest:** `public/manifest.webmanifest` references `ISOTIPO (1).png` for 192×192 and 512×512.

---

## Architecture

- **Frontend:** React + Vite + Tailwind CSS (PWA). DS components in `src/components/`.
- **Data layer:** `src/lib/queries.js` (Supabase-first, auto-falls back to `src/lib/demoStore.js`).
- **Auth:** `src/lib/auth.jsx` (AuthProvider/useAuth), `src/pages/Login.jsx`, role-gated routes in `App.jsx`.
- **Brand tokens:** `tailwind.config.js` — `text-content-*`, `bg-surface-warm`, `rounded-card/pill`, `shadow-soft/card`, `font-display/serif/body/caption`, `bg-brand-gradient`, `animate-float`.

---

## Database Schema (live in Supabase)

```sql
therapists(id, nombre, apellido, email, telefono, color, activo, created_at)
patients(id, nombre, apellido, telefono, email, fecha_nacimiento, terapeuta_id,
         motivo_consulta, estado_general, notas, tarifa, metodo_pago, created_at, updated_at)
sessions(id, patient_id, terapeuta_id, fecha, hora_inicio, hora_fin,
         tipo, modalidad, estado, monto, pagado, metodo_pago, notas, google_event_id, created_at, updated_at)
whatsapp_messages(id, session_id, patient_id, twilio_sid, direccion, cuerpo,
                  estado_entrega, respuesta_cita, raw_payload, received_at)
facturas(id, session_id, patient_id, concepto, monto, tipo, metodo_pago, fecha, notas, created_at)
```

RLS is ON. Grants needed if data doesn't load (paste in Supabase SQL editor):
```sql
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
```

---

## Business Rules (locked decisions)

- **Payment methods:** Transferencia | PayPhone | PayPal | Cash (`transferencia/payphone/paypal/cash`)
- **Session duration (incl. 15-min buffer):** Individual = 75 min, Pareja = 105 min. No hora_fin field — computed from tipo.
- **Nueva sesión form:** No estado/pagado/método fields. Born as `programada` + unpaid. Confirmation/payment via inline toggles in list view.
- **Per-patient tarifa** (default $39 USD) auto-fills session monto (editable). Per-patient metodo_pago default.
- **Patients created only in Pacientes module** — Nueva sesión picker is read-only (existing patients only).
- **Owner (Nicolas):** Full access — all modules, all therapists, all patients.
- **Therapist role:** Scheduling only — {erapist own calendar + own patient list. No Pacientes management, no Finanzas, no Seguimiento, no Dashboard, no other therapists' data. Pricing is owner-set only.
- **Each patient belongs to exactly ONE therapist.** No shared patients.
- **33 sessions have hora_inicio = '00:00'** (placeholder from seed — flag for Nicolas to correct).
- **Location:** Quito, Ecuador. Currency: USD. Timezone: America/Guayaquil (UTC-5).

---

## Auth Accounts (live)

| Role | Login email | Notes |
|------|------------|-------|
| Owner | nicolas@efimeramente.ec | Full access |
| Therapist | mariana@efimeramente.ec | Scheduling only |
| Therapist | carolina@efimeramente.ec | Scheduling only |
| Therapist | daniela@efimeramente.ec | Scheduling only |
| Therapist | camila@efimeramente.ec | Scheduling only |
| Therapist | francisco@efimeramente.ec | Scheduling only |
| Therapist | mariag@efimeramente.ec | Scheduling only |

> Emails are NOT real domains — used as usernames. Passwords held by Nicolas.

---

## What Was Done in Build #6

- ✅ **Pacientes data layer (`src/lib/queries.js`):** Added `getPatientsData`, `createPatient`, `updatePatient` — Supabase-first with demo fallback and `pickPatientColumns` whitelist.
- ✅ **Demo store (`src/lib/demoStore.js`):** Added `demoCreatePatient` and `demoUpdatePatient`.
- ✅ **Icons (`src/layout/icons.jsx`):** Added `IconX`, `IconSearch`, `IconPhone`, `IconMail` (were missing, caused Vite build error).
- ✅ **Pacientes.jsx:** Added `notas` field to `PatientDetail` form (Expediente section) — persists clinical notes per patient. All CRUD now functional.
- ✅ **Live site verified:** 150 patients loading from Supabase live data at `/pacientes`.
- **Deploy note:** `vite build --emptyOutDir false` needed to avoid EPERM on mounted Mac filesystem.

---

## What Was Done in Build #5

- ✅ **Logo PNG** in sidebar: `LOGOTIPOCORTO (1).png` now loads via `src/layout/Logo.jsx` (was showing text wordmark fallback).
- ✅ **PWA icon:** `ISOTIPO (1).png` replaced with `ISOTIPOEFIMERAMENTE.png` (butterfly "em✦" gradient image). Manifest + apple-touch-icon both point to it.
- ✅ **Pacientes.jsx encoding bugs fixed:** All mojibake (Latin-1 stored as UTF-8) repaired — `Configuración`, `Método de pago`, `sesión`, `Guardando…`, `Creando…`, `Buscar por nombre…`, etc.

---

## Next Steps (in order, confirm with Nicolas before starting each)

1. **Supabase grants** — if live data isn't showing, run the 3-line grant block above.
2. **Trim therapist Sesiones view** — hide payment/confirm toggles + therapist filter when logged in as therapist.
3. **Phase 4: Seguimiento** — analytics: retention, sessions/therapist/month, no-show rate, pending payments. Uses `recharts`.
4. **Phase 5: Finanzas** — income/expense ledger from `facturas` table, monthly totals, filter by therapist/month/payment method, mark sessions paid.
5. **Twilio webhook** — `netlify/functions/twilio-webhook.js`: receive Twilio POST, parse body (sí/no/reprogramar), match `From` to `patients.telefono`, write to `whatsapp_messages`, update session estado if applicable, respond with empty TwiML.
6. **Google Calendar (future)** — Step B: FreeBusy read. Step C: event write-back + `google_event_id`. Consider per-therapist OAuth-on-login over shared-calendar approach.

---

## Logo / Asset Delivery Pattern

Google Drive files download as base64 JSON to Mac temp `/var/folders/...`. Bash sandbox can't reach that path. Pattern:
```bash
python3 -c "
import json, base64, os
src = '/var/folders/3g/.../tool-results/mcp-XXXX-download_file_content-TIMESTAMP.txt'
dest = os.path.expanduser('~/my-site/public/logos/FILENAME.png')
d = json.load(open(src))
open(dest, 'wb').write(base64.b64decode(d['content']))
print('Done:', d['title'])
"
```
Run in Terminal (not Claude Code), then `git add public/logos && git commit && git push`.

---

## Drive File IDs (brand assets)

| File | Drive ID | Size |
|------|----------|------|
| ISOTIPO.png (black, transparent bg) | in LOGOTIPOS folder | — |
| B�KTIPOFONDO1.png | 1WFhuXe2d9NbOUQDldXKnwbBshQ7gypc9 | 460 KB |
| ISOTIPOFONDO2.png | 1iU2GmDTCQYdCVdLeJhDtV0eQgAUBSV4Y | 1.5 MB |
| ISOTIPOEFIMERAMENTE.png ✅ (current PWA icon) | 16K1UqHjY7dX59r8LKj-lVD1ghhxLrpKu | 451 KB |
| LOGOTIPOCORTO.png | in LOGOTIPOS folder | — |
| LOGOTIPOLARGO.png | in LOGOTIPOS folder | — |
| LOGOTIPOCORTOFONDO1.png | in FONDO1 folder | — |
| LOGOTIPOCORTOFONDO2.png | in FONDO2 folder | — |
| Brand manual PDF | EFIMERAMENTE-MANUALDEMARCA-BLNK2025.pdf | in Drive | — |
