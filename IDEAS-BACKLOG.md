# Efimeramente — Ideas Backlog

> Raw brainstorm space. Ideas captured as Nicolas thinks of them — NOT yet
> spec'd, prioritized, or committed to. Triage/estimate later. The shipped-work
> log lives in `EFIMERAMENTE_STATE.md`; architecture in `CLAUDE.md`.

Legend: 💡 idea captured · 🔎 needs clarification · 🛠️ ready to spec · ✅ shipped

---

## ▶️ BUILD ORDER — ALL BUILT 2026-08-31 (awaiting one push + live-check)

All six built simplest→complex in one session; single push pending Nicolas's
live-check. DB migrations already applied to prod (additive/safe). Details in
the EFIMERAMENTE_STATE.md session entry.

1. ✅ **C1 — Remove Expediente field** — dropped from UI + data layer AND the DB
   column `patients.notas` dropped (`drop-patients-notas.sql`). The 10 existing
   notes were backed up to `~/Downloads/EFIMERAMENTE-expediente-notas-respaldo.md`.
2. ✅ **C2 — Collapse patient states** → activo/inactivo. 44 `descontinuado`
   migrated to inactivo; CHECK tightened. (`migrate-descontinuado-to-inactivo.sql`)
3. ✅ **#2 — Payment method on pay** — pago toggle → compact Sin pagar/PayPal/
   Transferencia/PayPhone select in Lista; writes `metodo_pago`.
4. ✅ **#3 — Llamada Convirtió/No Convirtió toggle** — `sessions.convirtio`
   override + live derivation (`src/lib/conversion.js`). No cron.
   (`sessions-convirtio.sql`)
5. ✅ **#1 — Patient type** (Individual/Pareja/Menor) + two-person naming/search.
   `patients.tipo_paciente/nombre_2/apellido_2`; `patientLabel`/`patientSearchText`
   in format.js. (`patient-type-second-person.sql`)
6. ✅ **#4 — 4-session packages** — `sessions.package_anchor` flag; auto-prepaid
   default at scheduling + ⭐ star; owner marks the anchor in the session drawer
   (edit). Logic in `src/lib/packages.js`. (`sessions-package-anchor.sql`)

---

## ✅ SHIPPED 2026-09-04 — second batch (5 changes)

Built simplest→complex, one push. Details in the EFIMERAMENTE_STATE.md entry.
1. ✅ Remove Fuente field (option A) — gone from app; DB column left dormant.
2. ✅ ⭐ star → anchor-session-only (session-level in Lista; patient stars removed).
3. ✅ Therapist picker in the inline "Nuevo paciente" form (owner-only).
4. ✅ Marketing "Nuevos pacientes este mes" KPI + expandable llamadas w/ conversion.
5. ✅ Presencial 3-consultorio cap (block 4th overlapping presencial).
Still open: T1, T2 (Twilio) + `/reservar` room-cap (not enforced server-side yet).

---

## Pending change — ⭐ star: patient-level → anchor-session-level (2026-09-02)

**Change the meaning of the package ⭐.** Right now it's a *patient-level* badge
(shows next to a patient's name anywhere they appear if they've EVER bought a
pack — driven by `hasPackage(patientSessions)` / `package_anchor` on any of their
sessions). Nicolas now wants it to be a *session-level* marker: the ⭐ should
appear **only on the FIRST session of a package** (the anchor row) to flag
"this is session 1 of a 4-pack."

To build:
- **Sesiones → Lista** (`views.jsx`): drive the star off `s.package_anchor` for
  that specific row (not `hasPackage(...)`). Only the anchor session shows ⭐.
  The current `PackageStar` uses `sessionsByPatient` + `hasPackage` — replace
  with a simple `s.package_anchor` check per row.
- **Remove the patient-level stars** added in #4: Pacientes list rows
  (`PatientRow` `hasPackage` prop + `packagePatientIds` set) and the PatientDetail
  header (`patientHasPackage(sessions)`), since the star is no longer "this
  patient buys packages."
- Keep the `hasPackage`/`packages.js` helper around only if still used elsewhere;
  otherwise it can go. The auto-prepaid logic (`remainingPackSlots`) is unaffected.

## Pending change — therapist picker in the inline "Nuevo paciente" form (2026-09-02)

When creating a patient from **Nueva sesión → "Crear paciente nuevo"** (the inline
mini-form in `SesionDrawer.jsx`), the new patient is silently assigned to the
session's currently-selected therapist, which defaults to the first in the list
(**Camila Maya**). Nicolas wants an explicit **therapist dropdown** in that
mini-form to choose who the patient belongs to.

