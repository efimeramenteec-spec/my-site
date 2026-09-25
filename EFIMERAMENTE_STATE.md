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
- `netlify/functions/calendar.mjs` — serverless Google Calendar API bridge (actions: create, update, cancel, delete, freebusy)
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
- [x] **/facturar REWRITTEN against the Contífico REST API — Chrome automation DELETED** (2026-09-23, Opus 4.8).
  New engine `netlify/functions/facturar.mjs` (modern runtime, token-guarded). Modes: `recon`
  (GET-only), `dry-run` (default — builds full payloads, **zero Contífico calls**), `emit-one`,
  `emit-dummy`, `batch`. `.claude/commands/facturar.md` is now a thin API driver (browser protocol,
  Consumidor Final, Registrar Persona, `facturacion_manual`/NEVER-INVOICE list all removed).
  - **Emission (proven end-to-end):** `POST /documento/` → `PUT /documento/<id>/sri/` → mark
    `facturada=true` immediately (emitted-but-unmarked is flagged CRITICAL — the duplicate guard).
    Auth `Authorization: <CONTIFICO_API_KEY>` (raw, no Bearer). Payload essentials nailed against a
    real invoice + the docs: `electronico:true` (else cod_error 1005 wants a paper autorización);
    **`documento` sequential must be supplied** (cod_error 1002 — this account does NOT auto-assign),
    computed live as max on punto **001-001** + 1; producto `SESION INDIVIDUAL` = `O8bYEmDllFv68b7j`,
    IVA 0%, `ice`/`servicio` 0, estado **P**, **no `cobros`** (mirrors all 291 existing invoices).
  - **Verified** by a real **$1 dummy factura to Nicolás** (`001-001-000000291`, id `KVeZJG8noIwoGe8P`,
    firmado + 49-digit autorización + RIDE/XML). Nicolás confirmed it looks right. (Left on the books;
    anular later if desired.) ⚠️ Contífico strips accents in `referencia` but keeps them in `descripcion`
    (the insurance field), so descripcion is clean.
  - **descripcion (= Observaciones):** `Paciente {NOMBRE PACIENTE} | {CIE} {diagnóstico} | Sesión
    {fecha en texto}` (pipe format, per Nicolás). Billing party = **payer if `payer_id` set, else
    patient** (`billingIdentity()`), persona keyed by cédula/contifico_id; descripcion always names the
    patient (for a `menor`, the child).
  - **Eligibility:** `confirmada + pagado + NOT facturada + tipo<>llamada + facturacion_obligatoria +
    fecha >= FACTURAR_SINCE`. **NON-retroactive** — `FACTURAR_SINCE=2026-09-24` is a hard floor; the
    pre-go-live backlog (already invoiced manually) is never touched. Dry-run confirms 0 eligible today.
  - **Backfill written** (recon values, confirmed by Nicolás): 6 diagnoses + 3 payer cédulas + Andrés
    Gotta's cédula **1761043908** (verified in Contífico) + a missing `payers` service_role GRANT —
    mirror `supabase/facturar-backfill-diagnoses-payer-cedulas.sql`. **Diagnosis is OPTIONAL** (Nicolás,
    2026-09-23): patients without one (e.g. Valentina Andrade) are invoiced with a no-CIE descripcion
    `Paciente {nombre} | Sesión {fecha}`. **All 20 obligatoria sessions now dry-run READY (0 blocked).**
  - **Security:** guard token lives ONLY in Netlify secret env `CONTIFICO_FACTURAR_TOKEN`
    (production/functions) + local `.env` — never in git. Function refuses all requests if unset.
