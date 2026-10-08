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

### 2026-10-07 — #60 Facturación en espera + concepto general + 9 facturas (executor, f184057)
- **Migration** `supabase/patients-facturacion-espera-concepto.sql` (additive): `patients.facturacion_en_espera`,
  `patients.factura_concepto_general` (bool, default false); `factura_aprobaciones.origen` now allows `'chat'`.
- **En espera:** `facturarCore#fetchEligible` filters `patient.facturacion_en_espera=false`; `fetchEnEspera()` (obligatoria
  AND en_espera, count of paid/uninvoiced/non-llamada sessions, **no floor**) → `dryRun().enEspera` → `prepareFacturas`
  adds "En espera: {name} ({n} sesiones)" lines (never in the snapshot); `runReport` also notifies when only en-espera
  exists; HTTP dry-run shows `en_espera`. Lifting a hold on pre-floor sessions also needs `patients.facturar_desde`.
- **Concepto general:** `buildDescripcion` → "Sesión Psicológica Individual | Sesión {fecha}" (no patient, no CIE);
  billing still the payer. The RIDE WhatsApp still names the patient to the payer ("la sesión de Mila…").
- Both flags: owner-only Toggles in Pacientes → Configuración; in PATIENT_SELECT + PATIENT_COLUMNS.
- **Data:** Mauro Baquero obligatoria + en_espera (8 paid sessions, all pre-floor). Marthin Spatz concepto_general,
  facturar_desde 2026-07-29. Mila: new payer Sébastien Paque (1004438295, +593985506258, sebpaque@gmail.com),
  obligatoria + concepto_general, facturar_desde 2026-09-15 (6 Oct unpaid → normal list). Thomas Quevedo
  facturar_desde 2026-08-14. (facturar_desde = how the floor is lifted per patient so the RIDE sweep sends them.)
- **Emitted via emit-one:** 001-001-000000304..306 (Gabriela, $35×3), 307..309 (Shariam, $39×3), 310..312
  (Sébastien, $39/$32/$32). Logged `factura_aprobaciones` 272d6249… origen chat, $325. RIDEs via factura-rides-sweep.
