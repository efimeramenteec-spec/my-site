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

## ✅ Lead funnel (#4 + #20) — LIVE for real leads since 2026-09-26 (`LEAD_BOT_LIVE=true`)

**Rollback:** set Netlify env `LEAD_BOT_LIVE=false` + redeploy (empty commit) → bot goes silent, measurement continues.

WhatsApp bot that turns ad leads into booked free calls. **Since 2026-10-06 (#54, 41682e6): NO buttons/lists,
plain text + Claude multi-intent classifier + booking LINK instead of slots** — see Completed Features.
Spec: `~/Desktop/MD FILES - MISCELANEOUS/PERMANENT TO-DO.md` → "#4 + #20 Lead funnel — decided 26 Sep".

**Files:** `netlify/lib/leadBot.mjs` (brain: classify sender, create/advance lead, button state machine,
follow-up entry points), `netlify/lib/waSend.mjs` (Cloud-API session sends), `netlify/lib/booking.mjs`
(the ONE slot+booking engine, now shared with `public-booking.mjs`), `netlify/lib/leadTemplates.mjs`
(4 templates + submit + send), `netlify/functions/lead-followups.mjs` (*/15 cron), the wiring in
`netlify/functions/whatsapp-cloud-webhook.mjs`, and the dashboard in `src/pages/MarketingFunnel.jsx` +
`src/lib/funnel.js`. DB: `supabase/lead-funnel-0{1,2,3}-*.sql` (leads table, funnel_categorias,
therapists.recibe_nuevos/funnel_caption/funnel_card_url).

**Measurement is ALREADY ON** (independent of the flag): every non-patient/therapist/payer inbound
creates a `leads` row with CTWA attribution. The bot only SENDS when `LEAD_BOT_LIVE=true`.

**✅ GO-LIVE GATE CLEARED — smb_message_echoes VERIFIED (2026-09-26).** Nicolás manually messaged a lead
from the business app; `handleEchoes` flipped that lead's `bot_paused` to true (observed in the DB). So the
manual-reply pause works: hand-reply in a lead's chat → bot goes silent for that lead forever. Full flow
also tested end-to-end (Msg 1 → cards w/ photos → booking + Calendar sync) + FAQ path confirmed working.

**Templates at Meta:** v1 (below, all 4 APPROVED by 2026-10-04) + `_v2` Nico-voice set (#41, submitted
2026-10-04 — see Completed Features). Sends auto-switch to `_v2` per template once approved.
**v1 (submitted 2026-09-26 via the `submit-lead-templates` fn, guard env `LEAD_TOOLS_TOKEN`):**
- `recordatorio_llamada` — **APPROVED** (call reminder to lead; buttons Confirmo / Cambiar hora)
- `resultado_llamada` — **PENDING** (call result to therapist; buttons Se hizo / No contestó)
- `primera_sesion` — **PENDING** (48h first-session nudge; button Sí, quiero agendar) [added]
- `rebook_llamada` — **PENDING, reclassified MARKETING by Meta** (no-show rebook; button Sí, reagendar) [added]

`rebook_llamada`+`primera_sesion` were added beyond the two named because their sends land after the 24h
window closes (must be templates) — review the wording. Meta rule learned: **a template body can't end in a
variable, and a trailing emoji doesn't count as text** (bit `resultado_llamada`/`primera_sesion` — fixed with
trailing words). The bot flow itself doesn't wait on any template; only the follow-ups do.

**Cards:** `therapists.funnel_card_url` populated for all 6 pool therapists → `/cards/*.jpg` (served 200,
`public/cards/`). Edit in Marketing → Configuración or SQL.

**TEST MODE:** env `LEAD_BOT_TEST_PHONES` (last-9 match, comma-sep) — retained but now moot since
`LEAD_BOT_LIVE=true` makes `botAllowedForPhone` return true for everyone. `botAllowedForPhone` in
leadBot.mjs gates runBot + lead-followups per-lead; used to gate go-live before the flag flip.

**Tested end-to-end 2026-09-26 (Nicolás, test mode):** Hola → Msg 1 → Elegir terapeuta → categoría
(no_seguro) → cards WITH PHOTOS → Elegir a Ma. Gracia → real slot → booking + Google Calendar sync +
es_lead/fuente correct. Card images live at `/cards/*.jpg`; `therapists.funnel_card_url` populated.
**BUG FOUND & FIXED (commit 25ba446):** the messages-branch patient cache select omitted `es_lead`, so
after booking `patient.es_lead` was undefined → `(!patient || patient.es_lead)` falsy → runBot skipped
for ALL post-booking messages. Now includes es_lead; verified runBot runs post-booking.
**Next-session polish — RESOLVED 2026-09-26 (commit `436cb66`, see top of Completed Features):** the
`claude-haiku-4-5` classify-null bug is fixed (keyword-first + `claude-opus-4-8` fallback); the whole answer
flow was reworked (answer-before-asking) and the known-organic-contact guard added. **B was superseded by
spec #24 — DONE 2026-09-27 (Claude/Sonnet + fact sheet + derive; see top of Completed Features); the old
answer flow is now only the fallback.** WhatsApp reply buttons are still single-use (grey out after one tap).

## Completed Features