To build:
- Add a therapist **Select** to the inline "Nuevo paciente" form in
  `SesionDrawer.jsx` (owner sees all therapists; ideally a "Selecciona…"
  placeholder so it's a deliberate choice, not a silent Camila default).
- Wire it into `handleCreatePatient` — currently
  `assignTo = fullAccess ? form.terapeuta_id : terapeutaId`; for the owner, use
  the new dropdown value instead of `form.terapeuta_id`.
- Keep therapist users auto-assigned to themselves (RLS only lets them create
  their own patients) — so the dropdown is owner-only.
- Same default-Camila issue may exist in the full Pacientes create drawer
  (`CreatePatientDrawer`) — that one already HAS a Terapeuta select, so check it
  defaults sensibly (placeholder vs first therapist) while we're at it.

## Pending change — remove the "Fuente" field entirely (2026-09-02, option A)

Nicolas: attribution is automatic now, so the manual **Fuente** field on patients
is clutter. **Decision: remove it entirely (option A).** Accepted tradeoff,
flagged and confirmed: referred patients will no longer be excluded from
ad-campaign attribution (`marketing.js` used `fuente==='referido'` to skip them),
so campaign conversions/CPA will count referrals too — less accurate marketing
numbers, which Nicolas is OK with.

To build:
- **Pacientes.jsx**: remove the Fuente `Select` + `form.fuente` state +
  `patch.fuente` in the edit form; remove from the create drawer if present;
  drop the `FUENTE_PACIENTE` import.
- **constants.js**: remove `FUENTE_PACIENTE` (+ its comment).
- **queries.js**: drop `fuente` from `PATIENT_SELECT`, `PATIENT_COLUMNS`, and the
  Marketing patients select.
- **marketing.js:69**: remove the now-dead `if (p.fuente === 'referido') continue`
  (attribution will include everyone). This is the accepted behavior change.
- **DB**: optionally drop `patients.fuente` for tidiness (like we did with
  `notas`); or leave the column dormant.

## Pending change — Marketing: "Nuevos pacientes este mes" as the top KPI (2026-09-04)

Make the **first thing** in the Marketing module a headline KPI:
**"NUEVOS PACIENTES ESTE MES: X"**. Clicking it **expands the full list of this
month's llamadas**, each showing whether it **Convirtió / No convirtió** — so
Nicolas can see at a glance which intro calls turned into patients and which
didn't.

To build:
- **Marketing.jsx**: add the KPI at the top (X = new patients this calendar
  month — reuse the module's existing "new patient" definition: first real
  session this month), click-to-expand like the Finanzas Deudores / Seguimiento
  riesgo pattern (KpiCard `onClick`/`active`).
- Expanded list = this month's `tipo==='llamada'` sessions with conversion
  status via `llamadaConverted` (`src/lib/conversion.js`) — name, date,
  Convirtió/No convirtió. Ties into #3.

## Pending change — cap presencial sessions at 3 per time window (3 consultorios) (2026-09-04)

The practice only has **3 physical offices (consultorios)**. Block scheduling a
new **presencial** session if there are **already 3 presencial sessions**
(across ALL therapists) overlapping that time window — otherwise a 4th in-person
booking has nowhere to happen. En línea sessions don't count (no room needed).

To build:
- Add a capacity check (e.g. in `conflicts.js`): for a candidate PRESENCIAL
  session, count non-cancelled `modalidad==='presencial'` sessions (all
  therapists) whose time range overlaps; if ≥ 3, block. Exclude the session
  being edited; ignore cancelled/no_show; llamadas are en_linea so they don't
  count.
- Enforce in the in-app scheduler (`SesionDrawer.jsx` guard + `Sesiones.jsx`
  `handleSubmit` backstop) with a clear message ("No hay consultorio disponible:
  ya hay 3 sesiones presenciales en ese horario").
- CONSIDER: the public `/reservar` presencial flow (`public-booking.mjs`) should
  probably honor the same 3-room cap when generating/validating slots — flag for
  decision (more complex; server-side slot math).

## Post-app / Twilio (do AFTER the app feature batch)

### T1. 🔔 Auto-reply on the WhatsApp sender number ("this number doesn't receive messages")
The Twilio sender number is send-only. Add a fallback auto-reply so anyone who
messages it gets told it doesn't receive messages (and where to actually reach
the practice). Handled in `twilio-webhook.mjs` inbound path (currently it only
matches Confirmo/Cancelar quick replies and otherwise returns empty TwiML).

### T2. 🕐 24h reminder should state the appointment TIME
The ~24h WhatsApp reminder should include the appointment's time (a client
suggested it; Nicolas agrees; should be easy). Touch: the Twilio Content
template variable(s) + `send-reminders.mjs` / `netlify/lib/whatsapp.mjs` where
the template vars are filled. NOTE: the approved Content template may need a new
variable `{{2}}` for the time → may require editing/re-approving the template in
Twilio, not just code.