- Not emitted (outside #60, ready for Thursday's list): Valentina Loor 2 Oct, Cinthya Perez 3 Oct.

### 2026-10-07 — #59 Turnos coherentes + terapia familiar (executor, 5d5c3e3)
Evidence: lead +59398590… sent "atienden terapia para 16 años manejo de ira ?" + "O terapias familiares ?" 2 s apart →
two PARALLEL turns: question + cards in turn 1; turn 2 repeated adolescentes and answered FAMILY with the COUPLES canned.
- **MERGE + LOCK** (`netlify/lib/leadTurns.mjs`): the webhook queues every free-text/media inbound in **`lead_inbox`**
  (`enqueueInbound`, unique wamid) and wakes `lead-reply-background` with `{phone, leadId}`; `processInbox` waits until
  `QUIET_MS`=4 s pass with no new inbound from that lead, takes the **`leads.turn_lock_at`** lock (stale after 2 min),
  claims ALL unanswered rows and calls `runBot({msgs})` → `mergeMessages` joins texts with `\n` (audio/unsupported win).
  Losers exit; the holder loops back for messages that arrived during its turn. Taps stay inline. Replaces #54's "no delay".
- **ONE REPLY PER TURN** (`leadBot.mjs` `beginTurn`/`endTurn`): every send in a turn is buffered; `endTurn` sends texts
  in order then AT MOST ONE tail: link > one card block > one question (`question()` keeps the first only; `ask`,
  `showQuien`, `askPending` go through it). Card requests merge: card-ending CANNED first (their bubble introduces the
  block), then the rest in order, no dups, max 4. Greeting eligibility is snapshotted at turn start (`lead.__mayGreet`).
- CANNED `adolescentes`: the sentence "Deseas ver sus perfiles?" is now a `question` field — dropped when the turn shows
  cards, otherwise re-joined into the original single bubble. Its categoria is now `hijo_adolescente`, so "si" → cards
  (was the age question). In a card turn its profiles (hijo_adolescente) join the block.
- **NO REPEATS:** `leads.canned_enviados text[]`; sent to Claude as "YA RESPONDIDO" (re-tag only if asked again in the
  current message); `sendCanned` (chooseQuien pareja) skips an answer already sent. Duplicate intents in a turn are deduped.
- **FAMILY:** CANNED `familia` (end cards, `noIntro`, categoria `terapia_familiar`); `funnel_categorias` row
  `terapia_familiar` = [Carolina, Francisco]; leadBrain intent `familia`, `pareja` only for couples; max intents 3→4;
  keyword fallback catches "familia/familiar". `mapaCasos.json` familias → Carolina ★, Francisco ★.
- Migration `supabase/lead-funnel-12-turnos.sql` (applied via execute_sql — `apply_migration` errored "Invalid or
  expired requestState"). Dry-run scenarios 22–26 added to `leadBotSim.mjs` (parallel groups use the real inbox path
  with a 4 s quiet; sequential steps quiet 0). Real-Claude dry run: all VERIFY cases pass, 1–21 unchanged, 0 silences.

### 2026-10-07 — #58 "Mensaje no disponible" → handoff silencioso a Nicolás (executor, e441d2f)
- ~1.4% of inbounds arrive `message.type='unsupported'` + `errors[0].code=131060` (text never reaches the API,
  though Nicolás sees it in the app). Before: runBot fell into `askPending` (lead e4f6ecd6 got "para quién"
  after asking the price).
- `leadBot.mjs#runBot`: `msg.type==='unsupported'` (ANY error code) → before tap/text → `logDecision`
  (accion derivar, motivo `mensaje_no_disponible`, model `regla`, texto_in `[unsupported 131060]`) +
  `escalate()` = `bot_paused` + push "Mensaje no disponible" / "{wa_name|phone} te escribió y no se pudo leer
  el mensaje. Respóndele tú." ZERO text to the lead at any hour (no greeting either). Stickers/reactions/images
  unchanged. es_prueba same path (decision flagged).
- Harness `node scripts/harness-mensaje-no-disponible.mjs` (real e4f6ecd6 payload; 6 scenarios). Other 3 harnesses pass.

### 2026-10-07 — #57 Excepción a reglas por sesión (executor, 12878a3)
- `sessions.excepcion_reglas bool not null default false` (`supabase/sessions-excepcion-reglas.sql`, migration
  `sessions_excepcion_reglas`). `enforce_therapist_rules` returns early when true → skips ALL MARIANA_RULE checks.
  **Only owner/service_role/postgres may set it true** — guard at the top of the trigger (raises
  `EXCEPCION_REGLAS: …`); keeping an already-true flag on an edit is allowed. Verified as Mariana (authenticated,
  rolled back): insert + update with the flag both rejected. Trigger never disabled; room cap etc. untouched.
- JS mirror: `therapistRules.js#violatesRules` returns null when `excepcion_reglas`; drawer + Sesiones pass the
  initial row's flag. `queries.js`: in SESSION_SELECT + SESSION_COLUMNS; `friendlySessionError` maps EXCEPCION_REGLAS.
- Data: Mariana × Belén y Orlando 2026-10-07 17:20–18:50 en_linea pareja $35 programada, `excepcion_reglas=true`
  (id c5fbacea…, Calendar event fdgk94b3h1rcmgb2ups7ghs7l0). Mariana = 4 sessions that day. A 5th without the
  flag is still rejected ("máximo 3 sesiones por día", rolled back).
- Note: an excepted session still COUNTS for her other sessions' checks (moving the 19:00 that day would be blocked).

### 2026-10-06 — #56 Modo prueba del bot desde el teléfono del dueño (executor, fda357c)
Nicolás (owner phone 593968029896, the only phone he has) can test the lead flow as a first-time lead.
- **Commands** (owner → 9933, exact message, case/accent-insensitive; replies via `sendStaffText`, no sanitizer/greeting):
  "modo prueba" → `bot_test_mode` activo, expira_at now+2h · "reiniciar" → `resetTestLead` (mode stays as it was) ·
  "fin prueba" → off. Logic in **`netlify/lib/botTestMode.mjs`** (`testCommand`, `routeOwnerMessage` → 'command'|'lead'|'owner',
  `testModeActive`, `resetTestLead`). Webhook calls it AFTER the outbox flush/"Ver"/facturas/Aprobar handling, so those keep working.
- **Active** → every other owner message (text/taps/audio; images/PDFs still go to comprobantes) goes to `recordLead({esPrueba:true})`
  (skips the known-contact rules; an existing owner row gets flagged es_prueba) + runBot; each message renews expira_at.
  `botAllowedForPhone(phone, lead)` lets an es_prueba lead talk even with LEAD_BOT_LIVE off. Expired → owner path, silent.
- **reiniciar:** DELETE leads WHERE es_prueba AND last-9=owner (its `lead_ai_decisions` kept, flagged es_prueba, lead_id → null — FK);
  owner-phone llamadas with notas "[PRUEBA]…" → cancelada + calendar cancel (best-effort).
- **Isolation (es_prueba):** CAPI sweep filters `.eq('es_prueba', false)` + guard in `fire()`; lead-followups A–D filter it;
  `getFunnelData` excludes test leads + decisions; capi-admin counts too. `/agendar` with the owner phone while active →
  `createBooking({prueba:true})`: notas "[PRUEBA] Agendada en modo prueba del bot", owner-only push, NO therapist push, NO Calendar,
  patient reused (owner already has an es_lead row) / created es_lead, never promoted; the per-phone daily cap is skipped.
- **Migration** `lead_funnel_11_modo_prueba` (mirror `supabase/lead-funnel-11-modo-prueba.sql`): table `bot_test_mode`
  (owner-only RLS) + `leads.es_prueba` + `lead_ai_decisions.es_prueba`. Data: the stale owner lead 794b3525 (2 Oct, paused,
  empty) was removed exactly like "reiniciar" would (1 decision kept as es_prueba).
- **Harness** `node scripts/harness-modo-prueba.mjs` (mirrors the webhook's owner routing on leadBotSim's in-memory DB, which
  gained gt/neq/or/delete/upsert-onConflict): all checks pass, incl. CAPI 0 events for es_prueba with CAPI_LIVE + test phone allowed.
  Prod real-Claude dryrun scenario 1 unchanged ("Hola, hablas con Nico. La sesión cuesta $39…").

### 2026-10-06 — #55 Bot solo habla como Nico (executor, f88159c)
The lead bot speaks ONLY as Nico, first person; never mentions Nicolás in the third person or admits to being a bot.
- **`handoff()`** (leadBot.mjs): day 07–23 GYE → "Dame un momento y te respondo."; night → "Te respondo mañana a
  primera hora." Then `escalate()` (pause + push) as before. Urgente path unchanged (sent with `greet:false`).
- **Bot question → silent handoff, any hour:** `isBotQuestion(text)` (deterministic regex: bot/chatbot/robot,
  "eres/es una IA/automático", "eres real/una persona", "hablo/estoy hablando con una persona", "respuestas
  automáticas") runs before the model; the classifier's `motivo:"bot"` also routes here. ZERO text; push title
  "Preguntó si es un bot", body = `name: "<lead text>"` (`escalate` got `title`/`body` overrides). Log
  `derivar:bot (regla)`. Nicolás answers with an audio. "Soy un sistema de respuestas inteligente…" deleted.
- **One greeting:** `txt(supabase, lead, body, {greet})` (signature changed — every call passes supabase) →
  `withGreeting()`: first bot message (saludo_enviado=false AND last_bot_at null) gets "Hola, hablas con Nico. "
  replacing the bubble's own "Hola!/Hola,"; atomic `claimOnce('saludo_enviado')`; every later bubble has its
  leading "Hola" stripped (e.g. a 2nd price answer starts "La sesión cuesta…"). Also applied to the booking link.
  `showQuien` no longer greets by itself. A lead already written to (last_bot_at set) is never introduced late.
  Note: a handoff that is the very FIRST message reads "Hola, hablas con Nico. Dame un momento y te respondo."
- **Sim:** `_setHourGYE(h)` export (leadBot) + scenario `hourGYE`; scenarios 13–21 added to `leadBotSim.mjs`.
  Real-Claude dry run 13–21 + regressions 3/6/7/8: all as specified, 0 silences.

### 2026-10-06 — #54 Lead bot sin botones + link directo (executor, 41682e6)
**Diagnosis first (step 0):** the 5 Oct "Sí" lead (14cb7a92, step `quien`) did NOT hit a silent path — the
"Sí" was a TAP on `inv_si` (raw_payload interactive.button_reply), the bot answered with the quien buttons
(wamid delivered 12:46:02, never read), and taps were never logged to `lead_ai_decisions` by design. The real
bug found instead: **burst coalescing** in `lead-reply-background` folded tap titles ("Mi hijo/a") into the
next typed text (lead b64e16df: "Mi hijo/a\n24" → classified `agendar` → reset to quien). Gone with coalescing.
- **leadBot.mjs Phase B rewritten:** no `sendButtons`/`sendList`/`sendImageCard`; every step plain text (same
  copy: QUIEN_Q, EDAD_Q, REASON_Q, INVITATION). Cards = `sendImage` (photo + `*Nombre Apellido*` + caption sans
  Enfoque + gendered line). `leads.cards_ofrecidas uuid[]` stores the shown ids (classifier context).
- **leadBrain.decideFreeText** → `{accion, intents:[{intent,valor}] (≤3, ordered), motivo, categoria, texto}`.
  New intents afirmativo/negativo/quien_yo/pareja/hijo/edad/elige_terapeuta/motivo/gracias; **no `libre`**
  (responder with no intents outside a prompt step → derive `sin_intent`). Context = step + `pendingQuestion()`
  + offered names. Fact sheet no longer sent to the model (it only classifies).
- **runIntents:** CANNED bubbles in order → at most ONE flow step (FLOW_ORDER) → tail once (`finishAnswers`:
  handoff > Carolina cards > invitation if not in flow, else the pending question). Invitation + "Hola, hablas
  con Nico" use `claimOnce()` (atomic false→true UPDATE) so concurrent turns never double them.
- **Zero silence:** `runBot` counts sends (`lead.__sent`) / derivations (`__derived`); a turn ending with neither
  (or crashing) → log `sin_respuesta` (model 'guardia') + handoff. `handoff()` now ALWAYS sends a line (day:
  "…te escribirá personalmente en un momento"; night: "a primera hora").
- **Link instead of slots:** `chooseTherapist` → `sendBookingLink` (`LINK_COPY` + `/agendar?terapeuta=`), via
  `waSend.sendLinkText` (the ONLY lead text exempt from cleanBotText). step `link_enviado`. `nextSlots` no
  longer used by the bot. Booking from the link links back via `trg_lead_link_from_session` (last-9) → agendo_at.
- Typed template replies (`typedTemplateReply`, gated on the template having been sent); Cambiar hora / Sí
  reagendar → link. Legacy taps (inv_si, quien:, pick:, horarios:, slot:) still handled for old chats.
- `lead-reply-background`: REPLY_DELAY_MS 0, no coalescing. Camila out of `terapia_pareja`
  (funnel_categorias + mapaCasos ✗). funnel_knowledge `agenda` reworded. Migration `lead-funnel-10-sin-botones.sql`.
- **Verify:** `node scripts/harness-lead-bot.mjs` (local, keyword fallback) and
  `GET /.netlify/functions/lead-bot-dryrun?token=<LEAD_TOOLS_TOKEN>&only=1,2` (prod, REAL Claude; run in small
  `only=` batches — the full set exceeds the HTTP inactivity timeout). Sim = `netlify/lib/leadBotSim.mjs`
  (in-memory Supabase seeded read-only + recording transport). 12/12 scenarios, 0 silences, both modes.

## Pending / Backlog

### 🔥 Next (director picks up) — surfaced 2026-10-04
- [ ] **#66 live proof** — (a) Nicolás: "modo prueba" → "cuánto cuesta" → "reiniciar" → "fin prueba"; then check
      `lead_bot_sends` rows es_prueba=true with a wamid that appears in `whatsapp_delivery_status`. (b) First real ad lead
      after e29b64f: its sends have a wamid, `select * from funnel_v` shows it; report 3 sample rows (phone last 4 only).
- [ ] **#62 proof with a real lead message** — Nicolás: "modo prueba" → write as a lead → bot answers; check a `lead_inbox` row gets `processed_at`.
- [ ] **#61 bad phones (listed, not changed):** normalizePhone → null: Cristina Gomez, Maria Emilia Buitron, Andres Luzuriaga (hidden U+202A/202C marks), Daniel y Daniela ("8"), Michelle Tinajero ("9"). Malformed EC: Connie Ayala, Ana Belén Quisiguiña, Noeleen Rodriguez (+5930…), Sophia Chica, Stefanny Lopez, Fátima Tubon (+59398067281), Maria de Lourdes Altamirano, Amparito Vargas (8-digit mobiles).
- [ ] **#61 Dorian Solis (payer of Cecília + Elena Saltos) has no phone** → their payment reminders still go to the patient.
- [ ] **#60 Mauro Baquero en espera** (8 paid, all pre-floor): when his insurer's diagnosis arrives → set diagnóstico, untoggle "Facturación en espera" AND set `facturar_desde` to his first session to back-invoice.
- [ ] **#60 Mila (Sébastien Paque):** 6 Oct (unpaid) + 6 future insured sessions go out via the normal Mon+Thu list in concepto-general format once paid.
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