### 2026-10-21 — #81 A/B/C: Mariana's receipts held · package credit at package price · only approved credit spent (executor, 23bc4f2, 3d2cd78)
- **#81 A:** `proofReconcile.mjs` — sender last-9 = a therapist named Mariana (+593994342657) or her Mariana Villegas patient
  record → ALWAYS `withhold` (`remitente_mariana`), even exact tarifa / 4×tarifa. `nameCandidates` (nombre+apellido in OCR
  `sender_name`/`bank_description`) + `pickRealPatient` (tie-break tarifa = amount, then unpaid session on `transfer_date`) →
  the proposal targets the real patient with what #77/#80 would do for them; none → "elige a mano". Owner msg "enviado por
  Mariana". approveProof re-derives the same patient (proof gets filed under them).
- **#81 B+C (migration `saldo_precio_paquete_81`, `supabase/saldo-precio-paquete-81.sql`):** `consume_saldo_on_confirm` draws
  ONE unit = `price_per_session` from the oldest lote with `aprobado_at` set and a full unit left; fallback = approved
  non-package fragments pooled for the monto. New table **`saldo_consumos`** (owner RLS + GRANTs) logs every draw; session →
  `cancelada` refunds its live draws (`revertido_at`). `settle_saldo_for_patient()` + triggers `apply_new_saldo_lote` (insert,
  approved, no proof_id) and NEW `apply_approved_saldo_lote` (aprobado_at null→set) settle confirmada+unpaid sessions by
  touching them (`set estado = estado`; room-cap/therapist-rule triggers skip no-op updates). JS: `saldo.mjs#loteGastable`,
  `owedAfterCredit` (reminders), proposals never pool package credit, $140 proposal = 4 sessions @35 marked + rest as lote.
  Harnesses: `node scripts/harness-comprobantes-77.mjs` (60/60) + `scripts/harness-saldo-81.sql` (13/13 on live, rolled back).
- **Pre-#81 draws were never logged** → not refundable automatically. Wrong-price/cancelled report (NOT corrected — Nicolás):
  Andrea Torres −$47 (3 draws of $39 = 23 Sep, 1 Oct + one cancelled session 7 or 8 Oct; should be 2×35 → remaining 70 not 23),
  Juan Carlos Carrera −$8 (should be 70 not 62), Catalina Fernandez −$4 (105 not 101), Emily Rivera −$4 (new lote 140 not 136;
  her 10 Oct session took 35+4), Ramesvary Henao −$4 (35 not 31). Total $67. Correct already: Isabel, Gabriela Páliz, Shyam,
  Daniel, Samantha, Fátima.
- **C freeze — every lote except Connie Ayala $35 and Felipe y Mafer $50 is now paused** (all had aprobado_at null): packages
  Catalina $101 (next 22 Oct), Fátima $60 @30 (next 22 Oct), Emily $136, Juan Carlos $62, Samantha $48 @24, Daniel $35,
  Andrea $23 + Ramesvary $31 (both < 1 unit — stuck until corrected); plus 19 non-package lotes. Approve = `update saldo_lotes
  set aprobado_at = now() where id = …` → pending confirmed sessions settle instantly. Check non-package `price_per_session`
  before approving (e.g. Ericka $35 @30, Karo $35 @39).
- **B3:** Felipe y Mafer 20 Oct 19:00 pareja → Calendar event 2pf561pilv97oe4qad8aehbdg8 on Mariana's calendar, saved to
  sessions.google_event_id (af8fd900).

### 2026-10-19 (pm) — #80 payment rule v2 + #78 /cierre (executor, 6fcca4d, cc4f847)
- **#80:** `proofReconcile.mjs#decideAutoReconcile` now also auto-applies **exactly 4 × tarifa** for ONE group patient →
  marks the unpaid sessions it covers (oldest first, ≤4, each must cost the tarifa) + the rest as a `package` lote @tarifa
  stamped `aprobado_at` (no `aprobado_por`, note "Paquete 4 × tarifa (regla #80)") — the only automatic lote. Two group
  patients matching 4×tarifa → held `payer_ambiguous`. Exact tarifa path unchanged. Harness 42/42.
- **Not done on purpose:** `consume_saldo_on_confirm` NOT switched to approved-only (#80 step 3) — Nicolás reviews every
  existing credit by hand first (his call, 19 Oct); switching now would freeze in-progress packages (all lotes aprobado_at null).
- **#79 cancelled by Nicolás** (he reviews the credits himself). Nothing changed; backup table `saldo_lotes_backup_20261019`
  (35 rows, $1,195) left in place. Observations for him: package lotes are @35 but sessions are $39 → the trigger draws $39
  per session (a 4-pack lasts ~3.6 sessions); Andrea Torres' lote lost $39 to a cancelled session (shows $23, 2 sessions left).
- **#78:** cause = session launched from `~` instead of `~/my-site` (project commands only load from the launch folder);
  files fine. cierre.md step 5 now requires reflecting decisions/live-state in the Drive TO-DO.
- **Brief gap (07:51 routine trig_014bnWaSpPv3quC8YPHZWqGS):** its credit list filters `proof_id is not null` → misses the 4
  open hand-made/backfill lotes (Daniel Granja $35, Fátima Tubon $60, Ramesvary $31, Samantha Aldaz $48) and caps at ~15 lines.
  Not edited from here (112 KB job_config, partial update could drop its tools) → director to fix.

### 2026-10-19 — #77 Comprobantes: auto only at exact tarifa · #76 Shariam 2 facturas (executor, a1214ef)
- **#76 data:** patient b2135479 "Sharian Narvaez" → Shariam Alexandra Narváez Celi, cédula 1722319439, +593995879307,
  email null, payer 4d0597f1 (herself), obligatoria + concepto_general, facturar_desde 2026-10-01. Session cdb9ad8f
  12 Oct → **14 Oct** 16:00 (Calendar event oenue1uecvppljr9ida0h6co1k updated via calendar fn).
- **#76 emitted (emit-one, Nicolás chat 19 Oct):** **001-001-000000323** (Shariam 14 Oct $39, cf 0yelnAYAwI3z7bER) +
  **324** (Marthin 16 Oct $39, cf LmavAO2XQhPyXe3N), both billed to Shariam 1722319439, concepto general. RIDEs sent
  via send-rides to …9307, both `delivered`. factura_aprobaciones cf4e61fb (origen chat, "extraordinaria 19 Oct, aprobado por Nicolás").
- **#77 rule** (see CLAUDE.md "Comprobantes"): `decideAutoReconcile(proof, ex, group)` = the only automatic path (amount ==
  tarifa ±0.005 of any group patient with an unpaid session → that oldest session, must cost that amount). Old logic
  renamed `proposeAllocation` → stored in `whatsapp_messages.propuesta` for held receipts; one `notifyOwner`
  `comprobante_pendiente` (replaces the comprobante_sin_identificar template alert). `approveProof` + new fn
  `proof-approve` (owner bearer) → same `applyPlan`; lotes stamped `aprobado_por/aprobado_at`. `saldo.mjs#loteAprobado`
  (aprobado_at OR proof_id null) filters credit in reminders, proposals and FIFO draws. Group now also includes
  patients whose telefono = sender. Migration `supabase/comprobantes-tarifa-exacta-77.sql` (additive).
