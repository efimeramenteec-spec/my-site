# Design Flaws — To-Do (2026-07-27)

Working list of newly detected design flaws to fix. Architecture phase is complete;
these are polish/correctness fixes. **Capture phase — not yet executing.**

---

## 1. Llamadas should be born CONFIRMADA (not Pendiente)

**Rule (Nicolas):** A 10-min llamada is a low-commitment, one-time cold call — we're not
waiting for the patient to confirm it, we're the ones calling them. So a llamada's estado
is **`confirmada` from the moment it's scheduled, through any outcome** (even an unanswered
call = a non-converted lead, but the session stays `confirmada`). Individual / Pareja / etc.
sessions keep the current behavior: born `programada` (Pendiente).

**⚠️ Overrides the "Born Pendiente" invariant** (commit 8d813e9) — which currently forces
EVERY new session to `programada` with a hard override. This adds a `tipo === 'llamada'`
exception.

**Code paths to change:**
- [ ] `queries.js#createSession` — carve out: `tipo === 'llamada'` → `confirmada`, else keep the forced `programada`.
- [ ] `netlify/functions/public-booking.mjs` — the `/agendar` (kind=`llamada`) flow hardcodes `programada`; make llamadas `confirmada`.
- [ ] Consider whether the DB default stays `programada` (yes — only llamadas differ, handled in app).

**Verify (no expected ripple, but confirm):**
- Marketing "Llamadas sin sesión" follow-up list doesn't filter by estado.
- Reminders already exclude llamadas (`.neq tipo 'llamada'`) — no reminder concern.
- Money metrics (`Finanzas.isReal`, `Marketing.isRealSession`) already exclude llamadas.
- Adherence already excludes llamadas.
- pago/factura toggles already locked off for llamadas.
- Cancelled-rule guard still applies (a llamada can still be cancelled).

---

## 2. "Descargar reporte" button in Sesiones → Lista (nice-to-have, payroll) — ✅ BUILT 2026-08-03

**Shipped (not yet pushed):** Lista now has **Desde/Hasta** date filters + a **Descargar
reporte** button that exports the currently-filtered rows to a branded PDF. Decisions locked:
date range as Lista filters · totals show **Monto a pagar** = confirmadas × `provision_rate`
($24, Mariana $0) · **llamadas excluded**. Pay counts only confirmada/completada rows so it's
correct even if not filtered to Confirmada. Files: `src/lib/sessionReport.js` (new, jsPDF +
autotable lazy-loaded), `src/pages/Sesiones.jsx` (filters + button), `queries.js`
(provision_rate added to getSessionsData therapists), `icons.jsx` (IconDownload).
Verified headless: totals + Mariana-$0 + llamada-exclusion + empty-guard all correct; build green.
**USAGE NOTE for Nicolas:** filter Estado = Confirmada for a clean payroll report (the count
line then matches the pay line exactly).

<details><summary>original spec</summary>

**Goal (Nicolas):** A download button in the Lista view that exports the **currently
filtered** list as a **PDF**, so he can e.g. filter Carolina + estado `confirmada` + a
period, download, and send it to her to verify her session count / that she's paid
correctly. Must show a total at the bottom: "TOTAL DE SESIONES CONFIRMADAS: 57".

**Doable:** Yes, client-side, no backend. Recommend **jsPDF + jspdf-autotable** for a true
one-click download with a controlled layout (vs. a print stylesheet, which is dependency-free
but a 2-step "print → save as PDF"). Small dependency; fits the batch-commit budget rule.

**⚠️ Gap to close first — Lista has NO date filter.** Current Lista filters are only
Terapeuta / Estado / Estado de pago (`Sesiones.jsx:40`, continuous future→past list). A
payroll report needs a **period**. Add a **Desde / Hasta** range — recommend adding it as a
Lista filter (not just an export dialog) so the on-screen list matches the report exactly:
*what you see is what you export.*

**Improvements on the idea:**
- **Respect ALL active filters** in the export (terapeuta, estado, pago, + new date range) —
  "what you see is what you export."
- **Report header:** Efimeramente logo/branding + generation date + an explicit scope line so
  the recipient knows exactly what's included, e.g. "Terapeuta: Carolina Almeida · Estado:
  Confirmada · Periodo: 1–31 jul 2026 · Pagos: Todos".
- **Table columns:** Fecha, Hora, Paciente, Tipo, Modalidad, Estado, Monto (+ a Pagado column
  when the pago filter is "Todos").
- **Totals footer:** the session count line Nicolas asked for, PLUS total $ monto. Because the
  real purpose is verifying pay, optionally add a **provisión** line (n × `therapists.provision_rate`,
  the exact figure Finanzas already computes). ⚠️ DECISION for Nicolas: is exposing the
  per-session rate to the therapist OK? If not, omit and keep count + monto only.
- **Exclude llamadas** from payroll reports (free intro calls, never paid) — or at least don't
  count them toward the total. DECISION for Nicolas.
- **Filename:** `Efimeramente-Sesiones-{Terapeuta}-{periodo}.pdf`.
- Optional: also offer **CSV** for their own spreadsheet, same filtered data.

**Open decisions for Nicolas:** (a) date range as a Lista filter vs. export-only dialog;
(b) include provisión/pay amount or count+monto only; (c) exclude llamadas from the report.
</details>

<!-- Add flaw #3, #4, ... below as Nicolas reports them -->
