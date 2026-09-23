# Efimeramente — Changelog (archive)

Completed work, 2026-09-14 and earlier. Split out of `EFIMERAMENTE_STATE.md` on 2026-09-22
(and trimmed on demand) to keep session startup cheap. **Not loaded automatically — read on demand.**

Newest first.

- [x] **WhatsApp Coexistence — inbound Cloud API webhook (payment-proof reading), Phase 1**
  (2026-09-15, Opus 4.8, commit `90080e1`, deployed + VERIFIED LIVE). Goal: collapse the practice's
  **two** WhatsApp numbers into **one** and auto-read patient bank-transfer screenshots. The central
  *chatting* number now runs the WhatsApp Business app **and** the Cloud API together via **Meta
  Coexistence**, connected through **Dualhook** (a Meta-approved BSP, ~$12/mo, 14-day trial active;
  card on file, auto-bills 2026-09-30). Inbound messages flow **Meta → Dualhook webhook override →
  our function** (Dualhook never sees message content). Live connection: WABA `1857507018469524`
  ("Efímeramente Psicología"), **Phone Number ID `915558374975708`**.
  - **Shipped:** `netlify/functions/whatsapp-cloud-webhook.mjs`. GET = Meta verification handshake
    (env **`WA_CLOUD_VERIFY_TOKEN`**, set in Netlify). POST = logs each inbound message to
    **`whatsapp_messages`** (`direccion='inbound'`, `cuerpo`=summary, `twilio_sid`=WA message id
    [unique → idempotent upsert so Meta retries don't duplicate], `raw_payload` jsonb keeps the
    **media id** for later download), matching sender→patient with the **same last-9-digit logic as
    `twilio-webhook.mjs`** (reuses `getSupabaseAdmin`/`normalizePhone` from `netlify/lib/whatsapp.mjs`).
    **Additive + read-only: never sends, never touches sessions/`pagado`.** Verified live: handshake
    (correct token echoes challenge, wrong → 403); a synthetic image POST matched patient Rocío;
    then the real connection's 6-month history sync landed real proofs matched to real patients.
  - **Security:** `whatsapp_messages` RLS confirmed **owner-only** (`whatsapp_owner` = `is_owner()`),
    so anon + therapist logins get 0 rows. Optional signature check via **`WA_CLOUD_APP_SECRET`** is
    **OFF** on purpose — unclear whether Meta signs with our app secret or Dualhook's in an override
    setup, and a wrong secret would silently break the live flow; residual risk low (owner-only +
    human-confirm). Code already supports it once the correct secret is confirmed.
  - **Why Dualhook, not DIY:** Meta gates coexistence embedded signup behind Tech-Provider status +
    App Review (hit the "no puede registrar clientes" wall). We *did* become a tech provider
    (irreversible) but were still walled; Dualhook is already approved. **Twilio does NOT support
    coexistence** (migration only — would remove the number from the app).
  - **✅ Reading layer SHIPPED (2026-09-15, Opus 4.8) — the Comprobantes page (owner-only).** New
    owner route `/comprobantes` + nav item (IconChat). `getPaymentProofsData()` in `queries.js` reads
    the recent inbound image/document rows straight from `whatsapp_messages` (owner-only RLS — no
    function needed for listing), windowed to **proofs SENT in the last 7 days** using the message's
    own `raw_payload.message.timestamp` (NOT `received_at` — the 6-month history sync ingested
    everything at connect time, so received_at is ~now for old rows; received_at ≥ send-time makes it
    a safe superset prefilter). Each matched proof shows the patient + their **unpaid sessions**
    (exact Finanzas Deudores predicate: `!pagado && estado='confirmada' && !llamada && fecha<hoy`);
    the owner **checks which session(s) the payment covers** (multi-select handles the advance-pay
    case: 1 proof → N sessions), picks método, one-tap **Marcar pagado** → `confirmProofPayment()`
    calls the existing `updateSession({pagado,metodo_pago})` rules (server-stamps `paid_at`, refuses
    cancelled), then stamps the proof **reconciled** so the **same comprobante can never be applied
    twice** (Nicolás's dedupe requirement). Nothing auto-marks — trust-based, human-confirm each one.
  - **Media download:** owner-gated function `netlify/functions/wa-proof-media.mjs` (verifies the
    Supabase token → role `owner`, mirrors the RLS) holds the Dualhook secret and does the two-hop
    fetch (`GET https://api.dualhook.com/v25.0/{media-id}` Bearer `WA_DUALHOOK_API_KEY` → `{url}` →
    GET bytes) and streams the image back. Browser fetches it with the access token → object URL;
    **lazy-loaded via IntersectionObserver** so the first-open backlog doesn't fire dozens of
    downloads at once. Images served `Cache-Control: private, no-store`. **⚠️ Requires Netlify env
    `WA_DUALHOOK_API_KEY` (the `dh_live_…` key) — set it or proof images show "no se pudo cargar";
    the page + mark-paid still work without it (those use the browser Supabase client).**
  - **Unmatched rows** (`patient_id` null — phone didn't match a patient): a distinct "Requieren
    atención — sin paciente" section shows the sender's phone + WhatsApp profile name so the owner can
    identify them (and save the número in the patient's ficha so future proofs auto-match), then
    **Descartar** (`dismissProof` → reconciled with no sessions) — never a silent drop.
  - **DB:** migration `whatsapp_messages_reconcile` (mirrored `supabase/whatsapp-messages-reconcile.sql`)
    added `reconciled_at` / `reconciled_by` / `reconciled_session_ids` (all nullable, additive) +
    a partial index on pending proofs. Table RLS unchanged (owner-only, `is_owner()` FOR ALL covers
    the owner's UPDATE). Verified against live data: 62 proofs sent in the last 7 days, 10 proof-sender
    patients currently carry unpaid sessions.
  - **✅ OCR extraction rebuild (2026-09-16, Opus 4.8, Nicolás's call).** The page no longer embeds
    the raw screenshot (too heavy). Each inbound proof is READ by a vision model into structured
    fields; the card shows DATA (amount, transfer date, método auto-detected from the destination
    account) with details under "ver detalles" and the image only on-demand via "ver original".
    - **Model:** Claude **Opus 4.8 via APIMart** (`https://api.apimart.ai/v1/chat/completions`,
      OpenAI-compatible, key `APIMART_API_KEY`). Chosen over Anthropic-direct so Nicolás reuses his
      existing APIMart key (no second billing signup); APIMart routes Opus 4.8 through AWS Bedrock.
      ⚠️ **Must send `stream: false`** (APIMart defaults to SSE). Verified live: a synthetic receipt
      returned clean JSON (amount/bank/status/transfer_id). ~$0.01–0.03/proof; low volume.
    - **Function:** `netlify/functions/extract-proof.mjs` (owner-gated, mirrors `wa-proof-media`
      auth). Downloads media via shared `netlify/lib/waMedia.mjs` (Dualhook two-hop, refactored out
      of `wa-proof-media`), sends to APIMart, parses (tolerates ```json fences), stores on the row.
      Caches by `extraction_status` so it never re-OCRs (no double credit burn); PDFs → `needs_review`
      (manual). Extraction runs **lazily on scroll** (IntersectionObserver) so the first-open batch
      doesn't fire dozens of reads. `queries.js#extractProof` is the client trigger.
    - **Fields extracted:** is_payment_proof, transfer_date, transfer_time (nullable — many banks
      omit), amount, origin_bank, sender_name, destination (→ método), recipient_name (validated vs
      Mariana), transfer_id, status, bank_description, confidence. Prominent **flags**: low confidence,
      amount≠selected sessions, recipient not Mariana. **Graceful fallback:** if OCR fails (e.g.
      APIMart balance empty) the proof still shows with a "no pude leer — reintentar / ver original"
      state and the manual mark-paid controls, plus a page banner — an empty balance degrades, never
      breaks. **Mark-paid flow unchanged** (multi-select sessions + método + confirm → reconcile).
    - **DB:** migration `whatsapp_messages_extraction` (mirror `supabase/whatsapp-messages-extraction.sql`)
      added `extracted` jsonb + `extraction_status` text (additive, nullable; RLS unchanged).
    - **✅ LIVE (2026-09-16):** Netlify env **`APIMART_API_KEY`** set + redeployed (deploy `6aaab623…`,
      `extract-proof` + `wa-proof-media` functions live, secret scan clean). Auto-read is ON.
    - **✅ GO / CLEAN-SLATE done (2026-09-16):** Nicolás registered all outstanding payments manually,
      then Claude wiped the 6-month backlog — **142 inbound messages archived** (`reconciled_at` stamped),
      **0 pending proofs**. System is now LIVE end-to-end in **human-confirm** mode: new proofs from that
      moment appear, auto-read on view, Nicolás taps **Marcar pagado**. (Wipe = archive only; never
      touched a session/`pagado`. Debtors/Deudores untouched — 9 proof-senders still legitimately owe.)
    - **⏳ NEXT (target 2026-09-17, after Nicolás validates the human-confirm flow) — AUTO-MARK + PUSH:**
      auto-register a payment when ALL green (is_payment_proof + high confidence + amount matches an
      unpaid session exactly + recipient Mariana + no flags), **always paying the OLDEST unpaid session**;
      anything short stays for a manual tap. Plus a **Web Push** on payment (*"Juan Pérez acaba de pagar
      su sesión del 11/09/26"*) reusing the existing push infra (`netlify/lib/push.mjs`, VAPID,
      `push_subscriptions`, `notify-estado.mjs` pattern). Likely a trial/undo phase first. Note: the
      Comprobantes page is fetch-on-open (capture is real-time via the webhook; UI updates on refresh) —
      optional Supabase Realtime is a nice-to-have. Spec in memory `payment-proof-automation-goal`.
    - **Design decisions in memory:** `comprobantes-extraction-schema` + `payment-proof-automation-goal`.
  - Full blow-by-blow (how we got here, all IDs, every dead end) is in Claude memory:
    `whatsapp-coexistence-consolidation.md`.

- [x] **UX polish batch — therapist patient edits + booking link preview + LEADS system**
  (2026-09-14, Opus 4.8, commit `99d2087`, pushed to `main`, deploy VERIFIED LIVE). Three
  changes, one push. Nicolas confirmed we're in UX-polish mode now (architecture done).
  - **Therapists can edit EVERY field of their own patients** (`Pacientes.jsx`). Before they
    could only edit estado + frecuencia; now the full Configuración form is open to them
    (tipo, names, teléfono, email, cédula, tarifa, método de pago). **Reassign (Terapeuta
    dropdown) + delete stay owner-only** (Nicolas's call — reassigning would hand the patient
    away, and the RLS WITH CHECK rejects it anyway). The read-only "Contacto" block for
    therapists was removed (they edit contact directly now). Create-patient drawer matched:
    therapists now set tarifa/método on create too (auto-assigned to self; Terapeuta picker
    still owner-only). **No DB change** — RLS `patients_therapist_update` already allowed
    updating any column of their own patient (verified live in pg_policies). It was purely a
    UI gate.
  - **Public booking link preview fixed** — pasting `/agendar` (or a per-therapist link) in
    WhatsApp used to show the internal title "Efimeramente — Panel de Control" (confusing +
    leaks that the booking page and admin app are the same backend). Now `/agendar` and
    `/reservar` serve a dedicated **`agendar.html`** shell whose OG/title = **"Conoce a tu
    terapeuta"** (warm description + logo preview image; no PWA/manifest/panel hints). It's a
    **2nd Vite build entry** (`vite.config.js` rollupOptions.input: main + agendar; shares
    `/src/main.jsx` so the JS bundle is emitted ONCE — only the `<head>` differs) + **4
    netlify.toml rewrites** placed BEFORE the `/*` SPA fallback (`/agendar`, `/agendar/*`,
    `/reservar`, `/reservar/*` → `/agendar.html`, status 200). React Router still renders the
    right flow by path. `dist/agendar.html` added to `.gitignore` (build output). Verified live:
    `/agendar` title = "Conoce a tu terapeuta", `/` still "Panel de Control". NOTE: WhatsApp
    caches previews per-URL — an already-shared link needs `?v=2` or the FB Sharing Debugger to
    re-scrape. Domain still reads `efimeramente-panel.netlify.app` (Nicolas: fine, "panel" isn't
    indicative); a custom domain (e.g. `citas.efimeramente.ec`) would fully sever it — deferred.
  - **LEADS vs PATIENTS** — someone who books a free llamada via `/agendar` used to be created
    as a full patient, bloating the list even when the call never converted. Now they're a
    **LEAD** until they convert. Implementation = a person-level flag **`patients.es_lead`**
    (boolean default false; migration `patient_es_lead`, mirrored `supabase/patient-es-lead.sql`,
    applied to prod). Sessions are untouched (es_lead is just a flag), so all calendar/reminder/
    phone-matching plumbing keeps working. Added to `PATIENT_SELECT`/`PATIENT_COLUMNS` +
    the `getSessionsData` patient select.
    - **Becomes a lead:** `public-booking.mjs` sets `es_lead=true` when a NEW person books a
      `kind=llamada`. `/reservar` (kind=sesion) creates a real patient (es_lead=false).
    - **Auto-promoted to patient (es_lead→false):** on their **first real (non-llamada)
      session** (`queries.js#createSession`; also `/reservar` promotes an existing lead), OR
      when a llamada is toggled **"Convirtió"** (`queries.js#updateSession`, `convirtio=true`).
      All promotion updates are guarded `.eq('es_lead',true)` (no-op for real patients) and
      RLS-safe (they don't touch terapeuta_id).
    - **UI:** `Pacientes.jsx` got a **"Pacientes / Leads" segmented tab** (Pacientes = es_lead
      false, Leads = es_lead true, with counts). `SesionDrawer.jsx` got a **"¿Es primera
      sesión?"** checkbox above the patient picker (create mode only): ON → the picker lists the
      therapist's unconverted **leads** instead of patients (label/placeholder switch to "Lead"),
      so a converting lead is scheduled without re-registering; inline "Crear paciente nuevo"
      flips the toggle off (a walk-in is a patient, not a lead). `PatientSelect.jsx` gained
      `label`/`placeholder` props.
    - **Excluded from Seguimiento** (`tracked` now filters `!p.es_lead` — leads aren't in
      therapy). **Marketing intentionally still sees everyone** — its "nuevos pacientes" already
      requires ≥1 real session (`if (!real.length) continue`), so leads never counted anyway and
      the funnel is now MORE accurate.
    - **Backfill:** 25 existing call-only / never-converted / no-real-session patients flagged
      es_lead=true (people with zero sessions stayed patients — they were created directly, not
      from a call). Prod now ~228 patients / ~24 leads (one lead deleted in-app between the count
      and the backfill; harmless drift).
    - **CORRECTION to old note:** a llamada is born **"no convirtió"** and flips to "convirtió"
      manually OR when a future real session is detected (`src/lib/conversion.js`) — NOT the
      "born confirmada" idea in the design-flaws backlog. The es_lead promotion piggybacks on
      that same conversion concept.
  - **Follow-up (same day, commit `3a0f284`): move a person between Pacientes ↔ Leads.** A
    "Mover a Leads" / "Mover a Pacientes" button in the patient detail panel flips `es_lead` in
    BOTH directions (fixes a mistaken/accidental conversion either way — there was no reverse
    path before). Available to whoever can edit the patient (therapist for own, owner for all;
    RLS-safe — it doesn't touch terapeuta_id). Confirms first, and warns before demoting a
    person who actually has real sessions.

- [x] **Second batch — 5 changes** (2026-09-04, Opus). Built simplest→complex, one push.
  Ideas in `IDEAS-BACKLOG.md`. (Between batches: onboarded therapist **Sophia Vergara**
  — therapist row [turquoise `#14B8A6`, $24], calendar sync, auth user + profile created
  directly via SQL, availability; and seeded 6 package anchors from the expediente backup.)
  What shipped:
  - **Remove "Fuente" field** (option A). Attribution is automatic, so the manual source
    field was obsolete — removed from Pacientes forms + `FUENTE_PACIENTE` + `PATIENT_SELECT`/
    `COLUMNS` + Marketing select. Accepted tradeoff: `marketing.js` no longer excludes
    `fuente==='referido'` patients, so referrals now count in campaign attribution. DB column
    `patients.fuente` left **dormant** (not dropped — avoids the stale-bundle demo fallback).
  - **⭐ star → anchor-session-only.** Was a patient-level "buys packages" badge; now a
    per-session marker shown ONLY on the anchor row (`s.package_anchor`) in Sesiones → Lista.
    Removed the patient-level stars in Pacientes list + detail. `packages.js#hasPackage` now unused.
  - **Therapist picker in the inline "Nuevo paciente" form** (`SesionDrawer.jsx`, owner-only).
    Was silently assigning the new patient to the session's default therapist (first = Camila);
    now an explicit dropdown (pre-filled with the session's therapist, "Selecciona…" +
    validation). Therapists still auto-assign to self.
  - **Marketing "Nuevos pacientes" KPI** (reworked same day per Nicolas, 2026-09-05). Top
    headline card = new patients acquired in a **selectable month** (◀ ▶ month navigator,
    defaults to current). **Attribution = the month they CONVERTED**: the month of their first
    non-cancelled **llamada** if they had one, else their first real session's month (walk-in).
    So a Nov call → Dec first session is credited to **Nov**. Click expands the list of those
    patients; each shows **"Llamada: <fecha>"** or **"Entró sin llamada"** (number and list now
    match — replaced the first cut that showed the month's llamadas, which mismatched the count).
    Logic inline in `Marketing.jsx` (uses `groupSessionsByPatient`). Sept: 14→8 under the new
    rule (6 had earlier-month calls). (`convirtio` was added to the Marketing sessions select in
    the first cut; now unused there but left in.)
  - **Presencial 3-consultorio cap.** Only 3 physical offices → block a new PRESENCIAL session
    if 3 non-cancelled presencial sessions (ALL therapists) already overlap its window. Helper
    `roomsFull`/`presencialOverlapCount`/`CONSULTORIOS` in `conflicts.js`; enforced live in
    `SesionDrawer` (rose warning + disabled submit) and as the `Sesiones.jsx#handleSubmit`
    backstop. En línea/llamada don't count; edited session excluded. (UPDATE 2026-09-17: now
    ALSO enforced in public `/reservar` AND by a DB trigger — see the 2026-09-17 entry at top.)
  - **Verified:** `npm run build` green; helpers node-unit-checked (rooms 8/8). No DB migrations
    this batch (`fuente`/`notas` columns dormant).
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


- [x] **Next module: SEGUIMIENTO** — DONE 2026-07-04 (see state-file Completed Features; scope was
  redefined by Nicolas to patient adherence — the old retention/no-show sketch is obsolete).
- [x] **Set frecuencia per patient** — bulk-set ALL 154 to `semanal` 2026-07-04 per Nicolas (one SQL
  UPDATE). REMAINING for Nicolas: flip the few quincenal patients manually in Pacientes →
  Configuración as he identifies them.
- [x] **Facturada backfill** — DONE 2026-07-04 night: Nicolas chose cutoff June 15. One UPDATE marked
  every PAID non-cancelled session with fecha < 2026-06-15 as facturada (June 15 itself left as-is —
  conservative reading, flagged to him). Result: 333 facturadas, 88 pendientes (oldest 2026-06-15).
  Unpaid old sessions deliberately NOT marked — factura follows payment.
