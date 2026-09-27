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

WhatsApp button-bot that turns ad leads into booked free calls. All 4 phases built + deployed.
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

**Templates at Meta (submitted 2026-09-26 via the `submit-lead-templates` fn, guard env `LEAD_TOOLS_TOKEN`):**
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
- [x] **#30 — `recentInbound` history bug fixed: query `received_at`, not `created_at`** (2026-09-27,
  Opus 4.8). Commit `9284328`, one-line fix in `netlify/lib/leadBot.mjs#recentInbound`. `whatsapp_messages`
  has **no `created_at` column** (only `received_at`, default `now()`) → the old `.select('cuerpo,
  created_at').order('created_at')` errored at PostgREST, `data` came back null, fn returned `[]`, so
  **Claude got an EMPTY history on every T2 call** (`decideFreeText`, both classify + `libre`). Now uses
  `received_at`; scoping/oldest-first/`limit(12)` unchanged. History reaches Claude as the "Mensajes
  recientes del cliente" block (leadBrain.mjs L160) — **inbound lines only** by design; `matchTherapistsForText`
  gets none. **LIVE test** (`593968029896`, row reset first): (3a) "hola, es para mi hijo de 15" →
  `intent=adolescentes, categoria=hijo`, tap "Sí" → **skipped reasons list, jumped to hijo cards** (next msg
  logged `step:"cards"`). ✅ (3b/3c) surfaced two tuning items — see Pending / Backlog.
