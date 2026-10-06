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

### 2026-10-06 — #48 Carolina Sep payroll corrected: 34 / $828 (executor, data-only)
- Paula Hidalgo 30/09 10:30 (session 27ae5bff) is now Cancelada → Carolina 35/$852 → **34/$828** (32×$24 + 2×$30 pareja).
- Regenerated with the same `sessionReport.js` path as #48 (node, `save:false`, filters estado=confirmada,
  2026-09-01→30, logo from public/logos). Text-diff vs original: only Paula removed + Isabella 29/09 & Sara 30/09
  now Pagado=Sí. **NOT sent to Carolina** — Nicolás sends it himself.
- Storage bucket `payroll`: `2026-09/carolina-v2.pdf` (original `carolina.pdf` kept). Local copy:
  `~/Documents/Efimeramente/payroll/2026-09/carolina-v2.pdf` (+ original). Service key for node runs = local `.env`
  `SUPABASE_SERVICE_KEY` (Netlify copy is secret/masked).
- `payroll_runs` d5b8d28d: sesiones=34, monto=828, `detalle.correccion` {fecha, motivo, antes{35,852}, pdf_path};
  estado stays enviado_ok; other therapists untouched.

### 2026-10-05 — #53 Mariana from 11:00 + reusable broadcasts + "Mariana retoma" broadcast (executor, 91c92e9, f09ff77, f43da55)
- **R1 now 11:00–20:00** (start-only). `src/lib/therapistRules.js` startWindow `['11:00','20:00']`; migration
  `therapist_rules_r1_11am` (mirror `supabase/therapist-rules-r1-11am.sql`): `enforce_therapist_rules` <11:00 →
  "La primera sesión de Mariana empieza a las 11:00"; her availability mon–sat 11:00–21:15. Verified: live /reservar
  slots start 11:00 (7, 8, 10 Oct), en línea forced (page filter + booking.mjs + trigger); rolled-back tx 10:30 fails, 11:00 ok.
- **Broadcast mechanism** — see CLAUDE.md "Broadcasts". Tables `broadcasts` + `broadcast_recipients` (migration
  `broadcasts`, `supabase/broadcasts.sql`, owner-only RLS). `netlify/lib/broadcast.mjs` (`buildRecipients`, `saludoFor`,
  `etiquetaFor`, `runBroadcastSweep`), `functions/broadcast-sweep.mjs` (*/15, 08–21 GYE), `functions/broadcast-admin.mjs`
  (token POST, messages ONLY the broadcast's therapist — the Dualhook key is a masked secret, so local sends are
  impossible). `waSend.mjs#sendStaffText` (raw text, no sanitizer). Template `mariana_retoma` (MARKETING, `{{1}}` saludo,
  `leadTemplates.mjs#BROADCAST_TEMPLATES`, Meta id 980991178363754) submitted 5 Oct ~20:53 UTC → PENDING.
  Harness run against the real DB with stubbed sends (free/template/wait/claim/no-dupe/131049 reconcile/single notify)
  caught + fixed "closes a broadcast with 0 recipients" (f43da55). Gotcha: a PostgREST bulk insert with mixed keys sends
  NULL for the missing columns (defaults skipped).
- **Broadcast `4e56df3a-8a69-456a-a93c-8c750e444391` "Mariana retoma sesiones"**: 49 active → 48 (Kathy Rivadeneira duplicate
  `c1d2422c…` +593999981622, 1 session/0 inbound = typo row; kept `c1819b33…` +593999901622). List sent to Mariana 20:55 UTC;
  she replied "10, 19, 20, 26, 35, 37, 39, 42," → excluded Diana Marcial Verdesoto, Grace Atiencia, Inti Maigua, Juan David
  Álvarez, Mauro Baquero, Nathaly Ramos, Nicolás Marcano, Paola Ibarra. → `listo` 21:01 UTC, confirmation sent.
  `mariana_retoma` APPROVED (MARKETING) before the 21:15 sweep → all 40 sent 21:15–21:16 UTC (1 free-form, 39 template),
  0 duplicate wamids. 3 failed: Diana Romero 131049, Luna Guamán 131026, Emily Rivera 131026 (landline) → closes ~21:46
  with one notifyOwner listing them.