- **Left alone on purpose:** DB trigger `consume_saldo_on_confirm` still spends ALL lotes (in-progress auto packages —
  Catalina, Emily, Juan Carlos, Andrea — depend on it). Changing it = Nicolás's audit decision.
- Harness `node scripts/harness-comprobantes-77.mjs` 37/37 (fake DB, nothing sent).

### 2026-10-13 — #72 Facturación automática Mon+Thu + 4 facturas aprobadas en chat (executor, ec57bb8)
- **Emitted (approved by Nicolás in chat 13 Oct)** via emit-one: 001-001-000000315 Mila 6 Oct $32 (Sébastien
  Paque, concepto general) · 316 Cecilia Saltos 8 Oct $39 (Dorian Solís) · 317 Raguel Conforme 9 Oct $36 (Laura
  Vásquez) · 318 Cinthya Pérez 9 Oct $36. Snapshot 635734b1 (cron, 12 Oct) → aprobada, `resultado.nota`
  "aprobado en chat 13 Oct" + emitidas. Its queued owner_outbox list (9c58b2fb) → fallido so the stale
  Aprobar list never reaches him. RIDEs via factura-rides-sweep.
- **Auto mode** (`netlify/lib/facturarAprobacion.mjs#runAuto`): facturar-report → `runReport` → runAuto('auto'):
  same dryRun eligibility, overlap guard (an `en_curso` run < 15 min → skip), log row inserted first
  (estado aprobada, `resultado.en_curso`), per-session re-check (still pagado/confirmada/not facturada) right
  before emitOne, try/catch per item → `fallidas`; then ONE `notifyOwner` kind `facturas_emitidas` (text only,
  split at ~3800 chars). Nothing ready/blocked/en espera → nothing sent.
- **"facturas"** → webhook fires `facturar-aprobar-background` with `{comando:true}` → `handleFacturasCommand`
  = runAuto('comando') + direct reply (emission is long, kept off the webhook). Legacy fac_ok/fac_no taps still
  resolve old lists (`runAprobacion`/`handleDescartar`); `prepareFacturas` (list + buttons) removed.
- `/facturar?mode=auto-preview` = runAuto preview (zero Contífico calls, no log, no send) → the exact message.
- **Migration** `supabase/factura-aprobaciones-auto.sql`: origen check += `'auto'`.
- Preview 13 Oct for Thu 15 Oct: Emilie Conforme 3 Oct $36 + Valentina Loor 9 Oct $39 (+ whatever gets paid
  by then); Mauro Baquero en espera (8).

### 2026-10-08 — #69 Fuga de atribución: cada llamada/paciente ligado a su lead + Meta (executor, e417b7a)
- **Link carries the lead:** `leadBot.mjs#freeCallLink(therapistId, lead.id)` → `/agendar?terapeuta=…&l=<lead id>` (copy unchanged).
  `PublicBooking.jsx` sends `lead_id`; `public-booking.mjs` validates it (uuid, exists); `booking.mjs#createBooking({leadId})` →
  `leadLinker.mjs#linkLeadById` even when the typed phone differs. Real booking never links an es_prueba lead; a lead
  link to the owner's TEST lead while modo prueba is active makes the booking `prueba` (any typed phone). `reiniciar`
  now also cancels [PRUEBA] llamadas tied by the test lead's `session_id`.
- **Linker** `netlify/lib/leadLinker.mjs#runLeadLinker` (step L in `lead-followups`, last 8 days, before CAPI; backfill
  `node scripts/link-leads-69.mjs [--apply] [since]`): llamadas + each patient's first real session with no lead; match
  (1) last-9, (2) lead active (first_at or inbound msg) ≤72 h before booking with phone OSA distance ≤2 (national digits),
  (3) same window + WA profile name = first name + one more token. Unique only; ambiguous/none logged. Fills ONLY null
  `patient_id/session_id/agendo_at` (agendo_at = session.created_at); **never `stage`** — lead-followups B/C/D message
  by stage, so linking can't change what a lead receives. Lead tied to another patient → skipped. Harness `scripts/harness-linker-69.mjs`.