- [x] **Contífico REST API — read-only reconnaissance for the `/facturar` rewrite** (2026-09-23, Opus 4.8).
  Credentials arrived; probed the API **GET-only** (never POSTed a document) from a throwaway
  token-guarded Netlify function `netlify/functions/cf-probe.mjs` (same pattern as the deleted dh-probe;
  **added + DELETED this session**, commit removed — do NOT recreate). api.contifico.com is unreachable
  from the local VM, so all calls ran server-side. **Both creds now live in Netlify** as **secret**
  env vars, `functions` scope, **`production` context** (`CONTIFICO_API_KEY`, `CONTIFICO_POS_TOKEN`).
  ⚠️ Netlify quirk: a secret env var **cannot** use context `all` (the updater silently no-ops); every
  secret is stored per-context. And **env changes only reach functions on the NEXT deploy** (needed an
  empty-commit redeploy before the function saw them).
  - **WORKING AUTH SHAPE:** header **`Authorization: <CONTIFICO_API_KEY>`** — the raw sincronización key,
    **no `Bearer` prefix**. Base `https://api.contifico.com/sistema/api/v1`. `Bearer` → 401
    ("Empresa matching query does not exist"); no header → 401 ("Falta Credenciales"). The **`pos` token
    is NOT needed for GETs** (`/persona/` returns 200 with or without `?pos=`); POS is only for
    document creation. Confirmed against `GET /persona/` (200, 128 personas).
  - **⭐ OBSERVACIONES FIELD = `descripcion`** (the single most important finding). The insurance-claim
    text the UI calls "Observaciones" is carried in the document's top-level **`descripcion`** field, and
    is **mirrored verbatim into `referencia`**. `adicional1`/`adicional2` are unused (empty) on these
    invoices. Verified on Laura Vásquez's factura `001-001-000000282` (07/09/2026, $36):
    `descripcion = "Sesión 4 de Septiembre - Paciente Laura Vásquez F41 otros trastornos de ansiedad"`
    (= the known-good string; the format actually stored is
    **`Sesión <fecha> - Paciente <Nombre> <CIE> <texto>`**, not the pipe-separated paraphrase). So the
    `/facturar` rewrite writes the Observaciones string into **`descripcion`** on `POST /documento/`.
  - **SRI EMISSION: YES — the API emits electronic invoices to the SRI (not record-only).** All 291
    existing documents are `electronico:true`, `firmado:true`, 290/291 carry a 49-digit `autorizacion`
    (SRI clave de acceso) plus `url_ride` (PDF) + `url_xml` (signed XML). Docs confirm the flow is
    **two-step**: **`POST /documento/`** creates the record → **`PUT /documento/<id>/sri/`** submits it
    to the SRI for authorization. A "Documento Electrónico" section exists in the docs nav but the
    detailed schema wasn't in the intro page. ⇒ the rewrite must do POST then PUT-to-SRI (or the POST
    auto-emits — confirm the exact behaviour when we build, still GET-safe until then).
  - **PERSONA `id` GUID is NOT exposed** by `GET /persona/` (list or `?cedula=` filter) — `id` is always
    `null`. The usable client key for invoicing is therefore the **cédula/RUC**, not the GUID. (This is
    consistent with `patients.contifico_id` already being "a cédula-marker, not the real persona id".)
    Note: the document (`GET /documento/`) `id` **is** populated (e.g. `y7aA5KX1gcP1YagZ`), and each doc
    embeds its `persona` (billed-to party) but with `persona.id = null` too.
  - **Cross-reference of the 10 `facturacion_obligatoria` patients vs Contífico (NO Supabase writes yet
    — report only):**

    | Patient | In Contífico | Contífico cédula (own or via payer) | Diagnosis from past invoices |
    |---|---|---|---|
    | Emiliano Caradonna | ✅ own persona | **0961793387** | **F41** otros trastornos de ansiedad |
    | Laura Vásquez | ✅ own persona | 1718240995 (already stored) | **F41** otros trastornos de ansiedad |
    | Cinthya Pérez | ✅ own persona | 2000046116 (already stored) | none (no CIE in descripcion) |
    | Andrés Gotta | ✅ own persona | **1761043908** | none (no CIE in descripcion) |
    | Raguel Conforme | via payer Laura Vásquez | payer 1718240995 (own: unknown) | **F88** Otros trastornos del desarrollo psicológico |
    | Emilie Conforme | via payer Laura Vásquez | payer 1718240995 (own: unknown) | **F88** Otros trastornos del desarrollo psicológico |
    | Micaela Castro | via payer Germania Domínguez | payer **1716794209** (own: unknown) | **F41.1** Trastorno de Ansiedad Generalizada |
    | Thomas Quevedo | via payer Gabriela Páliz | payer **1716725765** (own: unknown) | **F41.8** Otro Trastorno de Ansiedad Social Especificado |
    | Valentina Andrade | via payer Washington Andrade | payer **1712067378** (own: `cedula="na"`) | none (no CIE in descripcion) |
    | Marthin Spatz (menor) / Sharian Narváez (tutor) | ✅ billed to father "MARTHÍN SPATZ" | **1724765266** (now in Supabase) | **Trastorno de Adaptación** (invoices say "CIE-10 \| Trastorno de Adaptación"; no numeric F-code written) |

  - **Gaps this fills (to be written LATER, after Nicolás confirms):**
    - `patients.cedula` / `patients.contifico_id`: **Emiliano Caradonna → 0961793387**, **Andrés Gotta
      → 1761043908** (both have their own Contífico persona; currently null in Supabase).
    - `payers` cédula/contifico_id (all three currently null): **Germania Domínguez → 1716794209**,
      **Gabriela Páliz → 1716725765**, **Washington Andrade → 1712067378** ("Jorge Washington Andrade
      Escobar", also has RUC 1712067378001). Laura Vásquez payer already has 1718240995. The minors
      (Micaela, Thomas, Raguel, Emilie, Valentina) bill to these payers, so their invoices need the
      **payer** cédula, not the patient's.
    - `diagnostico_codigo`/`diagnostico_texto` backfillable for **7**: Emiliano (F41), Laura (F41),
      Raguel (F88), Emilie (F88), Micaela (F41.1), Thomas (F41.8), Marthin Spatz (**Trastorno de
      Adaptación** — texto only, no numeric code written in the invoice; that's F43.2 in CIE-10 but
      confirm before storing a code). **No diagnosis available** in invoices for Cinthya, Valentina, or
      Andrés (billed without a CIE code).
  - **Sharian Narváez / Marthin Spatz — RESOLVED (not a data error).** Earlier `contifico_id
    '1724765266'` looked wrong because it maps to a Contífico persona named "MARTHÍN SPATZ". It's
    correct: the **father** (Marthin Spatz, ced 1724765266) is the billing person, and the **minor
    patient is his son, also named Marthin Spatz**. Nicolás (2026-09-23) converted the row to a `menor`
    patient — **tutor = Sharian Narváez, menor = Marthin Spatz** — and set `cedula`/`contifico_id` =
    1724765266. Coherent; nothing to fix. This patient has **6 past invoices** under the father.
  - **What the `/facturar` rewrite now requires (net):** POST `/documento/` (Bearer-less
    `Authorization: <API_KEY>` + `pos` in body/param for creation), then `PUT /documento/<id>/sri/` to
    emit to SRI; put the Observaciones string in **`descripcion`**; resolve the billed-to party by
    **cédula/RUC** (patient's own, or the linked `payer` for minors) — no persona GUID needed; keep it
    payer-aware. Persona lookup/creation and the exact document payload (line items, IVA, `pos`) are the
    next things to nail down (still GET-safe recon) before writing any POST.
- [x] **Reminder delivery-status tracking + out-of-window delivery CONFIRMED** (2026-09-23, Opus 4.8).
  Nicolás reported "no confirmations from patients in a day." Conclusion: **system works, NOT a bug.**
  Full loop re-verified on **3 phones** incl. a **cold, never-messaged number** → template
  `sent`→`delivered` in 1s, no error ⇒ templates deliver **outside the 24h window** (no coexistence/
  sandbox bug). Real cause = patients **reply in text, don't tap** the button (577 inbound, 0 taps
  ever; one typed "Ya te confirmo") + early confusion re Twilio-era reminders. No hardcoded number
  (grep-verified; recipient is always `s.patient.telefono`). Send/reply path unchanged this session.
  - **New:** `whatsapp_delivery_status` table + `whatsapp-cloud-webhook.mjs` records Meta's
    `sent/delivered/read/failed` (+ err code, e.g. 131047) callbacks it used to discard. Mirror
    `supabase/whatsapp-delivery-status.sql`. Confirmed Dualhook's override **does forward statuses**.
    **GOTCHA:** a table made via raw `apply_migration` does NOT inherit Supabase default GRANTs →
    service-role writer silently hit `42501 permission denied` (logged, 200, no rows). Fix = explicit
    `grant … to service_role/authenticated`. QA dummies (Prueba/2/3) deleted + verified gone.
  - **BUILD GOTCHA (cost 3 failed deploys):** a `git add -A` accidentally committed the untracked
    `.claude/settings.local.json.bak-20260922`, whose Twilio Content SID tripped Netlify's **secret
    scanner** → every build failed at the "Building" stage (`exit code 2`), no publish (prod stayed on
    last-good deploy). Diagnosed via the Netlify deploy log in Chrome (plan is **Pro**, 2172 credits —
    NOT a limit). Fix: untracked the file + gitignored `.claude/settings.local.json` and `.bak-*`
    (commit `85dde30`). **NEVER `git add -A` in this repo** — stray `.bak`/local-settings files carry
    secrets. Content SID remains in public git history (commits `b33e98a`/`eaeec71`/`abd6f28`); low
    severity (identifier, not a credential) and **mooted by cancelling Twilio** (Nicolás's call 09-23).
- [x] **Appointment reminders CUT OVER from Twilio → Dualhook (Cloud API) — full loop verified**
  (2026-09-22, Opus 4.8). Retires Twilio for the 24h appointment reminder. **Both halves moved
  together** (outbound send + inbound Confirmo/Cancelar reply).
  - **Outbound:** `deliverReminder` (`netlify/lib/whatsapp.mjs`) now POSTs the approved template
    `recordatorio_cita` to **`POST https://api.dualhook.com/v25.0/915558374975708/messages`**
    (`type:'template'`, `language.code:'es'`, 3 body params `{{1}}`=nombre `{{2}}`=fecha (día + mes en
    español) `{{3}}`=hora `HH:MM`), Bearer `WA_DUALHOOK_API_KEY`. Signature of `deliverReminder`
    unchanged, so `send-reminders.mjs` (cron `0 * * * *`) and the `?test_session_id` path were **not
    modified**. `.neq('tipo','llamada')` exclusion untouched — llamadas still get NO reminder.
  - **Inbound:** Confirmo/Cancelar replies now arrive at **`whatsapp-cloud-webhook.mjs`** (Dualhook's
    Meta webhook override), NOT `twilio-webhook.mjs`. New shared `applyInboundReplyEstado` flips the
    patient's soonest reminded `programada` session, soft-cancels the Calendar event on cancel, and
    pushes the therapist — mirroring the old Twilio behaviour. Handles a quick-reply **button tap**
    (Cloud API `type:'button'` / `interactive`) AND a **typed** "Confirmo"/"Cancelar" (`type:'text'`),
    accent/case-insensitive (`resolveReplyEstado`).
  - **Provider switch / ROLLBACK:** `REMINDERS_PROVIDER` env (default `dualhook`). Set it to `twilio`
    to instantly fall back to the intact Twilio path — **one env-var change, no deploy, no code change**.
    Twilio code (`sendWhatsAppReminder` + `twilio-webhook.mjs`) is left fully intact but dormant. NOTE:
    the two halves must match — a Twilio rollback also means Confirmo/Cancelar replies route back to
    `twilio-webhook.mjs` (the Twilio number's inbound webhook), which still works.
  - **Verified end-to-end** (real button taps → estado flips; real inbound shape `type:'button'`,
    `button:{text,payload}`; typed `type:'text'` also handled). Further verified 2026-09-23 (see entry
    above). Kill-switch `REMINDERS_LIVE` restored to `true`; live reminders run via Dualhook.
  - **Twilio can be cancelled as a paid subscription** once comfortable (keep env/creds for the one-var
    rollback first). Pre-existing **"Nicolas QA-TEST"** row (created 2026-06-30) left untouched.
- [x] **WhatsApp reminder templates created + submitted to Meta on WABA `1857507018469524`**
  (2026-09-22, Opus 4.8). The template gate from the DualHook send-scope investigation is now
  cleared. Two **UTILITY / language `es`** templates submitted through the Dualhook Cloud-API proxy
  (`POST https://api.dualhook.com/v25.0/1857507018469524/message_templates`, Bearer
  `WA_DUALHOOK_API_KEY`, Graph-v25.0-shaped body — Dualhook exposes Graph-compatible template
  endpoints for the `dh_live_` key). **Submission date: 2026-09-22.**
  - **`recordatorio_cita`** (id `937666942271866`) — vars `{{1}}`=nombre, `{{2}}`=fecha (mañana),
    `{{3}}`=hora. Body: *"Hola {{1}}, te recordamos tu sesión en Efimeramente mañana {{2}} a las
    {{3}}. Responde CONFIRMO para confirmarla o CANCELAR si no puedes asistir."* Two QUICK_REPLY
    buttons: **Confirmo** / **Cancelar**. **Status: ✅ APPROVED** (approved within minutes of
    submission). Mirrors the Twilio reminder behaviour so `send-reminders` can be repointed at
    Dualhook without changing the patient experience.
  - **`recordatorio_pago`** (id `1871176587622662`) — vars `{{1}}`=nombre, `{{2}}`=monto,
    `{{3}}`=nº sesiones. Body: *"Hola {{1}}, tienes un saldo pendiente de ${{2}} por {{3}}
    sesión(es) en Efimeramente. Puedes realizar la transferencia y enviarnos el comprobante por
    este mismo chat."* No buttons. **Status: ⏳ PENDING** (awaiting Meta review as of 2026-09-22).
  - **How submitted:** the `WA_DUALHOOK_API_KEY` is a Netlify write-only secret, so — same precedent
    as the deleted `dh-probe` — a token-guarded throwaway function `netlify/functions/dh-tpl.mjs`
    (added `5c0a8bd`/`4e7af48`, **deleted same session** in the commit recording this entry) POSTed
    the templates and listed status.
    **Gotcha:** Dualhook's proxy 429s with a bare `{"error":{"message":"Rate limit exceeded"}}` (no
    Meta `code`/`fbtrace_id` ⇒ it's a Dualhook failure-circuit, not Meta) if you retry create too
    fast. First `recordatorio_cita` created fine; rapid `recordatorio_pago` retries tripped the
    circuit for hours — one clean call after backing off succeeded. Back off, don't hammer.
  - **What this unblocks:** `recordatorio_cita` being APPROVED clears step (1) of retiring Twilio.
    **Next build task (unchanged):** rewrite `deliverReminder` (`netlify/lib/whatsapp.mjs`) to POST
    Dualhook (`POST …/915558374975708/messages`, Bearer key, `type:'template'`,
    `template:{name:'recordatorio_cita', language:{code:'es'}, components:[…3 body params…]}`) and
    drop the Twilio path. Did NOT touch `send-reminders.mjs` or any Twilio code this session.
- [x] **DualHook send-scope investigation — CONFIRMED we can send WhatsApp with the existing key**
  (2026-09-22, Opus 4.8). Question: can we SEND (not just read) through Dualhook with
  `WA_DUALHOOK_API_KEY`? **Answer: YES.** Dualhook is a Cloud API proxy — send endpoint is
  **`POST https://api.dualhook.com/v25.0/915558374975708/messages`**, `Authorization: Bearer
  <WA_DUALHOOK_API_KEY>` (same host/key/auth as the media-read two-hop in `waMedia.mjs`; phone-number-id
  `915558374975708`, WABA `1857507018469524`). Body is Graph/Cloud-API-shaped
  (`{messaging_product:'whatsapp', to, type:'text', text:{body}}`).
  - **How tested:** the key is a Netlify **write-only secret** (can't be copied out, not in local `.env`),
    so it was probed from **inside a throwaway token-guarded Netlify function** `netlify/functions/dh-probe.mjs`
    (added commit `f4baf03`, **deleted** commit `a01a6ae` — confirmed gone from prod; do NOT recreate it
    openly, it can send WhatsApp). Two modes: `mode=scope` (POST `to:"0"`, reaches no one) and
    `mode=send` (POST to Nicolás's own `593968029896`).
  - **Results:** scope probe → **`400` Meta `131009`** ("phone number is malformed") = auth ACCEPTED, only
    the bad recipient rejected ⇒ **key is NOT read-only, it carries send scope** (a `401/403` would have
    meant read-only). Real send → **`200` with `wamid.HBgMNTkz…`**, delivered to Nicolás's phone. Plain
    text send worked because the 24h window was open (he'd messaged the number first).
  - **What's still missing to go fully live:** (1) a **Meta-approved message template on WABA
    `1857507018469524`** — Dualhook docs say templates are on our plan with no extra tier, but our current
    approved template is **Twilio-side (a different WABA)** and was NOT tested here. Text sends only work
    inside an open 24h window, so reminders/proactive sends need a template. (2) then rewrite
    `deliverReminder` (`netlify/lib/whatsapp.mjs`) to POST Dualhook and **retire Twilio**. No new plan, no
    new token, no config change needed for sending itself.
- [x] **Billing foundation — `payers` table + patient billing/diagnóstico columns**
  (2026-09-22, Opus 4.8). Schema groundwork for issuing facturas to a billing entity that
  isn't always the patient (minors, relatives paying). Migration `payers_and_patient_billing`
  (mirror `supabase/payers-and-patient-billing.sql`).
  - **NEW TABLE `payers`** — the entity an invoice is issued to: `nombre, apellido, cedula,
    contifico_id, email, telefono, razon_social` (+ id/timestamps). `telefono` matters because
    **comprobantes arrive from the payer's WhatsApp number.** RLS = **owner-only**
    (`payers_owner` = `is_owner()`); therapists don't manage payers.
  - **`patients.payer_id` → payers.id, NULLABLE.** NULL = patient pays for themselves (~95%).
    4 payers seeded + linked, with the faked "(Name)" free-text surnames cleaned once linked:
    **Laura Vásquez** (ced 1718240995001, contifico 1718240995) covers herself + **Raguel
    Conforme** + **Emilie Conforme** (the +593999643019 insurance trio); **Germania Domínguez**
    covers **Micaela Castro** (row cleaned "Micaela Castro"/"(Germania Dominguez)" → "Micaela"/
    "Castro"); **Gabriela Páliz** covers **Thomas Quevedo** (surname set from the parents'
    parenthetical); **Washington Andrade** covers **Valentina Andrade** (payer phone = Valentina's
    +593992738962, per Nicolás). Raguel's "Conforme Vasquez" left as a real compound surname.
  - **`patients.facturacion_obligatoria`** boolean default false — this patient REQUIRES an SRI
    factura. Set true for exactly 10: Emiliano Caradonna, Laura Vásquez, Raguel Conforme, Emilie
    Conforme, Sharian Narváez, Cinthya Pérez, Valentina Andrade, Andrés Gotta, Micaela Castro,
    Thomas Quevedo (collisions resolved by first name vs Diego Narvaez / the 4 other Pérez / the
    5 other Andrés / Micaela Mojarrango / Valentina Yanchaluiza). **⚠️ DO NOT confuse with
    `facturacion_manual`** ("never auto-invoice") — different flag, opposite meaning, both coexist.
  - **`patients.diagnostico_codigo` + `diagnostico_texto`** — both nullable, never required. UI
    label explicitly names **CIE-10** so therapists know a clinical category is expected.
  - **App wiring:** `PATIENT_SELECT` gains payer_id/facturacion_obligatoria/diagnostico_*;
    `PATIENT_COLUMNS` gains diagnostico_codigo/texto only (payer_id + facturacion_obligatoria are
    billing-scoped — set via DB/owner tooling, NOT writable through the patient form for now);
    `SESSION_SELECT` embed gains `facturacion_obligatoria` so the Lista row can gate. **FACTURADA
    toggle** (`views.jsx`) is now enabled ONLY when `patient.facturacion_obligatoria` (still off
    for cancelled/llamada); disabled elsewhere with copy "No facturable". Pacientes → Configuración
    form got the two CIE diagnóstico inputs. Build green.
- [x] **Presencial 3-room cap — closed the `/reservar` hole + made it DB-authoritative**
  (2026-09-17, Opus 4.8). **Incident:** 4 presencial sessions landed on the same 17:00 window
  today (only 3 consultorios). Diagnosed live: the 4th (Cecília Saltos, Francisco, 17:00–18:00)
  came in through the **public `/reservar`** self-booking page, which never checked the room cap
  (the cap lived ONLY in the in-app drawer + `Sesiones#handleSubmit` — a known deferred gap).
  Nicolás's edit-time suspicion wasn't the cause this time; it was a fresh public booking.
  (Aside confirmed with Nicolás: the two "Cecília" patient rows sharing +593983561095 are NOT a
  duplicate — mother sees Francisco, minor daughter sees Sophia; legit shared-number family, left
  as-is.) **Fix, two layers:**
  - **Layer A — public `/reservar`:** `public-booking.mjs` now counts non-cancelled presencial
    sessions overlapping the requested window across ALL therapists and returns **`rooms_full` 409**
    when 3 are taken (`CONSULTORIOS=3`, mirrors `conflicts.js`). `PublicBooking.jsx` shows a
    dedicated notice ("…ya no tiene consultorio presencial disponible… o agéndala En línea") and
    sends the user back to pick another slot. NOTE: modalidad is chosen on the LAST form step
    (after slots), so slots can't pre-filter — the book-time 409 is the guard.
  - **Layer B — DB trigger (the hard wall):** `enforce_presencial_room_cap`
    (migration `presencial_room_cap_trigger`, mirror `supabase/presencial-room-cap-trigger.sql`)
    is a `BEFORE INSERT OR UPDATE` trigger on `sessions` that rejects a 4th overlapping
    non-cancelled presencial from ANY path (app, public, SQL, import, future code). Half-open
    overlap (back-to-back OK); en línea/llamada/cancelled/no_show exempt; takes a per-day
    `pg_advisory_xact_lock` so simultaneous bookings can't each see a free room. Raises
    `ROOMS_FULL …`; `queries.js#friendlySessionError` maps it to the drawer copy for in-app edits.
    **Verified in prod** (rolled-back test): 4th presencial @17:00 REJECTED; en línea @17:00 and
    presencial in a free window both ALLOWED. **This means the incident already cannot recur even
    before the front-end deploy** — the trigger blocks the insert regardless of client.
  - Build green. To bulk-load legacy overlapping presencial, temporarily DISABLE the trigger
    (noted in the .sql header).
- [x] **WhatsApp Coexistence — inbound Cloud API webhook + Comprobantes payment-proof reading/OCR, Phase 1**
  (2026-09-15/16) — moved to `CHANGELOG.md`. Dualhook BSP (WABA `1857507018469524`, PN `915558374975708`);
  `whatsapp-cloud-webhook.mjs` (inbound → `whatsapp_messages`), `/comprobantes` owner page, `wa-proof-media.mjs`
  (Dualhook two-hop image fetch), `extract-proof.mjs` (APIMart Opus 4.8 OCR, `stream:false`). Migrations
  `whatsapp_messages_reconcile` + `whatsapp_messages_extraction`. Human-confirm mode LIVE; auto-mark+push
  was the deferred NEXT. Read the archive + memory `whatsapp-coexistence-consolidation.md` for detail.
- [x] **UX polish batch — therapist patient edits + booking preview + LEADS system** (2026-09-14) —
  moved to `CHANGELOG.md`. `patients.es_lead` flag, `agendar.html` 2nd Vite entry, therapist
  full-edit of own patients. Read the archive for detail.

> **Older completed work (2026-09-14 and earlier) lives in `CHANGELOG.md`.**
> It is deliberately not loaded into session context. Read it on demand.

## Pending / Backlog

### ✅ DONE 2026-09-23 — /facturar REWRITTEN against the Contífico REST API
- **The Chrome-automation protocol is DELETED.** `/facturar` now runs entirely through the
  `facturar` Netlify function (`netlify/functions/facturar.mjs`); the command
  (`.claude/commands/facturar.md`) is a thin API driver. Full write-up in Completed Features.
- **Flow proven end-to-end:** `POST /documento/` (`electronico:true`, next `001-001` sequential
  computed live — the account requires it, cod_error 1002 without it) → `PUT /documento/<id>/sri/`
  → SRI authorizes async (seconds). Verified by a real **$1 dummy factura to Nicolás**
  (`001-001-000000291`, firmado, authorized). Auth = `Authorization: <CONTIFICO_API_KEY>` (raw key).
- **Eligibility (new rules):** `confirmada + pagado + NOT facturada + tipo<>llamada +
  facturacion_obligatoria=true + fecha >= FACTURAR_SINCE (2026-09-24)`. **NON-retroactive** — the
  historical backlog is never touched (all already invoiced manually). The old `facturacion_manual`
  exemption and the named NEVER-INVOICE list are **gone** — the API produces the insurance format.
- **Observaciones = `descripcion`**, format `Paciente {nombre} | {CIE} {dx} | Sesión {fecha texto}`.
  Billing party = payer if `payer_id` set, else patient; persona keyed by cédula/contifico_id.
  (⚠️ Contífico strips accents in the mirrored `referencia` but keeps them in `descripcion`.)
- **Guard token** moved OUT of git → Netlify secret env `CONTIFICO_FACTURAR_TOKEN`
  (production/functions) + local `.env`. Backfill applied (6 diagnoses + 3 payer cédulas), mirrored
  in `supabase/facturar-backfill-diagnoses-payer-cedulas.sql` (also fixes a missing `payers` GRANT).
- **No obligatoria patient is blocked anymore:** Andrés Gotta's cédula (1761043908) was added and
  diagnosis is now optional, so Valentina Andrade invoices fine without one. Dry-run (?all=1) shows all
  20 obligatoria sessions READY; the normal floor keeps them out until a session lands ≥ 2026-09-24.
- **DualHook send-scope + templates + CUTOVER — ALL DONE (cutover 2026-09-22, see Completed
  Features).** Send scope confirmed; `recordatorio_cita` **APPROVED**; **`deliverReminder` now POSTs
  Dualhook and reminders send live via Dualhook.** Twilio is retired-but-dormant behind
  `REMINDERS_PROVIDER` (default `dualhook`). Only `recordatorio_pago` remains **PENDING** at Meta —
  unrelated to the appointment-reminder loop, which is fully live.

### Design-flaws polish pass (started 2026-08-03) — see `DESIGN-FLAWS-TODO.md`
Running list of small flaws/nice-to-haves now that all modules are built. Doc is the source
of truth; open items as of 2026-08-03:
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
- [x] ~~**Build `/facturar` (browser automation, Protocol 2)**~~ — **REPLACED 2026-09-23** by the
      REST-API rewrite (see the ✅ DONE entry at the top of this backlog + Completed Features). The
      browser protocol, the Consumidor Final fallback, the Registrar Persona flow, and the
      `facturacion_manual`/NEVER-INVOICE safety list are all deleted. `.claude/commands/facturar.md`
      is the source of truth for the new API protocol.
- [x] ~~**Eligible-session query for /facturar**~~ — superseded: eligibility now lives in
      `netlify/functions/facturar.mjs` (`facturacion_obligatoria` + non-retroactive `FACTURAR_SINCE`
      floor; no 7-day window, no `facturacion_manual`).
- [x] ~~**Missing cédulas / diagnoses for the obligatoria patients**~~ — DONE 2026-09-23. All 10
      backfilled; Andrés Gotta's cédula (1761043908) recovered from Contífico; diagnosis made optional
      so Valentina Andrade invoices without one. Dry-run reports 0 blocked. Fill only with real data.
- [ ] **(Historical, low priority) Fill missing cédulas for non-obligatoria patients** — only matters
      if their `facturacion_obligatoria` is ever turned on. Original notes below:
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
      (insurance family). Still-open cleanup: split the composite row "Daniel y Daniela" into individual
      patients. ("Thomas (Gabriela P. y Matheo Q.)" and "Micaela Castro (Germania Dominguez)" were RESOLVED
      2026-09-22 via the payers model — surnames cleaned to Thomas Quevedo / Micaela Castro, payer linked.)
      NOTE: app-side, phones aren't normalized on write — spaces
      bypass the UNIQUE constraint, so dups can recur until an input-normalization fix lands.
- [ ] **`contifico_id` is a marker (= core cédula), not the real Contífico persona id.** Fine for the
      cédula-based persona lookup in the API (`cliente.cedula`); upgrade to the real id only if needed.

### Payer / billing model follow-ups (surfaced 2026-09-22, after the `payers` foundation)
- [x] ~~**Wire `/facturar` to the payer.**~~ — DONE 2026-09-23 in the API rewrite: `billingIdentity()`
      issues to the `payers` row when `payer_id` is set (its cédula/razón_social/contifico_id), else the
      patient; the descripcion always names the patient.
- [ ] **Owner UI to manage billing fields.** `payer_id` and `facturacion_obligatoria` are deliberately
      NOT in `PATIENT_COLUMNS` (not writable via the Pacientes form) — they're DB/owner-tooling only for
      now. Build an owner-only control to assign a patient's payer and toggle `facturacion_obligatoria`.
- [x] ~~**Flag interaction — the 4 insurance patients**~~ — RESOLVED 2026-09-23: `facturacion_manual`
      is no longer read by `/facturar` (eligibility keys off `facturacion_obligatoria` only). The API
      produces the insurance format, so Sharian Narváez / Raguel & Emilie Conforme / Laura Vásquez are
      now invoiced automatically like everyone else. The `facturacion_manual` column is left dormant.
- [ ] **Confirm Washington Andrade's WhatsApp** — his payer `telefono` was assumed = Valentina Andrade's
      `+593992738962` (per Nicolás 2026-09-22). Verify it's actually the number comprobantes arrive from.
- [ ] **Data oddity:** Laura Vásquez (payer + patient) and Emilie Conforme share cédula `1718240995001`.
      Fine for now; revisit if it breaks a per-cédula Persona lookup when invoicing the trio.
- [ ] Diagnóstico fields (`diagnostico_codigo`/`diagnostico_texto`, CIE-10 labelled) live ONLY in the
      Pacientes → Configuración edit form. The inline create-patient drawer doesn't set them — add there
      if therapists want to record a diagnosis at registration (minor).

### Immediate — next session
- [ ] **Cancel the Twilio paid subscription — Nicolás cancelling (decided 2026-09-23).** Reminders +
      delivery all run on Dualhook, re-verified working 09-23. Cancelling also **moots the Content-SID
      exposure** in git history. After cancel, optionally delete `TWILIO_*` Netlify env vars +
      `sendWhatsAppReminder`/`twilio-webhook.mjs` (the `REMINDERS_PROVIDER=twilio` rollback dies with
      the subscription — acceptable, Dualhook is proven).
- [x] **Payment-reminder templates submitted + #1 wired (2026-09-24, Opus 4.8).** On WABA
      `1857507018469524`, via the token-guarded `dh-tpl.mjs` throwaway (Dualhook proxy):
      - **`recordatorio_pago_v2`** (id `3646376502176152`) — **APPROVED**. The patient payment
        reminder (bank block + dynamic URL button "Pagar con tarjeta" → `https://ppls.me/{{1}}`).
        Body vars {{1}} nombre / {{2}} monto / {{3}} sesiones-text (code-generated). New name, NOT the
        old `recordatorio_pago` (id `1871176587622662`) which turned out to be **APPROVED, not pending**
        as an earlier note assumed — left dormant rather than deleting an approved asset.
      - **`comprobante_sin_identificar`** (id `1595464335377117`) — **APPROVED** (feeds the #2 build).
      - **`resumen_en_mora`** (id `4657291211223040`) — **PENDING**. Had to append a trailing
        "Revísalos en la app." because Meta rejects a body ending in a variable (error 2388299).
      - **Wired:** `sendDualhookPaymentReminder` in `netlify/lib/whatsapp.mjs` (template
        `recordatorio_pago_v2`; button suffix from env **`PAYPHONE_LINK_SUFFIX`**, set in Netlify to
        `r1NzJTGHRqrDZi1UJRm9w`, so a per-patient link swaps with no redeploy). **Render test PASSED**
        to Nicolás's number (dummy name/$1/fake session — accepted by WhatsApp).
      - **Render confirmed perfect by Nicolás → `dh-tpl.mjs` throwaway DELETED.**
- [x] **Payment-reminder protocol BUILT + went LIVE for the go-live batch (2026-09-24, Opus 4.8).**
      - **Core:** `netlify/lib/paymentReminders.mjs` — rule: estado=confirmada, tipo≠llamada,
        pagado=false, fecha ≤ today−2 (America/Guayaquil), `recordatorio_pago_at IS NULL`,
        `pago_excluido=false`; skip any patient with a reminded-and-still-unpaid session (en mora);
        one msg/patient; sum monto; code-gen {{3}} sesiones-text; stamp `recordatorio_pago_at` on send.
      - **Scheduled + LIVE:** `send-payment-reminders.mjs`, cron `0 15 * * 1-6` = 10:00 GYE Mon–Sat
        (never Sunday). **`PAYMENT_REMINDERS_LIVE=true` set in Netlify (functions scope) on 2026-09-25** —
        the cron now auto-sends every Mon–Sat, hands-off (runs on Netlify's servers, no laptop needed).
      - **Manual trigger:** `payment-run.mjs` (token-guarded HTTP, `?t=…&mode=dry|live`) since scheduled
        fns aren't HTTP-invocable — used for the go-live batches + catch-up + previews.
      - **Recipient model = Option A (decided 2026-09-25):** reminders go to `patients.telefono`, ALWAYS.
        NO payer routing — `payer_id` is invoicing-only. Minors (`tipo_paciente='menor'`) have the tutor's
        number saved as the patient phone; the message greets the tutor and NAMES the minor in {{3}}
        ("la sesión de Camila del …"). See memory `payment-reminder-routing`.
      - **DB (MCP):** `sessions.recordatorio_pago_at` + `sessions.pago_excluido` (+ index); room-cap
        trigger now skips flag-only updates (`supabase/payment-reminder-fields.sql`,
        `supabase/presencial-room-cap-trigger.sql`).
      - **Go-live boundary:** 31 pre-22-Sep unpaid confirmed sessions flagged `pago_excluido` (Nicolás
        handles those manually, one last time). Protocol charges the 22nd onward.
      - **LIVE SENT 24 Sep (22nd's sessions):** Shyam Yelpi ($39), Isabella Schreckinger ($39), Valentina
        Andrade ($32, self-pays). Held: Eduarda Acosta + Andrés Chávez (22nd `pago_excluido`).
      - **LIVE SENT 25 Sep (23rd's sessions):** Karina Almache (for minor Camila Mena, $39), Shally Ortiz,
        Sara Pavlica, Nathalie Suárez, Andrea Torres — all $39. Cristina Fueres dropped (paid).
      - **Still TODO for #8:** amount-net-of-saldo (#19); the "En mora" Finanzas card + daily
        `resumen_en_mora` WhatsApp to Nicolás (template PENDING at Meta).
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
- **Reminder QA recipe (no standing fixture — always clean up):** insert a session on **"Nicolas
  QA-TEST"** (`33c4ec56…`, +593968029896) with `estado='programada'`, `modalidad='en_linea'` (dodges
  the room-cap trigger), `reminder_sent_at=now()`, then hit `?test_session_id=<id>` on `twilio-webhook`
  (still the manual send path even on Dualhook). Delivery truth is now in `whatsapp_delivery_status`.
  Per-therapist fake patients stay blocked by the `patients.telefono` UNIQUE constraint — but per-SESSION
  `terapeuta_id` already exercises any therapist, so not needed.
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

> Rewritten 2026-09-22. The previous version described a two-clone workflow
> (Cowork writes into `~/Claude/Projects/New Efimeramente App 3`, port by hand into
> `~/my-site`, then push). That workflow existed only because Cowork could not reach
> the machine directly. It is the documented cause of the "session #8 divergence" and
> of three duplicate app folders. **It is dead. Do not reintroduce it.**

### One clone. One truth.
- **`~/my-site` is the only working copy.** Remote: `github.com/efimeramenteec-spec/my-site`.
- There is no second clone, no sandbox copy, no "Cowork workspace". If a second copy of
  this project appears anywhere on disk, that is a bug — delete it, don't sync it.
- Backups are git. A duplicated folder is not a backup, it is a future divergence.

### Where work happens
- **Claude Code in the terminal, inside `~/my-site`**, is the primary surface. It edits,
  builds, commits and pushes directly. Nicolás does not paste code and does not port files.
- Nicolás types short commands (`/deploy`, `/estado`, `/nuevo`). The prompts behind them
  live in `.claude/commands/` and are written for him, not by him.
- Cowork is used for research, planning, scoring the daily to-do, and anything needing
  Gmail / Calendar / Drive. It does not write application code any more.

### Permissions
- Policy lives in `.claude/settings.json` (committed). It is a *policy*, not a log of
  past approvals — do not let it accumulate one-off rules again.
- Run in auto mode: `claude --permission-mode auto`.
- Deny rules beat every mode. Destructive git operations are denied outright.
- `--dangerously-skip-permissions` is never used on this machine.

### Push workflow
1. `npm run build` (or `vite build --emptyOutDir false`) — fix errors before committing.
2. Commit with a real message.
3. `git push origin main`.
4. Netlify deploys from `main`. Verify by grepping the served bundle for a known-new
   string — Netlify's build hash differs from a local build, so hash comparison lies.
- Never use the GitHub web editor: no build verification.

### Supabase writes
- Preferred: the Claude Supabase connector against project `vnityzpuhnkumsyfnskz` —
  reads, row writes, DDL via `apply_migration`. Tell Nicolás before any DDL.
- Always mirror migrations into `supabase/*.sql` in the repo.
- Fallback: `SUPABASE_SERVICE_KEY` from `~/my-site/.env`. Read in-process, never print it.
- Grants already applied: `anon`, `authenticated` and `service_role` have full access to
  all public tables (usage on schema, CRUD on tables, usage+select on sequences).

### Gmail vs app login — never confuse these
- **App login:** `@efimeramente.ec` addresses (e.g. `mariana@efimeramente.ec`).
- **Google Calendar sync:** personal Gmail addresses in `therapists.calendar_email`.
- Always confirm an address with Nicolás before setting it. Never infer or guess.

### Scope
Efimeramente only. Metamorphosis, Munay Warmi / Booking Lab, Cedere, HARU and anything
Holy Cow! / HolyFoods are dead projects. Do not propose work on them.

## Session Management (Self-Preservation Protocol)

### Context budget
This file and `CLAUDE.md` load at the start of every session. Every KB here is paid for
on every single run. Keep this file lean:
- **Shipped work goes to `CHANGELOG.md`**, not here. This file holds *current state*,
  *pending work* and *protocol* only.
- When this file passes ~600 lines, move the oldest completed entries to `CHANGELOG.md`.
- `CHANGELOG.md` is never auto-loaded. Read it on demand when history is actually needed.

### End of every session
1. Update this file: completed → moved to `CHANGELOG.md`, new pending items, changed
   technical details.
2. Build, commit, push.
3. Next session starts by reading this file, not by remembering.

### When to close a session and start fresh
Close when ANY of these is true — a fresh session with a good state file beats a long
session with 100k tokens of scrollback:
- A module or feature is finished
- The task type changes (building → debugging → planning)
- Responses start feeling slow, or Claude starts forgetting earlier decisions

### Token discipline
- Send exploration and search to **subagents** — they burn their own context and return
  only the conclusion.
- Use `--bare` for scripted / headless runs so hooks, plugins and CLAUDE.md aren't loaded.
- Don't re-read large files that are already summarized here.
