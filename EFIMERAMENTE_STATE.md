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
  - **Therapist comms:** drafted a Spanish message for Nicolas to send therapists explaining the
    three therapist-facing improvements (full patient editing, the Leads tab + "¿Es primera
    sesión?" flow, nicer booking-link preview). Not stored in the repo.

> **Older completed work (2026-08-31 and earlier) lives in `CHANGELOG.md`.**
> It is deliberately not loaded into session context. Read it on demand.

## Pending / Backlog

### ⭐ DECIDED 2026-09-22 — Contífico REST API purchased; /facturar to be rewritten
- **Contífico API key purchased ($15.23/mo), awaiting delivery.** Once it arrives, `/facturar`
  gets **REWRITTEN against the REST API** (`api.contifico.com/sistema/api/v1/`) and the entire
  **Chrome-automation protocol is deleted**. Alternatives researched and rejected: **Dátil Plus**
  ~$11.70/mo (migration cost exceeds the $42/yr saving); **direct SRI web services** (free, but
  XAdES-BES signing + ficha técnica maintenance is a permanent liability).
- **Therefore: do NOT invest further in the browser-automation `/facturar`.** Payer-aware invoicing
  (issue to `payer_id` when set) is **part of the API rewrite**, not a separate task on the current
  protocol. (This supersedes the "Wire `/facturar` to the payer" item under Payer/billing follow-ups.)
- **The key also unlocks:** `GET /persona/` to fill the **6 missing cédulas + 7 missing
  `contifico_id`** in one call; pulling **past invoices** to backfill the **10 diagnosis codes**;
  confirming which API field maps to **"Observaciones"** (`descripcion` / `adicional1` / `adicional2`).
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
- [x] ~~**Build `/facturar` (Protocol 2)**~~ — **SHIPPED.** Full protocol lives in
      `.claude/commands/facturar.md` (project-level command). All 5 config questions are answered and
      locked in its "Config reference (confirmed with Nicolas)" section: Producto **SESION INDIVIDUAL**
      (auto-sets IVA 0%) · Descripción **"Sesión del <fecha>"** · Forma de pago **Otros con Utilización
      del Sistema Financiero** (= transferencia) · **Emit directly** to SRI (no draft step). Platform =
      **Contífico (Siigo)**, RUC 1760388700001, browser automation (no free API). Also encodes:
      Consumidor Final fallback (no cédula, legal <$50), Registrar Persona flow, and the NEVER-INVOICE
      insurance-format safety list (Sharian Narvaez, Raguel Conforme, Emilie Conforme, Laura Vasquez —
      enforced by both `patients.facturacion_manual=true` AND by name). **The command file is the source
      of truth — do NOT re-ask the config questions.**
- [x] ~~**Eligible-session query for /facturar**~~ — encoded in the command (§1): `estado='confirmada'
      AND pagado AND NOT facturada AND tipo<>'llamada' AND fecha within rolling last 7 days AND
      patient.facturacion_manual=false`. Client-ready vs no-cédula (Consumidor Final) vs
      has-cédula-not-yet-client are split and handled there.
- [ ] **Finish the 10 client-pending patients:** get the 9 placeholder emails (Aichele Oliver,
      Huidobro Juliana, Cevallos Jacqueline, Racines Alisson, Conforme Emilie, Padilla Camila,
      Almache Karina, Ortiz Shally, Chiriboga Joaquin), then bulk-create them (Protocol 1) + stamp.
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
      cédula-based Persona lookup in Protocol 2; upgrade to the real id only if a flow needs it.

### Payer / billing model follow-ups (surfaced 2026-09-22, after the `payers` foundation)
- [ ] **Wire `/facturar` to the payer.** When `patient.payer_id` is set, the factura must be issued
      to the `payers` row (its cédula/razón_social/contifico_id), NOT the patient. The command still
      keys off `patient.cedula` — update Protocol 2's Persona lookup to prefer the payer when present.
- [ ] **Owner UI to manage billing fields.** `payer_id` and `facturacion_obligatoria` are deliberately
      NOT in `PATIENT_COLUMNS` (not writable via the Pacientes form) — they're DB/owner-tooling only for
      now. Build an owner-only control to assign a patient's payer and toggle `facturacion_obligatoria`.
- [ ] **Flag interaction — NOT a bug:** the 4 insurance patients (Sharian Narváez, Raguel Conforme,
      Emilie Conforme, Laura Vásquez) are now BOTH `facturacion_manual=true` (excluded from the automated
      `/facturar` eligibility query) AND `facturacion_obligatoria=true` (the manual FACTURADA toggle is
      enabled for them). Coherent: they require a factura but it's done manually (insurance format), not
      via the Contífico automation. Keep both flags; don't "reconcile" them.
- [ ] **Confirm Washington Andrade's WhatsApp** — his payer `telefono` was assumed = Valentina Andrade's
      `+593992738962` (per Nicolás 2026-09-22). Verify it's actually the number comprobantes arrive from.
- [ ] **Data oddity:** Laura Vásquez (payer + patient) and Emilie Conforme share cédula `1718240995001`.
      Fine for now; revisit if it breaks a per-cédula Persona lookup when invoicing the trio.
- [ ] Diagnóstico fields (`diagnostico_codigo`/`diagnostico_texto`, CIE-10 labelled) live ONLY in the
      Pacientes → Configuración edit form. The inline create-patient drawer doesn't set them — add there
      if therapists want to record a diagnosis at registration (minor).

### Immediate — next session
- [ ] **Cancel the Twilio paid subscription** — reminders now send via Dualhook (cutover 2026-09-22).
      Rollback is `REMINDERS_PROVIDER=twilio` (one env var), so **keep the Twilio env vars + account
      ~1 week** while Dualhook proves out on real cycles; then cancel + optionally delete `TWILIO_*` +
      `sendWhatsAppReminder`/`twilio-webhook.mjs`.
- [ ] **`recordatorio_pago` template still PENDING at Meta** (WABA `1857507018469524`) — unrelated to
      the (live) appointment-reminder loop; check status before building any payment-reminder send.
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
- [ ] **Fake test patients per therapist** (requested, NOT done): BLOCKED by the `patients.telefono` UNIQUE constraint — six patients can't share +593968029896 (all inserts failed `patients_telefono_key`). Options: **(a)** drop/relax that unique constraint via SQL, then create `PacienteFalso <Therapist>` per therapist — but the inbound webhook resolves phone→patient by first match, so with several sharing a number, test ONE therapist at a time; **(b)** skip it — the single **"Nicolas QA-TEST"** patient (+593968029896) already tests every therapist via per-SESSION `terapeuta_id` (calendar + reminders key off the session's therapist, not the patient's). **No standing QA session right now** (cleaned up). To re-test the reminder loop: insert a session on
  the **"Nicolas QA-TEST"** patient (`33c4ec56…`, +593968029896) with `estado='programada'`,
  `modalidad='en_linea'` (dodges the room-cap trigger), `reminder_sent_at=now()`, then hit
  `?test_session_id=<id>` on `twilio-webhook` — or just tap the buttons on any template already on the
  phone (webhook matches by phone → soonest reminded `programada` session, no new send needed).
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