---

## Cleanup / Removals (decided — just not done yet)

### C1. 🗑️ Remove the "Expediente" field entirely
This is a vibe-coded app; security is not guaranteed for now, so it should NOT
hold personal/clinical information. Remove the `expediente` field from the
patient record (UI + stop persisting it). Decision by Nicolas — no PII in the
app at this stage.
- Touch points to check when spec'd: `patients.expediente` column, PatientDetail
  panel, create-patient drawer, `PATIENT_COLUMNS` whitelist, demo data.

### C2. 🗑️ Collapse patient states — drop "Descontinuado"
The distinction between **Inactivo** and **Descontinuado** is not clear and is
redundant. Plan:
1. Migrate all `descontinuado` patients → `inactivo`.
2. Then remove the `descontinuado` state entirely (leaves: **activo** |
   **inactivo**).
- Touch points: `patients.estado_general` CHECK constraint, `constants.js`
  (ESTADO_PACIENTE labels/filters), Pacientes filters, Seguimiento (already
  excludes non-activo), demo data.

---

## 1. 💡 Patient type at registration (Individual / Pareja / Menor de Edad)

**Problem it solves:** persistent confusion identifying WHO a patient record is
about when more than one person is involved. Today a patient is a single
name; couples and minors involve a second person that the system doesn't
model, so records get ambiguous.