- **Backfill (since 1 Oct):** Wolfgang Armas → lead +593963158790 (phone typo), Gissela Morales → lead +593984287059
  (2 digits swapped) — both QualifiedLead **200** on 9 Oct 02:15 UTC (event_time = booking time). Nikole Estrella: existing
  patient since June, no lead row (not an ad lead). Génesis Taco (llamada + 1st session): no WhatsApp from her number or
  name in the 72 h before → no match. Valeria Salazar / Marthina: linked, organic (no ctwa_clid) → nothing to Meta.
  Ronnal Pasquel: already sent 8 Oct.
- **Source:** trigger `trg_leads_source_from_clid` (BEFORE insert/update) + `recordLead` patch → ctwa_clid ⇒ source
  `meta_ctwa`; backfilled (0 mismatches left). Migration `lead_attribution_69` = `supabase/lead-attribution-69.sql`.
- **Views:** `funnel_v` now ALL non-test leads + `source` + `meta_tag` (appended columns); new `campaign_results_v`
  (per GYE day: llamadas_agendadas, primeras_sesiones by booking day, primeras_pagadas by paid_at; [PRUEBA] excluded;
  security_invoker; granted authenticated + service_role). Marketing module already counted all sources — no change.
- **CAPI** (`capi.mjs`): QualifiedLead event_time = agendo_at; QualifiedLead/Purchase >7 days → `stale`, skipped, not
  stamped. ph-only path (`user_data.ph` = sha256 E.164 digits) behind `CAPI_PH_ONLY=true` — **OFF**: one Test Events try
  (`capi-admin?action=test-ph`, code TEST52701) → 400 subcode 2804069 "Missing Page ID" (business_messaging/whatsapp
  without ctwa_clid needs `page_id` in user_data).