- Meta status seen: `sesion_pendiente` (#52) **APPROVED but as MARKETING** → the 08:30 job requires UTILITY, so it keeps
  using free-form/push fallback until decided; `ping_nico` PENDING/MARKETING.

### 2026-10-05 — #46 Mariana R1: last session STARTS at 20:00 (executor, fffbe07)
- R1 is now start-only: `hora_inicio` 10:00–20:00 inclusive, end not checked (she's done by 21:00). R2–R4 unchanged.
- `src/lib/therapistRules.js`: `window` → `startWindow`; `allowedWindow` → `allowedStartWindow` (+ `startWindowCopy`).
  Copy: >20:00 "La última sesión de Mariana empieza a las 20:00"; <10:00 "La primera sesión de Mariana empieza a las 10:00".
- `netlify/lib/booking.mjs#computeSlots`: clamp limits STARTS only (`if (clamp && s > clamp[1]) break`); the end is bounded
  by her `booking_availability`, now mon–sat 10:00–21:15. Other therapists' slots diffed identical before/after.
- Migration `therapist_rules_r1_start_only` (mirror `supabase/therapist-rules-r1-start-only.sql`): CREATE OR REPLACE
  `enforce_therapist_rules` + her availability update. Verified in rolled-back tx: 20:00/10:00 ok, 20:30/09:30 fail,
  19:00+20:00 fails R2. Live `?action=slots` 2026-10-07 → last slot 20:00.

### 2026-10-05 — #52 Daily 08:30 reminder to therapists: past sessions can't stay in Pendiente (executor, 674003b)
- `netlify/functions/sesiones-pendientes.mjs` (scheduled `30 13 * * *` = 08:30 GYE, registered in deploy 6ac40723) →
  `netlify/lib/sesionesPendientes.mjs#runSesionesPendientes`. Scope: estado programada, tipo ≠ llamada (query + code
  re-check), fecha < today GYE, therapist activo + telefono. One msg per session; window open → `waSend#sendStaffButtons`
  (new, NO sanitizer — 🐚✨ kept), ids `est_ok:/est_no:<id>`; closed → template `sesion_pendiente` (only if APPROVED as
  UTILITY; `leadTemplates#STAFF_TEMPLATES` + `sendSesionPendiente`, per-send quick-reply payloads); else ONE push per
  therapist per day, `skipOwner`. Daniela → "Dani". Same-day rerun doesn't resend.
- New table `session_estado_reminders` (migration `session_estado_reminders`, mirror `supabase/session-estado-reminders.sql`,
  owner-only RLS; + `escalated_at`). 3 distinct days unanswered → `notifyOwner` kind `sesion_sin_cerrar` once.
- Webhook: `handleEstadoTap` runs after owner/facturar, BEFORE the patient estado flip + lead bot. Therapist last-9 must
  match; closeSession = guarded `UPDATE … WHERE estado='programada'` (saldo trigger fires — verified on the real DB in a
  rolled-back tx: pagado=t, credit 35→0); est_no also clears pagado + calendar `cancel`. No push.
- Template `sesion_pendiente` submitted → Meta id 1751621786066092, PENDING/UTILITY. Until approved, closed-window
  therapists get the push. Harness `scripts/harness-sesiones-pendientes.mjs` 14/14 PASS.
- First run Tue 6 Oct 08:30: Sophia (Cecilia Saltos + Valentina Loor, 2 Oct) + Mariana (3 Oct), plus any 5 Oct session
  still Pendiente at run time.

### 2026-10-05 — #49b Package credit consumed whoever confirms + new credit pays existing debt (executor)
- Migration `saldo_consume_security_definer` (mirror `supabase/saldo-consume-security-definer.sql`):
  (a) `consume_saldo_on_confirm()` → SECURITY DEFINER, `search_path = public, pg_temp`, owner postgres; logic unchanged.
  (b) new `apply_new_saldo_lote()` + AFTER INSERT trigger `apply_new_saldo_lote` on saldo_lotes: pays the patient's
  confirmada+unpaid+non-llamada sessions oldest fecha first, full coverage only, FIFO lotes; stops at first uncovered.
  **Guard: skips lotes with proof_id** — proofReconcile.applyPlan inserts its lote FIRST, then draws credit + marks its
  own sessions; settling there too would double-consume. Only manual inserts (e.g. #51) reach (b).
  RLS on saldo_lotes unchanged (`saldo_lotes_owner: is_owner()`), therapists still see 0 lotes.
- Pre-deploy test (migration + test in one aborted tx, as Carolina's JWT, role authenticated): Andrea paid, lote 101→62;
  no credit → unchanged; proof_id lote → nothing paid; $20 lote < $35 → nothing; +$15 → paid, both lotes → 0; 0 negative.
- Deploy changed no lote (16 matched snapshot). (c) settled via no-op `estado='confirmada'` update (trigger, not by hand):
  Andrea 1 Oct $39 (lote f0b7af8c 101→62), Luis 2 Oct $35 (lote 14db84f9 50→15). Re-scan: 0 left.
- Shyam lote af4ba5c9 is 35 (not 70): his 6 Oct session was confirmed 19:49 UTC pre-deploy and paid from credit — correct.

### 2026-10-05 — #50 Marthin Spatz billed to Shariam Narváez + #51 Valentina Yanchaluiza 4-pack (executor, data-only)
- #50: new `payers` row 4d0597f1-0b09-4bd9-babb-d0b41c68201a (Shariam Alexandra Narváez Celi, cédula =
  contifico_id 1722319439, tel +593995879307); patient 6f9b2b87 → payer_id set, nombre 'Sharian'→'Shariam'
  (old cedula/contifico_id 1724765266 kept on the patient). Contífico persona for 1722319439 did NOT exist
  (recon empty) → created inline by the first POST, like #44. Gotcha: her Tumbaco address is NOT used —
  `buildPayloadCore` locks direccion='Quito' (Nicolás rule 2026-10-02). Scratch assemble() of the 18 Sep
  session (unpaid, not eligible yet): billing 1722319439 "SHARIAM ALEXANDRA NARVÁEZ CELI", descripcion
  "Paciente Marthin Spatz | F43.2 …"; rideRecipient → payer +593995879307. Nothing emitted; no emitted doc touched.
- #51: `saldo_lotes` 8c803ca8 (Valentina a2ad3f7c, package $120 @ $30, remaining $90, source 1 Oct d97a7f25,
  payphone trx 91928931). 8 Oct (226665fc) left unpaid → consume_saldo_on_confirm pays it ($90→$60).

### 2026-10-05 — #49 Shyam package credit fixed + diagnosis: credit not consumed (executor)
- **Fix (authorized):** lote `af4ba5c9…` (Shyam Yelpi, backfill package) remaining 105 → **70** + note
  "5 Oct: ajuste manual a 70 (22 y 29 sep consumidas; quedan 6 oct + la siguiente)". 22/29 Sep left as-is
  (pagado by hand today 14:37, payphone). 6 Oct (`99e99563…`, programada) NOT pre-marked: trigger pays it on confirm.
- **ROOT CAUSE (verified):** `consume_saldo_on_confirm()` is NOT `security definer`. `saldo_lotes` RLS = `is_owner()`
  only. When a THERAPIST confirms in the app, the trigger runs as that user → `select sum(remaining)` sees 0 lotes
  → silent skip (and it couldn't UPDATE the lote anyway). Verified read-only: as Daniela's auth uid,
  `is_owner()=false`, lotes visible = 0, session visible = 1. Only owner/service-role writes consume credit.
  - Shyam 29 Sep (Daniela): created 28 Sep 19:10, no reminder sent, no WA reply → confirmed in-app by therapist.
  - Andrea Torres 1 Oct $39 (Carolina): lote $101 created 29 Sep 21:10 (proof 67e6facf), session last updated
    30 Sep 20:04 — AFTER the lote → not a timing issue, it's the RLS issue. Credit covers it.
  - Luis Vaca 2 Oct $35 (Carolina): prepay lote $50 created 1 Oct (proof c546274d), session created 3 Oct 08:27 /
    updated 18:21 — AFTER the lote → RLS again. Credit covers it ($15 left after).
- **Secondary gap:** the trigger only fires on session writes; a lote created after a session is already
  confirmada+unpaid never applies itself (the backfill and proofReconcile only settle what they explicitly match).
- **Full scan (confirmada + unpaid + non-llamada + enough credit):** only Andrea 1 Oct and Luis 2 Oct. Untouched.

## Pending / Backlog

### 🔥 Next (director picks up) — surfaced 2026-10-04
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