**Idea:** when registering a new patient, require a **patient type**:
- **Individual** — one person (today's behavior).
- **Pareja** — two people. Two fields: **Persona 1** and **Persona 2**.
- **Menor de Edad** — two people with roles. Two fields: **Tutor** and
  **Paciente** (the minor).

**Display / naming convention** (so search finds either person):
- Pareja → `Juan Perez + María Gonzalez`
- Menor de Edad → `Juan Perez (Tutor) + Miguel Alvarez (Menor)`

Searching for ANY of the names should surface the record.

**Open questions (for later, not now):**
- How does this map to the existing single `nombre`/`apellido` columns? New
  columns for the second person + a `tipo_paciente` field, with the composite
  display name derived?
- Does patient type relate to session `tipo` (individual/pareja/…) or are they
  independent? (A "Pareja" patient presumably always has pareja sessions.)
- Contact fields (telefono/email) — whose? Tutor's for a minor, presumably.
- Migration for the 150+ existing patients (default all to Individual).

## 2. 💡 Capture payment METHOD when marking a session paid

**What:** when a session is marked paid in Sesiones, also record HOW it was
paid. Exactly three methods: **PayPal · Transferencia · Payphone**.

**Already half-built:** `sessions.metodo_pago` already exists (default
`transferencia`) — it's just not surfaced/chosen at pay time. So this is mostly
a UX + a constants update (the current payment-method enum must be reconciled to
these 3 values). Would also want it in the Finanzas breakdowns eventually
(revenue by method).

**UX options (Nicolas unsure — pick later):**
- **Option A — segmented picker appears on pay.** Flipping the pago toggle ON
  reveals 3 pill buttons (PayPal / Transferencia / Payphone) inline in the row;
  pick one to confirm. Toggling off clears it. Pretty, one tap, no modal.
- **Option B — pago toggle becomes a small dropdown.** Instead of on/off, the
  control is "Sin pagar ▾ / PayPal / Transferencia / Payphone". Choosing a
  method = paid; "Sin pagar" = unpaid. Fewer controls, method always visible.
- **Option C — quick modal on pay.** Toggle ON opens a tiny 3-choice sheet.
  Cleanest rows, but an extra click every time (probably too heavy).
- Leaning A or B. B is more compact and keeps the method visible at a glance in
  the list; A keeps the familiar toggle. Default method could prefill from the
  patient's `metodo_pago`.

**Open questions:**
- Backfill existing paid sessions? (They already have `metodo_pago` defaulted to
  transferencia — may be wrong for old PayPal/Payphone payments; leave as-is?)
- Show method as a little badge/icon on each paid row in Lista.

## 3. 💡 "Llamada" gets a Convirtió / No Convirtió toggle (not estado)

**What:** llamadas (free 10-min intro calls) are never "confirmed," so the
Confirmada / Pendiente / Cancelada toggle makes no sense for them. Replace it,
for `tipo==='llamada'` rows only, with a **Convirtió / No Convirtió** toggle:
- **No Convirtió** = default state, RED.
- **Convirtió** = GREEN.
- Available to the **therapist** to set manually too (not owner-only).

**Auto-detection of conversion:** a llamada counts as "Convirtió" if the same
person later has a **scheduled/real session** (any type — individual, pareja,
etc., NOT another llamada) dated AFTER the call.

**Recommendation on the "poll nightly at 10pm?" question:**
- Prefer **deriving it live** over a cron. On load, a llamada is "Convirtió" if
  the patient has any non-llamada, non-cancelled session with `fecha` > the
  llamada's date. No infrastructure, always up-to-date, can't drift, nothing to
  schedule. This is basically the same logic the Marketing module already uses
  for llamada→paciente conversion + "Llamadas sin sesión."
- Keep a **manual override** column (e.g. `convirtio` nullable boolean):
  `NULL` = auto-derive (live), `true`/`false` = therapist set it by hand and the
  override wins. Best of both — auto by default, manual when needed.
- If you still want a cron instead, 22:00 Ecuador is fine — but live derivation
  makes the cron unnecessary. My rec: skip the cron.

**Ties into:** Marketing funnel (this IS the conversion signal), and the
"Llamadas sin sesión" follow-up list.

**Open questions:**
- Does a manual "No Convirtió" override stick even if they later book? (Override
  wins until cleared, presumably.)
- Same-person matching = by patient_id (the llamada and the later session share
  the patient), so it's exact — good.

## 4. 💡 4-session packages → auto-mark prepaid + ⭐ package-customer marker

**The most complex one.** The practice sells **4-session packages** (prepaid).
Two things wanted:

**(a) Auto-prepaid scheduling.** When a patient buys a 4-pack, the system should
treat their **next 4 sessions as prepaid** — i.e. at scheduling time those
sessions default to `pagada = true` automatically, until the pack's 4 slots are
consumed.

**(b) ⭐ Package-customer star.** A small star icon next to the name of ANY
patient who has EVER historically bought a package — regardless of whether that
pack is finished. It's a lifetime "this is a package-buying customer" marker.

**Why it's tricky — MIDFLIGHT anchoring.** Several patients have ALREADY bought
packs and are partway through them. The system needs to know, per existing
package, **which session is the FIRST of the pack** (the anchor) so it can count
the 4 correctly from the right starting point. Without the anchor it can't tell
which future sessions are still covered.

**Rough model sketch (to decide later):**
- A `packages` table: `id`, `patient_id`, `purchased_at`, `size` (default 4),
  `anchor_session_id` OR `anchor_date` (first session of the pack), maybe
  `price`/`notes`.
- **Consumption:** a pack covers its anchor session + the next chronological
  non-cancelled, non-llamada sessions for that patient, up to `size` (4). Slots
  remaining = 4 − consumed.
- **Scheduling default:** when creating a session for a patient with an active
  pack (remaining > 0), prefill `pagado = true` (and ideally tag the session as
  package-covered so Finanzas/reports can tell prepaid apart).
- **Star:** patient has ≥1 `packages` row → ⭐. Trivial once the table exists.

**Midflight backfill — DECIDED (2026-08-31): build a tiny owner control** to
mark "this session starts a 4-pack." Nicolas doesn't remember offhand who paid
for packs; he'll review patients one-by-one IN-SYSTEM once the feature is live
and click to set each anchor. So NO pre-built list needed from him — the
anchor-marking UI IS the seeding mechanism.

**Open questions:**
- Do cancelled sessions consume a pack slot? (Assume NO — cancelled didn't
  happen, so it shouldn't burn a prepaid slot.)
- Do llamadas count? (Assume NO.)
- What about a partially-used pack where a session was already marked paid
  individually — reconcile or ignore?
- Multiple/renewed packs over time (buys another 4-pack after finishing one) —
  the model above handles it as a second `packages` row; consumption counts from
  each pack's own anchor.
- Should the prepaid default be overridable per session (e.g. therapist unticks
  it)? Presumably yes — it's a default, not a lock.
- Finanzas impact: prepaid package sessions are paid up front — does revenue
  recognition care about WHEN (purchase date vs session date)? Probably leave as
  paid-at-session for now, flag for later.