### 2026-10-08 — #66 Texto de cada envío del bot + vista funnel_v (executor, e29b64f)
- Table `lead_bot_sends` (migration `lead_bot_sends_66` = `supabase/lead-bot-sends-66.sql`, owner-only RLS, #62 grants).
  Logged from `leadBot.mjs` (text/question/cards/link, +22h nudge as text, recordatorio_llamada/primera_sesion/
  rebook_llamada as template — base name, a `_v2` swap is not recorded). `resultado_llamada` (therapist) not logged.
- View `funnel_v` (migration `funnel_v_66` = `supabase/funnel-v-66.sql`): 72 ad leads at ship time. `silent_turns`
  counts turns (distinct processed_at) and only after logging began; older leads show bot_sends 0.
- Harness `scripts/harness-sendlog-66.mjs`: wamid + es_prueba logged, failed send re-thrown, slow/failing DB = 0 ms delay.
- `botSendLog.mjs`: `loggedSend` (wraps a send), `logBotSend` (fire-and-forget insert into a module-level pending Set),
  `flushBotSendLogs(3000)` called at the end of `runBot`, after the rebook in `handleTherapistResult`, and before CAPI in
  `lead-followups`. The table was empty at close: no bot send since the deploy (deploy 6ac7ee00, ready).

### 2026-10-08 — #62 Bot silencioso por #59 (executor, 4b87b4e + ed4b2ab)
- **Cause (exact):** `lead_inbox` (#59, `supabase/lead-funnel-12-turnos.sql`) was created with NO table grants →
  `service_role` had only TRUNCATE/REFERENCES/TRIGGER → every `enqueueInbound` upsert failed with Postgres
  **"permission denied for table lead_inbox"** (postgres_logs) → the webhook's catch logged "lead handling failed" and
  nothing reached runBot. 0 rows ever; no lead_ai_decisions from 7 Oct 12:57 GYE until the fix. #58 not involved.
- **Fix:** migration `lead_inbox_grants_62` = `supabase/lead-inbox-grants-62.sql` (grant s/i/u/d to service_role +
  authenticated; RLS is_owner unchanged). Verified as service_role: 2 inserts 2 s apart + a duplicate wamid (ignored)
  → claimed together in ONE turn (rolled back).
- **Fallback (permanent):** `leadTurns.mjs#logInboxError`; if `enqueueInbound` throws, the webhook logs console +
  `lead_ai_decisions` motivo **`inbox_error`** (error in `reply`) and wakes `lead-reply-background` with
  `{phone, msg, isNew, direct:true}` → plain `runBot({msg})` (pre-#59 path, no merge). Same for a legacy body whose
  enqueue fails. The queue can never silence the bot again.
- CLAUDE.md gotcha added: new tables need explicit GRANTs. The 10 unanswered leads were NOT messaged (Nicolás answered by hand).

### 2026-10-08 — #61 Recordatorios de pago al pagador (executor, 375b5c4)
- **`paymentReminders.mjs` Option B (Nicolás 8 Oct):** patient with `payer_id` and a payer `telefono` that normalizes →
  reminder to the PAYER, `{{1}}` = payer first name, `{{3}}` names the patient (`buildMinorSesionesText`: the child
  `nombre_2` for a menor, `nombre` for an adult; "tu sesión" when the payer is the same adult — same phone + first name,
  e.g. Laura Vásquez). No valid payer phone (Dorian Solis) → patient as before. Report entries gain
  `patientLabel`, `recipient` ('payer'|'patient'), `payer_id`. Appointment reminders untouched (always the patient).
- **`proofReconcile.mjs`:** `proofPatientGroup(proof, payers, payerPatients)` = matched patient + all patients whose
  payer's phone is the sender. One owing → proof attributed to that patient (stamp also writes `whatsapp_messages.patient_id`);
  several owing → pooled oldest-first, credit ignored, only an exact `mark` is automatic; anything that would bank a lote
  → withhold `payer_ambiguous` (alert "pago de un pagador con varios pacientes pendientes"). Group of one = unchanged.
- Harness (scratch, fake DB, nothing sent): Sébastien +593985506258 $32 → marks Mila's 6 Oct; Laura $36 → Emilie;
  Laura $72 with 2 owing → both; $140 with 2 owing → held. Prod proofs-run dry: Sébastien's real 7 Oct $32 proof
  (f1c247f9, was "unmatched") now → mark Mila 6 Oct.
- **Data:** Mila (770ba3dc) telefono "985506380" → "+593985506380" (Raquel's).

## Pending / Backlog

### 🔥 Next (director picks up) — surfaced 2026-10-04
- [ ] **Brief fix (director):** routine trig_014bnWaSpPv3quC8YPHZWqGS item 2 → `remaining > 0 and aprobado_at is null`
      (drop `proof_id is not null`), list every credit one per line, no ~15-line cap for that list.
- [ ] **Nicolás approves/corrects the paused lotes (#81 C)** — Catalina + Fátima first (sessions 22 Oct). Correct the 5
      wrong-price lotes (Andrea +47, Juan Carlos +8, Catalina +4, Emily +4, Ramesvary +4) before approving them.
- [ ] **⚠️ Push to `main` no longer auto-deploys** (21 Oct: 3 pushes, live stayed on 57b8d95). Deployed via the Netlify
      connector `deploy-site` → `npx @netlify/mcp … --site-id f8418788…` (needs `npm_config_cache=<scratchpad>`: ~/.npm has
      root-owned files → EEXIST). Check the GitHub→Netlify build hook in the dashboard (Nicolás) or keep using the connector.
- [ ] Felipe y Mafer is `tipo_paciente='individual'` but is a couple (session 20 Oct tipo pareja) — ask Nicolás.
- [ ] **#77 audit — Nicolás decides each automatic lote by hand** (27 rows with proof_id; list in the 19 Oct report). Biggest:
      4 prepay lotes on **Mariana Villegas Kraemer** ($35+30+36+35 = $136 open — receipts from her phone, likely patients'
      forwarded receipts mis-banked), Diana Marcial $90, Gabriela Acosta $70, Raguel $72+$36, Shariam(Marthin) $1, Luna $1.
      (#81 A: Mariana's number is now always held.) ⚠️ **Shariam $76 prepay lote 48db0abf (frozen by #81 C — safe) (20:00 UTC 19 Oct, last run of the OLD code):** her $76 receipt (ref 70167537)
      for 14+16 Oct arrived after Nicolás had marked both paid by hand → banked as phantom credit (+ her old $1). No
      sessions scheduled yet; the confirm-trigger WILL spend it on her next 2 sessions. Likely fix: remaining→0 on both.
      Approve = set aprobado_at; reject = remaining→0 + mark the right sessions by hand.
- [ ] **#77 first live held receipt** — check its `propuesta`, the owner message, and "Aprobar propuesta" in the panel.
- [ ] **#69 live proof (Nicolás's phone):** "modo prueba" → write as lead → pick therapist → bot link must contain `&l=`
      → book with a DIFFERENT phone → check the test lead gets session_id/agendo_at, booking notas "[PRUEBA]", no CAPI
      → "reiniciar" (cancels that llamada) → "fin prueba".
- [ ] **#69 patient phones to fix by hand (not changed):** Wolfgang Danilo Armas Tipan +59363158790 → WhatsApp +593963158790;
      Gissela Morales +593987284059 → WhatsApp +593984287059.
- [ ] **#69 ph-only CAPI:** Meta wants `page_id` for whatsapp events without ctwa_clid. Decide whether to test ph + page_id
      (the FB page linked to the WABA) once in Test Events; if accepted, add it and set `CAPI_PH_ONLY=true`.
- [ ] **#66 live proof** — (a) Nicolás: "modo prueba" → "cuánto cuesta" → "reiniciar" → "fin prueba"; then check
      `lead_bot_sends` rows es_prueba=true with a wamid that appears in `whatsapp_delivery_status`. (b) First real ad lead
      after e29b64f: its sends have a wamid, `select * from funnel_v` shows it; report 3 sample rows (phone last 4 only).
- [ ] **#62 proof with a real lead message** — Nicolás: "modo prueba" → write as a lead → bot answers; check a `lead_inbox` row gets `processed_at`.
- [ ] **#61 bad phones (listed, not changed):** normalizePhone → null: Cristina Gomez, Maria Emilia Buitron, Andres Luzuriaga (hidden U+202A/202C marks), Daniel y Daniela ("8"), Michelle Tinajero ("9"). Malformed EC: Connie Ayala, Ana Belén Quisiguiña, Noeleen Rodriguez (+5930…), Sophia Chica, Stefanny Lopez, Fátima Tubon (+59398067281), Maria de Lourdes Altamirano, Amparito Vargas (8-digit mobiles).
- [ ] **#61 Dorian Solis (payer of Cecília + Elena Saltos) has no phone** → their payment reminders still go to the patient.
- [ ] **#60 Mauro Baquero en espera** (8 paid, all pre-floor): when his insurer's diagnosis arrives → set diagnóstico, untoggle "Facturación en espera" AND set `facturar_desde` to his first session to back-invoice.
- [ ] **#60 Mila (Sébastien Paque):** 6 Oct invoiced 13 Oct (315, #72); future insured sessions go out automatically Mon+Thu in concepto-general format once paid.
- [ ] **#72 Cecilia/Valentina patient records** — separate item pending Nicolás; records NOT touched. ⚠️ Valentina Loor 9 Oct ($39, payer Dorian Solís) is in Thursday 15 Oct's auto run (auto-preview) — if her record must change first, set "Facturación en espera" before 09:00 Thu.
- [ ] **#55 decide (Nicolás):** lead-facing lines still naming a team/third person — see the #55 TO-DO entry (urgente fallback, "Escríbenos", "Att: Nico" templates).
- [ ] **#56 live test (Nicolás, his own phone):** "modo prueba" → write as a lead → "reiniciar" to start over → "fin prueba".
- [ ] **#54 real test (now doable from his own phone via #56 modo prueba):** price prefill → si → para mí → ansiedad → name → link → book → check `leads.agendo_at`.
- [ ] "Lead atascado en el inicio" push fires on the 3rd message even when the lead IS advancing (pre-existing; seen in the #54 sim) — tune `maybeStuckPush`.
- [ ] **#53** — 3 patients didn't get "Mariana retoma" (Diana Romero 131049, Luna Guamán + Emily Rivera 131026) → Nicolás
      sends by hand / fixes their phones. Broadcast 4e56df3a closes itself ~21:46 UTC 5 Oct (estado enviado + one owner notice).
- [ ] **`sesion_pendiente` approved as MARKETING** (#52 code wants UTILITY) — Nicolás decides: accept (change category in
      STAFF_TEMPLATES) or resubmit as UTILITY.
- [ ] **#41 templates _v2** — submitted, auto-switch live (f87944f). Done once all 4 `_v2` APPROVED. Decide:
      `primera_sesion_v2` reclassified MARKETING (ask Nicolás; accepting = change its category in TEMPLATES_V2).
      Later: delete the v1 templates only after 7 days with no v1 sends.
- [ ] **A Stutz never delivered** ("En preparación", $0 since 1 Oct) — 12 unpublished drafts in Ads Manager. Director decides.
- [ ] **Card cap 3 vs hijo_adolescente (4) / hijo_adulto (5)** — confirm with Nicolás whether to show all.
- [ ] **#38 Drop the 4 unused functions** (SQL in the 2026-10-04 Completed entry) + add the key policy to CLAUDE.md.

### 🟠 Payroll Sep (#48) — follow-ups
- [ ] **María Gracia delivery** — her 3 payroll messages were "sent" not "delivered" at 19:05 UTC 5 Oct; re-check
      `whatsapp_delivery_status` for her wamids (payroll_runs.detalle.wamids). Failed → resend via payroll-send.
- [ ] **Carolina v2 PDF ($828)** — Nicolás sends it himself (Paula 30/09 cancelled); her invoice should be $828.
- [ ] **Invoices to Mariana** — when each therapist sends theirs, set payroll_runs.estado='factura_recibida'.
- [ ] **Monthly protocol** — turn #48 into a repeatable /nomina flow (payrollCopy.mjs + payroll-send + payroll_runs).
      Payroll = confirmed non-llamada sessions ONLY; llamadas never appear in the payroll conversation.

### 🔴 Contífico / invoicing follow-ups — surfaced 2026-10-02→04
- [x] **#16 first live run Mon 5 Oct** — done: "facturas" 15:10 UTC, Aprobar 17:56, 1 emitted; its RIDE was
      still unauthorized at the end of the run → now handled by the #47 sweep.
- [ ] **Worm FAC 001-001-000000303 unsigned** (#47) — at 18:30 UTC 5 Oct Contífico showed firmado=false,
      autorizacion null. The sweep sends it once authorized; if still unauthorized Wed 7 Oct ~18:00 UTC
      Nicolás gets the one SRI alert → check Contífico (re-submit `PUT /documento/<id>/sri/` manually).
- [ ] **ping_nico RECLASSIFIED MARKETING** (#45, seen 5 Oct 20:30 UTC: PENDING/MARKETING) — owner outbox falls back
      to push while his window is closed (affects facturar-report + #52 escalations). Nicolás decides; don't edit copy.
- [ ] **sesion_pendiente review** (#52, id 1751621786066092, PENDING/UTILITY) — check `?list`. Reclassified/rejected →
      report verbatim, don't change copy. Until APPROVED, closed-window therapists get a push instead.
- [ ] **#52 first run Tue 6 Oct 08:30** — check `session_estado_reminders` + function log; Sophia's 2 Oct should be sent.
- [ ] **Raguel Conforme 12 Sep** (paid, never invoiced) — skipped on Nicolás's instruction 2026-10-03; invoice with
      `emit-one&before_floor=1` if he asks.
- [ ] **Factura WhatsApp copy** — Nicolás doesn't love `factura_sesion_link`'s wording. If he sends new copy:
      new template name (re-approval), keep the old one until approved; show him the copy BEFORE submitting.
- [ ] **Lock 3 Netlify vars as secret** (Nicolás, dashboard): VAPID_PRIVATE_KEY, LEAD_TOOLS_TOKEN,
      WA_CLOUD_VERIFY_TOKEN — the connector can't flip `is_secret` on existing vars.
- [ ] **Delete the orphan draft FAC 001-001-000000292** in Contífico (id `y7aA5E2lMiP1YagZ`, Laura
      Vásquez, $36, fecha 25/09/2026, estado P, NEVER authorized). Created by the first emit attempt,
      which the SRI rejected (cod 1017 — fecha must be today). The session was re-invoiced correctly
      as **293**. The function has no delete mode; remove it by hand in Contífico (or add a guarded
      `DELETE /documento/<id>/` mode). Leaves a gap at 292 — fine, it was never sent to the SRI.

### Lead bot — surfaced 2026-09-26/27
- [x] ~~Second "not a lead" bug: outbound-first senders + payment receipts greeted as leads~~ — **FIXED
      2026-10-01** (Opus 4.8). Echoes now stored as `outbound` whatsapp_messages rows; `recordLead` skips when
      we messaged first; images/PDFs bypass the funnel (→ comprobante flow #2); unknown-number receipt alert
      reworded. Migration `whatsapp-messages-outbound-to-idx.sql`. See top of Completed Features. **Awaiting
      Nicolás's two manual phone tests** (reset number 593968029896 is clean-slated).
- [x] ~~Booking intents misclassified as `saludo` (repeated greetings, 8h silence)~~ — **FIXED 2026-10-01**
      (Opus 4.8). Deterministic named-therapist + `agendar` layer before the model; `saludo` tightened; greeting
      unified + sent once; dedup + 3 safety-net pushes to Nicolás. Migration `lead-funnel-07-greeting-dedup.sql`.
      See top of Completed Features.
- [x] ~~Burst/dedup follow-up: rapid multi-message bursts each spawn their own delayed reply~~ — **DONE
      2026-10-01** (Opus 4.8). Per-lead coalesce in `lead-reply-background.mjs` (only the last msg replies, to the
      combined burst) + delay tightened to ~20s (wait shaved by the classify budget). See top of Completed Features.
- [x] ~~#24 + #27 funnel v2~~ — DONE 2026-09-27 (`fdf9f67`/`8574b58`/`115063f`/`80025d6`); #30 history fix
      2026-09-27 (`9284328`). All in Completed Features.
- [x] ~~#22 Meta Conversions API~~ — **SHIPPED & LIVE 2026-09-27** (`5d7c02c`). See Completed Features.
- [ ] **#22 manual follow-ups (surfaced 2026-09-27; campaign now LIVE 2026-10-01):**
  - [x] ~~**Set the campaign performance goal for leads** in Ads Manager~~ — **DONE 2026-10-01** via the new
    `Embudo v2 · QL` campaign (see top of Completed Features). NOTE: on WhatsApp conversion location there is **no
    explicit `QualifiedLead` event picker** — it uses "Maximizar el número de clientes potenciales" (messaging/CAPI).
  - **Cheap real test STILL pending (now in motion):** the `Embudo v2 · QL` campaign is live, so real ad-clicks
    will start flowing. Confirm `QualifiedLead` fires in Events Manager (dataset `1131866282506788`) once a lead
    books — **as of #34 (2026-10-02) this now includes leads booked by hand from the panel**, not only bot bookings
    (`trg_lead_link_from_session` stamps `agendo_at` on any llamada write). For his own phone set
    `CAPI_ALLOW_TEST_PHONE=true` first (else the test phone is excluded).
  - **Manual "lands in Test Events" recipe** (needs the Events Manager **test code**): either (a) one-shot
    `GET capi-admin?action=test-event&event=QualifiedLead&clid=<real ctwa_clid>&code=<TESTxxxx>&token=<WA_CLOUD_VERIFY_TOKEN>`
    (shows regardless of clid validity); or (b) full path: set `CAPI_TEST_CODE=<TESTxxxx>` (⚠️ reroutes ALL events
    to Test Events while set) + `CAPI_ALLOW_TEST_PHONE=true`, click a real ad, pause bot, book by hand, `?action=sweep`.
    Clear both env vars after.
  - **Fix ad account timezone?** `2663225010700511` is on "Hora de Colombo" (GMT+5:30), not Ecuador — skews daily
    budget resets + reporting. Changing it after spend is disruptive (resets learning); decide whether it's worth it.
- [x] ~~Get real phone numbers for the 4 therapists still `telefono IS NULL`~~ — **DONE** (#26, 2026-09-27):
      Camila, Daniela, Ma. Gracia, Sophia numbers saved in `therapists.telefono`. All 7 now have a number.
- [ ] **#27 follow-ups (surfaced 2026-09-27, none blocking):**
  - [x] ~~Tighten the felt delay (~25s because the sleep ran before the Claude call)~~ — **DONE 2026-10-01**:
    wait shaved by the classify budget in `lead-reply-background.mjs` → Claude path lands ~20s. See Completed Features.
  - **Package answer copy (surfaced #30):** "¿el paquete se paga por adelantado?" classifies as fixed `pago`
    intent → generic canned copy ("recordatorio 2 días *después*", single-session flow); packages are PREPAID.
    Add a package line or `pago_paquete` intent in `leadBrain.mjs`/`CANNED`. Low pri — Nicolás supervises leads.
  - [x] ~~Burst debounce (surfaced #30): rapid texts each spawn their own reply, no cross-msg dedup~~ — **DONE
    2026-10-01**: per-lead coalesce in `lead-reply-background.mjs` collapses a burst into one reply (last msg wins,
    answers the combined text). Not yet seen against a real multi-text burst in prod — watch the next live burst.
  - [x] ~~Routing (`funnel_categorias`) is PROVISIONAL~~ — **DONE 2026-09-28 (#4b)**: final ordered lists from
    the Mapa de casos, all 7 categories. See Completed Features.
  - Enrich the `seguros` fact sheet as #14 (insurer catalogue) advances; Saludsa/Ecuasanitas % still "según plan".
  - Cost: each free-text msg = 1 Sonnet call (temp 0, ~2.5–4.5s). Fine at volume; consider Haiku if it spikes.
- [ ] **Cards v2 follow-ups (surfaced 2026-09-28, none blocking):**
  - **Carolina's photo carries a Google Photos AI-edit watermark** (small four-pointed sparkle, bottom-right).
    The v1 face-crop cut it off; showing the photo whole brings it into frame. Ask her for a clean export,
    drop it in `~/Downloads` under the same name, re-run `node scripts/build-cards.mjs`.
  - **Carolina 1:1.71 and Sophia 1:1.65 are tall for a WhatsApp bubble.** Past ~1:1.7 WhatsApp can centre-crop
    the preview and clip the name strip. Nicolás saw them on his phone and they were fine — revisit only if it
    ever clips. Capping height without cropping the photo means side margins, so don't do it pre-emptively.
  - **María Gracia's source photo is the smallest (738×923)** and is upscaled ~1.2× at full card width. Holds
    up, but a larger original would be better if one exists.
- [ ] **14-day funnel check — Sat 10 Oct 2026:** lead→call vs the 8% baseline, target ≥25% (exclude test
      phone `593968029896`). If the answer-first opening moved it, keep; else revisit copy/routing.

> ✅ /facturar REST rewrite (09-23) + DualHook cutover (09-22) — done; records in `CHANGELOG.md`.

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
- [ ] **`contifico_id` is a marker (= core cédula), not the real Contífico persona id.** Fine for the
      cédula-based persona lookup in the API (`cliente.cedula`); upgrade to the real id only if needed.

### Payer / billing model follow-ups (surfaced 2026-09-22, after the `payers` foundation)
- [ ] **Owner UI to manage billing fields.** `payer_id` and `facturacion_obligatoria` are deliberately
      NOT in `PATIENT_COLUMNS` (not writable via the Pacientes form) — they're DB/owner-tooling only for
      now. Build an owner-only control to assign a patient's payer and toggle `facturacion_obligatoria`.
- [ ] **Confirm Washington Andrade's WhatsApp** — his payer `telefono` was assumed = Valentina Andrade's
      `+593992738962` (per Nicolás 2026-09-22). Verify it's actually the number comprobantes arrive from.
- [ ] **Data oddity:** Laura Vásquez (payer + patient) and Emilie Conforme share cédula `1718240995001`.
      Fine for now; revisit if it breaks a per-cédula Persona lookup when invoicing the trio.
- [ ] Diagnóstico fields (`diagnostico_codigo`/`diagnostico_texto`, CIE-10 labelled) live ONLY in the
      Pacientes → Configuración edit form. The inline create-patient drawer doesn't set them — add there
      if therapists want to record a diagnosis at registration (minor).

### Immediate — next session
- [ ] **Lead funnel polish (surfaced 2026-09-26, all non-blocking — bot is LIVE).**
      (a) `classifyFreeText` in `leadBot.mjs` returned null for free text — the `claude-haiku-4-5` model id
      on APIMart is likely wrong/unavailable; pick a working id (see `proofOcr.mjs` uses `claude-opus-4-8`).
      Falls back gracefully today (re-shows menu → escalates to Nicolás), so leads aren't stranded.
      (b) Chase Meta approval for `resultado_llamada` / `rebook_llamada` / `primera_sesion` (the follow-up
      sends stay dormant until approved; `recordatorio_llamada` already APPROVED). (c) Optional: a per-lead
      "pausar bot" toggle in Marketing → Embudo (the echo pause covers manual takeover, so this is nice-to-have).
- [ ] **Cancel the Twilio paid subscription — Nicolás cancelling (decided 2026-09-23).** Reminders +
      delivery all run on Dualhook, re-verified working 09-23. Cancelling also **moots the Content-SID
      exposure** in git history. After cancel, optionally delete `TWILIO_*` Netlify env vars +
      `sendWhatsAppReminder`/`twilio-webhook.mjs` (the `REMINDERS_PROVIDER=twilio` rollback dies with
      the subscription — acceptable, Dualhook is proven).
- [ ] **Billing automation — remaining pieces (surfaced 2026-09-25; updated 09-26).** Reminders, comprobante
      auto-mark, comprobante warning alert, and #19 saldo a favor are all LIVE (see Completed Features); left:
      - **"En mora" Finanzas card + daily `resumen_en_mora` WhatsApp to Nicolás** — both wait on the
        `resumen_en_mora` template APPROVING at Meta (id `4657291211223040`, PENDING as of 09-25).
      - ~~**#19 remaining wiring**~~ — ✅ **DONE 2026-09-25** (commit `5ee272e`): proofReconcile does
        $140→package lote / overpayment→surplus lote / no-debt→prepay lote / match-net-of-credit + consume;
        paymentReminders asks net-of-credit. A new package is now recorded automatically from a $140
        comprobante (no more manual `saldo_lotes` row). See Completed Features.
      - ~~**`DROP COLUMN sessions.package_anchor`**~~ — ✅ **DONE 2026-09-25** (commit `5566b0e`, migration
        `drop_sessions_package_anchor`).
      - **Possible future tweak (not shipped):** package/settle consumption is POOL-based (draws session
        `monto`), so a $140 pack covers 4 sessions only at $35 tarifa. Switch trigger+settle to consume
        `price_per_session` if a pack should always = 4 sessions regardless of tarifa. Decide when it matters.
      - **Camila Mena rate discrepancy:** session recorded at $39 but her mom (Karina Almache) paid $35 —
        sitting HELD in Comprobantes. Nicolás to reconcile the tarifa vs. the sent amount.
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