- [x] **Lead funnel v2 (#27) — "answer first, then offer" + VERBATIM canned answers** (2026-09-27,
  Opus 4.8). Commits `8574b58` (v2) `115063f` (greeting/handoff fixes) `80025d6` (verbatim/classifier).
  Migration `funnel_v2_schema` + data reseed, mirror `supabase/lead-funnel-05-v2.sql`. Spec:
  `PERMANENT TO-DO.md` → "#27 Funnel v2". Supersedes the opening (Message 1) of the #4/#24 entries below.
  - **Opening:** Message 1 (price + "Elegir terapeuta") REMOVED. A **bare** greeting/ad text (`isBareGreeting`
    in leadBot) → "Hola! Qué gusto que nos escribas" + the 10-reason list. A real question → Claude answers,
    then the **one-time** invitation `*Te gustaría ver a nuestros terapeutas disponibles?*` [Sí][Tengo otra
    pregunta] (`leads.invitacion_enviada`, `sendInvitationOnce`). "Sí" (`inv_si`) skips the list when a reason
    was detected from the conversation (Claude sets `categoria`); "Tengo otra pregunta" (`inv_otra`) → "Claro, dime".
  - **VERBATIM answers — the key fix:** Claude no longer WRITES the common answers (it drifted). It only
    **classifies an `intent`**; code sends the exact copy. Source of truth = **`CANNED` map in
    `leadBot.mjs`** (`sendCanned`), one WhatsApp bubble per array item. Tails: `invite` (one-time invitation) /
    `invite_custom` (adolescentes: the question itself carries the [Sí][Tengo otra pregunta] buttons) / `cards`
    (pareja → Carolina card, no invitation) / `handoff` (objeción de precio → the line + `escalate`, bot never
    negotiates). `leadBrain.mjs` tool returns `intent` (precio/ubicacion/saludsa/seguros/adolescentes/duracion/
    horarios/psiquiatra/pareja/pago/objecion_precio/saludo/libre) + literal few-shots + style rules; **temperature 0**.
    Only `intent==='libre'` lets Claude author (from the fact sheet). Keyword fallback maps to the same CANNED
    (`KW_TO_CANNED`) — no second paraphrased copy anywhere (the two copies are leadBrain few-shots [for the model]
    and leadBot CANNED [what's sent]; **CANNED always wins**).
  - **10-reason list** (`funnel_categorias` reseeded, `descripcion` column added, old 8 deactivated=recoverable):
    hijo/ruptura/problemas_pareja/depresion_ansiedad/consumo/terapia_pareja/diagnostico/trauma/varios/otro.
    Provisional routing (unchanged from spec). `especial`: `hijo` (kids line), `diagnostico`/`varios` (free-text
    prompt → `matchFlow` → `matchTherapistsForText` in leadBrain picks ≤3 from the roster or derives on
    audio/no-fit/eating-disorder/psychosis/bipolar/self-harm), `otro` (handoff). Reason 6 (terapia_pareja) = Carolina only.
  - **Cards:** caption with the "Enfoque …" clause stripped (`captionSansEnfoque`) + bold `*Puedes agendar una
    llamada gratuita para conocerl{o/a}*` + gendered button `Quiero conocerl{o/a}` (`therapists.genero`, M=Francisco).
    Pick (`pick:`) → gendered call-explanation (`chooseTherapist`, + the kids line only when `categoria==='hijo'`)
    + [Ver horarios] (`horarios:`) → `showSlots` → booking (unchanged).
  - **Handoff window (`isNightGYE`, GYE=UTC-5):** 07:00–23:00 → NO bot text, just push + `bot_paused` (`handoff`
    only sends a line at night). 23:00–07:00 → one line (bot-question vs general variant). URGENTE + ECU 911 ONLY
    on explicit life-risk; ordinary emotional disclosure now derives as `motivo:"emocional"` = **silent daytime
    handoff** (leadBrain rules 2/3 split urgent from emotional). Neutral nudges: "Seguimos aquí si tienes alguna otra pregunta".
  - **20s delay + typing:** webhook 200s Meta immediately; for a lead's **text** it marks-read + shows the typing
    indicator (`waSend.sendReadReceipt(msgId,{typing:true})`) and defers the reply to **`netlify/functions/
    lead-reply-background.mjs`** (fixed 20s sleep → `runBot`), gated by an `x-lead-verify` header = `WA_CLOUD_VERIFY_TOKEN`.
    Button **taps** run inline in the webhook (immediate). `isTap(msg)` exported from leadBot.
  - **Fact sheet (`funnel_knowledge`) additions:** couples (Carolina 90min $50, pack 4×$42), package upfront,
    Dr. Camino, Mon–Sat 8–20, 60min/7–15d, Saludsa/Ecuasanitas cubren por reembolso (según plan), Bupa tope anual
    según plan, others→handoff, no home visits.
  - **LIVE test 2026-09-27** (real phone `593968029896`): 4 questions → all classified correctly (precio/ubicacion/
    saludsa/psiquiatra), `[canned:*]` fired, `used_fallback=false`, sonnet 2.5–4.5s. Timing verified: text ~25s
    (20s + latency), tap instant. Typing indicator accepted by Dualhook (no fallback). Audit in Marketing → Embudo.
  - **Known follow-ups (not blocking):** (1) felt delay ~25s not 20s because the sleep is BEFORE the Claude call —
    classify-then-wait-remainder would tighten it. (2) Latent pre-existing bug: `recentInbound` selects a
    non-existent `created_at` (table has `received_at`) → Claude gets no prior-message history; harmless for
    single-question turns, worth a one-word fix for multi-turn context.
- [x] **Lead bot #24 — three-tier free-text handling: Claude (Anthropic Sonnet) + fact sheet + derive**
  (2026-09-27, Opus 4.8). Commit `fdf9f67`. Migration `lead_funnel_04_knowledge_and_ai_log`
  (`supabase/lead-funnel-04-knowledge.sql`). Supersedes section B of the 2026-09-26 entry below.
  - **Tiers:** T1 button taps unchanged (no model). T2 FREE TEXT → new **`netlify/lib/leadBrain.mjs`**
    `decideFreeText()` → **Anthropic Messages API** (`https://api.anthropic.com/v1/messages`, model
    `claude-sonnet-4-6`, **raw fetch** — matches repo convention, no SDK dep), 8s `AbortController`,
    forced tool-call (`tool_choice:{type:'tool',name:'responder'}`) → `{accion:'responder'|'derivar',
    texto, motivo}`. T3 derivar = handoff line + `escalate()` (push + `bot_paused`); `motivo==='urgente'`
    → `escalate(..., {urgent:true})` = 🚨 URGENTE push, and the reply carries ECU 911 on life-risk.
  - **Fact sheet:** new `funnel_knowledge` table (clave/titulo/contenido/orden/activo, owner-RLS), seeded
    with confirmed facts only (price $39/$35-pack, free 10-min call, Cumbayá+parqueo+maps, online, pago,
    seguros=Bupa/Humana 80% + BMI excludes + others→derive). **Home visits deliberately absent** → a
    domicilio question derives. `buildFactSheet(supabase)` = active knowledge rows + live captions of
    `recibe_nuevos` therapists. Editable in Marketing → Configuración ("Hoja de datos", `KnowledgeEditor`).
  - **Hard rules** live in `leadBrain.mjs` `SYSTEM_RULES` (Spanish, tú, ≤3 lines, no bare "¿agendas?",
    only fact-sheet facts, crisis/clinical→urgente, uncertain→derivar) AND enforced in code
    (`applyDecision`: responder → `sendButtons(texto, ANSWER_BUTTONS)` re-attaches [Elegir terapeuta]
    [Otra pregunta]; derivar urgente → send `texto`, else `HANDOFF_LINE`).
  - **Fallback:** `keywordFallback()` (old `classifyKeywords`/`classifyFreeText` APIMart path) runs ONLY
    when `decideFreeText` returns null (no `ANTHROPIC_API_KEY` / API error / >8s timeout). Greetings/thanks
    short-circuit before the model (`kw==='gracias'|'saludo'`) and never derive.
  - **Audit:** every T2 decision → `lead_ai_decisions` (`logDecision`), shown in Marketing → Embudo
    ("Respuestas del bot a texto libre", `AiDecisionsCard`). `getFunnelData` now also returns `knowledge`
    + `aiDecisions`; `updateFunnelKnowledge` in queries.js.
  - **Env:** **`ANTHROPIC_API_KEY`** (Netlify, functions scope) required for T2; absent ⇒ silent keyword
    fallback. Set by Nicolás 2026-09-27.
  - **Gotcha (test):** the FIRST message from a brand-new lead hits the welcome branch in `runBot`
    (`isNew || (!tap && !lead.step_actual)`), NOT T2 — `handleFreeText` only runs on 2nd+ msgs once
    `step_actual` is set. To test T2, seed a lead row with `step_actual` already set.
  - **LIVE test 2026-09-27** (6 msgs injected to the deployed webhook, replies to `593968029896`, then
    purged): precio/ubicacion/seguros(Bupa) → responder ✓; domicilio → derivar ✓; "me siento muy mal" →
    derivar/urgente + 911 + pause ✓; gracias → greeting, no model ✓. All `claude-sonnet-4-6`, 1.5–3.6s.
- [x] **Lead bot: known-organic-contact guard + answer-before-asking (Day-1-live bug fixes)** (2026-09-26,
  Opus 4.8). Commit `436cb66`. All code in `netlify/lib/leadBot.mjs`; plus DB row ops (no migration).
  - **A — who is a lead:** new `hasEarlierInbound(supabase, from)` + a guard in `recordLead`. An ORGANIC
    sender (`source==='whatsapp_organico'`, i.e. no CTWA `referral`) that already has ANY `direccion='inbound'`
    row in `whatsapp_messages` (matched on `raw_payload->'message'->>'from'`) is a known contact → returns
    `null`, no lead row, no bot. Ad clicks (referral present) always become leads. Safe because the webhook
    logs the current inbound AFTER lead handling, so it's never counted as its own "earlier" message.
  - **A — data:** filled `therapists.telefono` — Carolina `+593984935328`, Francisco `+593992856511`,
    Mariana `+593994342657` (recovered from their leads rows). **Still NULL — need real numbers: Camila Maya,
    Daniela Espinosa, Maria Gracia Villalba, Sophia Vergara.** Deleted the mis-created leads rows for those 3
    phones + `+593999025081` (their `whatsapp_messages` kept). Cancelled the Mariana↔Sophia test llamada
    (session `cf48a941`, 28 Sep 09:00) via the calendar fn `cancel` action (Google event soft-cancelled,
    greyed "CANCELADA —") + `estado→cancelada` (pagado/facturada cleared) — mirrors `updateSession`'s cancel.
  - **B — answer before asking:** classifier is keyword/regex FIRST (`classifyKeywords`), LLM only as a
    fallback (`classifyIntent`→`classifyFreeText`; model fixed `claude-haiku-4-5`→`claude-opus-4-8`, the id
    proven in `proofOcr`). An answer is now ONE interactive message: canned copy body + `[Elegir terapeuta]
    [Otra pregunta]` buttons (`ANSWER_BUTTONS`/`answerIntent`); ubicación sends the Maps link (preview) then
    the note+buttons. Removed the two self re-prompts. First contact with an answerable question → plain
    `sendAnswerText` then Message 1 (B4). `gracias`/`ok`→`¡Con gusto! 🌿`; unclassifiable/`otro`→`handoff()`
    (canned handoff line + escalate/push, bot paused). `faqText`/`sendFaqAnswer` removed.
  - **⚠️ SUPERSEDED:** Nicolás says spec **#24 replaces section B** and these canned answers become the
    **fallback** under #24 — pick that up next session (see Pending / Backlog).
- [x] **#4 + #20 Lead funnel WhatsApp bot — 4 phases + LIVE for real leads** (2026-09-26, Opus 4.8).
  `LEAD_BOT_LIVE=true`. Commits `2eb9c8f` (A) `9e8d60e` (B) `a74e3ae` (C) `d9d7448` (D) + fixes. Full record
  in the "✅ Lead funnel" section above. New: `netlify/lib/{leadBot,waSend,booking,leadTemplates}.mjs`,
  `netlify/functions/{lead-followups,submit-lead-templates}.mjs`, `src/pages/MarketingFunnel.jsx`,
  `src/lib/funnel.js`; migrations `lead_funnel_0{1,2,3}_*`. `public-booking.mjs` delegates to shared
  `booking.mjs`. **Gotcha fixed (`25ba446`):** messages-branch patient cache select MUST include `es_lead`,
  else booked leads (es_lead patients) read undefined → `(!patient||patient.es_lead)` falsy → runBot skipped
  for all post-booking msgs. **Verified:** full flow + echo pause (smb_message_echoes → bot_paused) + FAQ.
  Test mode `LEAD_BOT_TEST_PHONES` retained. Templates: `recordatorio_llamada` APPROVED, other 3 PENDING.
- [x] **#19 saldo a favor — comprobante→lote + net-of-credit matching/reminders + package_anchor DROPPED
  (steps 2–7 of the finish plan)** (2026-09-25, Opus 4.8). Commits `5ee272e` (2–6) + `5566b0e` (7).
  Step 1 (verify the 7 backfilled lotes, $433) re-confirmed with Nicolás — correct; the only non-$35
  component is Samantha Aldaz's special $24 rate ($48 = 2×$24), everything else is 11×$35.
  - **proofReconcile (`netlify/lib/proofReconcile.mjs`) now decides against the patient's saldo pool.**
    `decideAutoReconcile(proof, ex, unpaid, ctx)` gained `ctx = {credit, tarifa, payerId}` and returns a
    richer plan (`mark` | `lote` | `withhold`). Rules: **$140 → package lote** ($35/session) then settles
    whatever the pooled credit now fully covers; **overpayment from a matched sender → surplus banked as a
    lote at tarifa** (existing credit drawn for the rest); **no-debt payment → prepay lote**; **match vs
    amount owed NET of credit + consume credit on match** ($10 credit + $40 session → $30 exact);
    **underpayment stays a warning** (never partial credit). New apply path: `fifoConsumeLotes` +
    `insertLote` + `applyPlan` (insert-then-consume so a package lote is used last and an overpayment
    surplus is never drawn). `report` gained a `lotes` counter + per-item lote/credit fields.
  - **Same-day matching bug fixed:** the matcher used `fecha < today`, missing a session confirmed & paid
    the SAME day (real case: Thais Cardoso's $39 for today's session would have mis-banked as prepay
    credit). Now `<= today`.
  - **paymentReminders (`netlify/lib/paymentReminders.mjs`):** amount asked = owed **net of credit**;
    fully-covered patients are skipped (`skipped_covered_by_credit`) and NOT stamped, so they don't
    become "en mora". Entry now carries `gross`/`credit`.
  - **Step 7 — `sessions.package_anchor` DROPPED** (migration `drop_sessions_package_anchor`, mirror
    `supabase/drop-sessions-package-anchor.sql`). Dormant since bd31c6a; provenance of the 7 lotes lives
    in `saldo_lotes.source_session_id` + note. Approved by Nicolás in chat.
  - **⚠️ Pool-based semantics (documented, not a bug):** both the confirm trigger AND proofReconcile settle
    draw the session's **`monto`** from total remaining credit; `price_per_session` is nominal accounting,
    not a per-session cap. So a $140 pool covers ~$140 of sessions at their real monto — exactly 4 sessions
    only when tarifa == $35. For $39-tarifa package buyers (Emily, Ramesvary) a $140 pack covers ~3.5
    sessions, not 4. If Nicolás wants a package to always cover 4 sessions regardless of tarifa, the trigger
    + settle must consume `price_per_session` instead of `monto` — a deliberate future change, not shipped.
  - **Verified:** 15 pure-decision unit assertions (all pass) + dry runs of both processors against the live
    DB (nothing written; Thais's $39 now marks today's session; reminders query + lotes join clean).
- [x] **#19 Saldo a favor (credit lotes) LIVE + old 4-pack mechanism RETIRED + comprobante warning alert +
  Sesiones search fix** (2026-09-26, Opus 4.8). Four things shipped this session.
  - **Comprobante warning alert (spec #2 additions) — LIVE.** On every WITHHELD proof the auto-processor
    now WhatsApps Nicolás once (template `comprobante_sin_identificar`, id `1595464335377117`, APPROVED).
    New `sendDualhookComprobanteAlert({sender,amount,motivo})` in `netlify/lib/whatsapp.mjs` (recipient =
    env `OWNER_WHATSAPP`, fallback `+593968029896`; Meta rejects empty vars so all 3 are coerced). Wired in
    `netlify/lib/proofReconcile.mjs` `runProofAutomation`: on `withhold`, if `!proof.alerted_at` send + stamp
    `alerted_at` (the THROTTLE — the every-10-min processor would re-alert forever otherwise); best-effort, a
    failed send never crashes the batch and leaves `alerted_at` null to retry; dry runs show `would-alert`.
    Reasons → Spanish `motivo` map (`unmatched`→"remitente no identificado", `amount_no_match`, `overpayment`,
    `reused_reference`, `extraction_*`→"no se pudo leer la imagen", …). Additive column
    `whatsapp_messages.alerted_at` applied (migration `add_whatsapp_alerted_at`, mirror
    `supabase/whatsapp-messages-alerted-at.sql`). Burst on first live run was ≤2 (only 2 held proofs then).
  - **#19 saldo a favor — LIVE.** Replaces the 4-session-package prepay. `saldo_lotes` table
    (`amount / price_per_session / remaining`, FIFO, owner RLS + explicit service_role/authenticated GRANTs,
    `payer_id` denormalized for future payer-group scoping; origin `package|overpayment|prepay|manual`).
    Pure math in `netlify/lib/saldo.mjs` (`totalCredit`, `netOwed`, `isPackagePayment` [$140], `packageLote`
    [$35/session], FIFO `consume` → `{applied,shortfall}`; node-unit-checked). **DB trigger
    `consume_saldo_on_confirm`** (BEFORE INSERT/UPDATE on sessions): on confirmada + unpaid + billable, FIFO-draws
    the patient's credit at the lote price, **full-coverage only** (package lotes are whole multiples so partials
    never happen; if credit can't cover the whole session it stays unpaid for the reminder/comprobante flow),
    sets pagado+paid_at. Fires from ALL write paths. **Verified in a rolled-back tx** (pays while credit covers,
    leaves unpaid when exhausted, ignores llamadas — nothing persisted). Migration
    `saldo_lotes_table_and_trigger`; mirror `supabase/saldo-lotes.sql`. **Backfill applied: 7 live-credit lotes,
    $433** (Daniel $35, Emily $35, Isabel $70, Ramesvary $105, Samantha **$48 @ her special $24 rate**, Shyam
    $105, Thomas $35 [now a menor]). Micaela dropped (balance $0, re-typed menor). Rate: $35 standard,
    per-patient exceptions carried explicitly. Loose $39/$32 session pricing left as-is (Nicolás's existing
    "mismatch → warning → fix tarifa → auto-pays next time" flow handles it).
  - **Old 4-pack mechanism RETIRED.** The `package_anchor` checkbox ("primera sesión de un paquete de 4") +
    the ★ star on anchor rows are GONE, superseded by saldo a favor. Removed: the drawer control +
    schedule-time prepay (so packaged patients' sessions now come in unpaid and the trigger pays them on
    confirm — leaving both would DOUBLE-COUNT), `PackageStar` in `views.jsx`, deleted `src/lib/packages.js`,
    and `package_anchor` dropped from `queries.js` SESSION_SELECT/SESSION_COLUMNS + the getPatientsData select.
    **DB column `sessions.package_anchor` left DORMANT** (nothing reads/writes it; it's the provenance of the
    backfilled lotes) — a `DROP COLUMN` is a separate approved step, not done.
  - **Sesiones → Lista search now matches BOTH names.** Was `nombre`+`apellido` only, so a menor/pareja couldn't
    be found by the second person. Now uses `patientSearchText(s.patient)` (covers `nombre_2`/`apellido_2`).
    Surfaced because Nicolás re-typed Micaela AND Thomas as menores this session.
  - **DEFERRED (next):** (1) `proofReconcile`: $140 comprobante → package lote, matched-sender overpayment
    surplus → `overpayment` lote, match against amount-net-of-credit + consume — only needed once odd-amount
    (non-package) lotes exist; package lotes are clean multiples the trigger fully covers. (2) `paymentReminders`
    net-of-credit (same trigger). (3) `DROP COLUMN sessions.package_anchor` (needs approval). No new-package
    auto-creation until (1): record a new pack by adding a lote row or marking sessions paid manually.
- [x] **Payment reminders + Comprobante auto-mark — BUILT & LIVE** (2026-09-24/25, Opus 4.8). Three-part
  billing automation; all live and hands-off (cloud crons, no laptop needed).
  - **WhatsApp templates** (WABA `1857507018469524`, submitted via the since-DELETED token-guarded
    `dh-tpl.mjs` Dualhook throwaway): **`recordatorio_pago_v2`** (id `3646376502176152`, **APPROVED** —
    patient reminder, bank block + dynamic URL button "Pagar con tarjeta" → `https://ppls.me/{{1}}`, suffix
    from env `PAYPHONE_LINK_SUFFIX`); **`comprobante_sin_identificar`** (`1595464335377117`, **APPROVED**);
    **`resumen_en_mora`** (`4657291211223040`, **PENDING** — needed a trailing line, Meta rejects a body
    ending in a variable, err 2388299). Old `recordatorio_pago` (`1871176587622662`) is APPROVED-but-dormant,
    superseded (its fixed numeric {{3}} forced "sesión(es)"). Gotcha: Dualhook 429s on rapid template create.
  - **Reminder protocol** (spec #8): `netlify/lib/paymentReminders.mjs` — rule: confirmada, tipo≠llamada,
    unpaid, fecha ≤ today−2 (GYE), `recordatorio_pago_at IS NULL`, `pago_excluido=false`; skip en-mora
    patients (reminded+unpaid); one msg/patient; sum monto; code-gen {{3}} sesiones-text; send via
    `sendDualhookPaymentReminder` (`whatsapp.mjs`). Scheduled `send-payment-reminders.mjs` cron
    `0 15 * * 1-6` (10:00 GYE Mon–Sat, never Sun), gated by **`PAYMENT_REMINDERS_LIVE=true`**. Manual
    `payment-run.mjs` (`?t=&mode=dry|live`). **Recipient = Option A**: always `patients.telefono`, NEVER
    payer routing (`payer_id` is invoicing-only); minors (`tipo_paciente='menor'`) store the tutor's number
    as the patient phone → greet tutor, name child in {{3}} ("la sesión de Camila del …"). Migrations:
    `sessions.recordatorio_pago_at` + `pago_excluido` + index (`supabase/payment-reminder-fields.sql`);
    **room-cap trigger now skips flag-only updates** so stamping pagado never trips ROOMS_FULL
    (`supabase/presencial-room-cap-trigger.sql`). Go-live boundary: 31 pre-22-Sep unpaid sessions flagged
    `pago_excluido` (Nicolás's last manual batch). Live-sent 24 Sep (22nd) + 25 Sep (23rd).
  - **Comprobante AUTO-MARK** (spec #2): `netlify/lib/proofOcr.mjs` (shared OCR, refactored OUT of
    `extract-proof.mjs` — both paths use it) + `netlify/lib/proofReconcile.mjs` (`decideAutoReconcile` +
    apply). Auto-marks paid ONLY when clean: matched patient · extraction `ok` · confidence≠low · recipient
    Mariana · amount = one session's price (oldest if several same-price — Nicolás's call) OR exact sum of
    all unpaid · `transfer_id` not reused. Else HOLD in Comprobantes (overpayment [until #19], partial,
    reused_reference, unreadable, unknown sender…). Scheduled `process-proofs.mjs` cron `*/10 * * * *`,
    gated by **`COMPROBANTES_AUTO_LIVE=true`** (skips entirely when off — no OCR churn); manual
    `proofs-run.mjs` (`?t=&mode=dry|live&days=N`). Sets `pagado/paid_at/metodo_pago` + `reconciled_*` +
    `auto_reconciled=true` (migration `supabase/whatsapp-messages-auto-reconciled.sql`); logs proof→session.
    Polling is ~free (idle run = 1 query); OCR cost is per-new-proof, independent of cadence.
  - **Gotcha:** Netlify function env changes (`PAYMENT_REMINDERS_LIVE`, `COMPROBANTES_AUTO_LIVE`,
    `PAYPHONE_LINK_SUFFIX`) only reach the running functions on the NEXT deploy — each needed an
    empty-commit redeploy. And a GitHub→Netlify webhook miss once skipped two commits; an empty nudge fixed it.
- [x] **/facturar REWRITTEN against the Contífico REST API — Chrome automation DELETED** (2026-09-23) —
  moved to `CHANGELOG.md` on 2026-09-27 to keep this file under 600 lines. `/facturar` runs entirely
  through `netlify/functions/facturar.mjs` (dry-run default, non-retroactive `FACTURAR_SINCE=2026-09-24`,
  token-guarded); full write-up in the changelog. The backlog summary still lives under "✅ DONE 2026-09-23" below.
> **Older completed work (2026-09-22 and earlier) lives in `CHANGELOG.md`.**
> It is deliberately not loaded into session context. Read it on demand.

## Pending / Backlog

### Lead bot — surfaced 2026-09-26/27
- [x] ~~#24 + #27 funnel v2~~ — DONE 2026-09-27 (`fdf9f67`/`8574b58`/`115063f`/`80025d6`); #30 history fix
      2026-09-27 (`9284328`). All in Completed Features.
- [x] ~~Get real phone numbers for the 4 therapists still `telefono IS NULL`~~ — **DONE** (#26, 2026-09-27):
      Camila, Daniela, Ma. Gracia, Sophia numbers saved in `therapists.telefono`. All 7 now have a number.
- [ ] **#27 follow-ups (surfaced 2026-09-27, none blocking):**
  - Tighten the felt delay: the fixed 20s sleep in `lead-reply-background.mjs` runs BEFORE the Claude call,
    so total is ~25s. Classify-then-wait-remainder would land it at ~20s.
  - **Package answer copy (surfaced #30):** "¿el paquete se paga por adelantado?" classifies as fixed `pago`
    intent → generic canned copy ("recordatorio 2 días *después*", single-session flow); packages are PREPAID.
    Add a package line or `pago_paquete` intent in `leadBrain.mjs`/`CANNED`. Low pri — Nicolás supervises leads.
  - **Burst debounce (surfaced #30):** rapid texts each spawn their own ~25s delayed reply, no cross-msg dedup
    → 2 location-ish Qs both fired the full `ubicacion` block. Invitation safely guarded (sent once). Pairs with
    the delay-tighten item: a per-lead coalesce window in `lead-reply-background.mjs` would collapse a burst.
  - Routing (`funnel_categorias`) is PROVISIONAL — replace when the "Mapa de casos" survey answers arrive on
    9933 (messages starting "MAPA DE CASOS"). Filter stays recibe_nuevos + first 3 + Francisco never bumped.
  - Enrich the `seguros` fact sheet as #14 (insurer catalogue) advances; Saludsa/Ecuasanitas % still "según plan".
  - Cost: each free-text msg = 1 Sonnet call (temp 0, ~2.5–4.5s). Fine at volume; consider Haiku if it spikes.
- [ ] **14-day funnel check — Sat 10 Oct 2026:** lead→call vs the 8% baseline, target ≥25% (exclude test
      phone `593968029896`). If the answer-first opening moved it, keep; else revisit copy/routing.

### ✅ DONE 2026-09-23 — /facturar REWRITTEN against the Contífico REST API
- Full write-up moved to `CHANGELOG.md` (2026-09-27). TL;DR: `/facturar` runs entirely through
  `netlify/functions/facturar.mjs` (Chrome protocol deleted); emit = `POST /documento/` → `PUT /sri/`;
  eligibility `confirmada + pagado + NOT facturada + tipo<>llamada + facturacion_obligatoria + fecha ≥
  FACTURAR_SINCE (2026-09-24)`, **non-retroactive**; Observaciones = `descripcion` (`Paciente {nombre} |
  {CIE} {dx} | Sesión {fecha}`); token in Netlify env `CONTIFICO_FACTURAR_TOKEN`; backfill applied. **Go-live
  parked (#16) — Nicolás flips it on manually.** All 20 obligatoria sessions dry-run READY.
- **DualHook send-scope + templates + CUTOVER — ALL DONE (cutover 2026-09-22, see Completed
  Features).** Send scope confirmed; `recordatorio_cita` **APPROVED**; **`deliverReminder` now POSTs
  Dualhook and reminders send live via Dualhook.** Twilio is retired-but-dormant behind
  `REMINDERS_PROVIDER` (default `dualhook`). (Payment-reminder templates + protocol shipped 09-24/25 —
  see the top of Completed Features.)

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
