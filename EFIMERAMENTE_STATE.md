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

### 2026-10-02 — /facturar go-live (cloud session)
- **First real run:** 5 facturas emitted + SRI-authorized (293 pending, see backlog) — 293 Laura Vásquez,
  294 Dorian Solis (Valentina Loor), 295 Germania Domínguez (Micaela Castro), 296 Laura Vásquez
  (Raguel Conforme), 297 Gabriela Páliz (Thomas Quevedo). All marked `facturada`.
- **SRI date rule:** `fecha_emision` is ALWAYS today (America/Guayaquil) — `todayEcuador()` in
  `facturar.mjs`. The SRI rejects any other date (cod_error 1017). Session date stays in Observaciones.
- **Dirección rule:** every factura's dirección is Quito (default kept on purpose, per Nicolás).
- **`patients.nombre_factura`** (migration `supabase/patient-nombre-factura.sql`): optional override for the
  name in Observaciones. Set for Cecilia Saltos (mother, "Cecilia Saltos") and her daughter's record
  ("Valentina Loor") — both `facturacion_obligatoria`, both billed to new payer **Dorian Solis**
  (cédula 1717217796).
- **Guard token rotated:** `CONTIFICO_FACTURAR_TOKEN` (Netlify, production, secret) replaced 2026-10-02 —
  the old value was unreadable. Not a Contífico credential; Contífico keys untouched (Nicolás: never rotate them).
- **WhatsApp the factura PDF (RIDE)** — `netlify/lib/facturaWhatsapp.mjs` + facturar modes `ride-template`,
  `ride-template-status`, `send-rides` (plan by default; `&confirm=SEND-RIDES` sends; `&session_id=` for one).
  Template **`factura_sesion_link`** (Meta id 1097153113160012, UTILITY): "Hola {{1}} 🌿 Te enviamos la factura
  de {{2}}…" + **"Descargar factura"** URL button → the RIDE. The attached-PDF variant (`factura_sesion`)
  is impossible via Dualhook (it 404s Meta's upload API). Recipient = **payer's phone, else patient's**
  (Dorian Solis has none → Cecilia Saltos, by Nicolás's choice). New columns `sessions.contifico_doc_id`
  (stamped on emit, backfilled for 293–297) + `factura_enviada_at` (no double sends) —
  `supabase/sessions-factura-whatsapp.sql`. Template example is a generated placeholder PDF/fake URL —
  never a real RIDE (diagnoses). **APPROVED 2026-10-03; sent + delivered:** 296→Laura, 294→Cecilia, 295→Germania,
  297→Gabriela. 293 auto-held (not SRI-authorized). Copy wasn't checked with Nicolás first — he'd have
  changed it: ALWAYS show patient-facing copy before submitting a template. **Next:** add send-rides as
  `/facturar` step 5 (after emit + SRI authorization).
- **`/marketize`** moved into the repo (`.claude/commands/marketize.md`); importer reads secrets from env
  too, so it runs in cloud sessions.
- **Netlify env hygiene:** plaintext `dev`-context copies of SUPABASE_SERVICE_KEY + 4 Twilio vars blanked.
  Still non-secret: VAPID_PRIVATE_KEY, LEAD_TOOLS_TOKEN, WA_CLOUD_VERIFY_TOKEN (connector can't flip them).
- [x] **First QualifiedLead / CAPI Meta campaign LAUNCHED** (2026-10-01, Opus 4.8) — *marketing ops, no repo code; built in Ads Manager via browser automation.* First campaign feeding the #22 CAPI.
  - **Account correction (important):** the real Efimeramente ad account is **`2663225010700511`** ("Efimeramente 2da Cuenta"), business portfolio `1077659662089797`, dataset/pixel `1131866282506788`, WhatsApp `+593 96 845 9933`. The `2199122680304491` written in the ad brief is **WRONG/empty** (only a leftover Reach draft). Saved as memory `meta-ad-account.md`.
  - **Campaign** `Efimeramente · Embudo v2 · QL · 2026-10-01` (id `120255397227890119`): objective **Clientes potenciales (Leads)**, Auction, **CBO off** (ad-set budgets), 20%-share off. Two A/B ad sets, **$10/day each ($20/day)**.
    - Ad set A `120255397227900119` → ad A `120255397227910119`: video **Stutz-Inversión-Final.MOV**, copy on Stutz's *Inversión del Deseo*.
    - Ad set B `120255397432140119` → ad B `120255397432130119`: video **Gottman-Madera-Final.mov**, copy on Gottman's *4 jinetes*. Shared headline "Herramientas desde la 1ª sesión", CTA Enviar mensaje de WhatsApp.
  - Both ad sets: conversion location **WhatsApp**, goal **"Maximizar el número de clientes potenciales"** (messaging/CAPI leads optimization), bid Volumen más alto, saved audience **"Publico Septiembre 2026 - arreglado"** (cloned from `TimBurton-Claymation2`, the old Interacción campaign used as baseline) + edad 25–40.
  - **Gotchas for next time:** (1) **QualifiedLead has NO explicit event picker on WhatsApp conversion location** — that selector only exists in the Website-conversion flow; the WhatsApp leads optimization is fed by the messaging CAPI + WhatsApp Business lead labels (Nicolás approved this as the path). (2) Selecting "Maximizar clientes potenciales" from the dropdown **reverts to "conversaciones"** — you must click **"Aplicar"** on Meta's recommendation card to make it stick. (3) **Manual placements are gone** — Meta forces Advantage+ placements (all); can't replicate a manual placement list anymore. (4) **Ad account timezone = "Hora de Colombo" (GMT+5:30), not Ecuador** — pre-existing misconfig (TimBurton too); shifts daily-budget resets + reporting day boundaries. (5) Videos are 9:16 → tagged "Sin optimizar" for feed (Meta crops). (6) Video upload: the 64–74 MB files exceed the browser-automation 10 MB cap AND Downloads isn't a shared folder — **Nicolás had to upload them manually** via the Subir button.
  - **Published by Nicolás** (campaign live, spending). Next: watch for `QualifiedLead` events in Events Manager (dataset `1131866282506788`) once real ad-clicks book via the bot — this is the live test of the #22 backlog item.
- [x] **Lead bot — second "not a lead" bug: outbound-first senders + payment receipts** (2026-10-01, Opus 4.8).
  Two senders were wrongly greeted as new leads (bot asked "¿motivo de consulta?"): (A) +593985506258 — Nicolás
  wrote him payment details by hand first, he replied with a transfer screenshot; (B) the general case where
  we message someone first and they reply by text. Three surgical fixes, no destructive DDL:
  - **(1) Store outbound echoes.** `handleEchoes` (`netlify/lib/leadBot.mjs`) now, besides pausing existing
    leads, persists each `smb_message_echo` as an `outbound` `whatsapp_messages` row — keyed by the recipient's
    digits at `raw_payload->>'to_digits'`, `twilio_sid`=echo wamid (dedupe via the existing unique index +
    `upsert onConflict twilio_sid ignoreDuplicates`), `received_at`=echo timestamp. Previously echoes were only
    used to flip `bot_paused` and were never stored, so "did we write this number first?" was unanswerable.
  - **(2) Not-a-lead rule.** New `hasEarlierOutbound(supabase, from, beforeMs)` in leadBot; `recordLead` now
    skips (returns null — no lead row, bot silent) for an ORGANIC sender when EITHER an earlier inbound OR an
    earlier outbound to them exists before their current inbound's timestamp (+1s skew). Ad-click leads
    (`meta_ctwa`) still always create a row, same as before.
  - **(3) Receipts bypass the funnel.** `whatsapp-cloud-webhook.mjs`: the lead block is now gated with
    `isReceiptMedia = msg.type === 'image' || 'document'` → images/PDFs never create a lead or trigger the bot.
    The comprobante flow (#2) already OCRs every inbound image+document, so nothing is lost. In
    `proofReconcile.mjs#decideAutoReconcile`, a non-receipt (`ex.is_payment_proof === false`) is now `skip`ped
    SILENTLY (checked before the unmatched/extraction branches) so random photos don't spam Nicolás; and
    `MOTIVO.unmatched` reworded to **"comprobante de número desconocido"** (the alert already carries the OCR
    sender name + amount). Unknown-number alert still requires `COMPROBANTES_AUTO_LIVE=true`.
  - **Index:** `supabase/whatsapp-messages-outbound-to-idx.sql` (partial index on `(raw_payload->>'to_digits')
    WHERE direccion='outbound'`) — applied via `apply_migration whatsapp_messages_outbound_to_idx`.
  - **Part 3 verified, no change:** the 30 Sep +593984765268 "saludo" misclassifications (agendar / named
    therapist Carolina) are already fixed by commit `b23a353` (today 10:12) — the deterministic
    `isAgendarText` / `matchTherapistInText` layer + the `agendar`/`terapeuta_nombrado` intents. Those decisions
    predate the commit.
  - **Tests for Nicolás (not runnable from here — need his phone):** reset his test number 593968029896 to a
    clean slate (deleted its lead / lead_ai_decisions / whatsapp_messages). (a) from 9933 write to 593968029896
    by hand first, then send a text from that phone → bot must NOT reply (needs his number in
    `LEAD_BOT_TEST_PHONES` or `LEAD_BOT_LIVE=true` for the test to be meaningful). (b) send a transfer-receipt
    image from a NEW number → no greeting; comprobante alert fires only if `COMPROBANTES_AUTO_LIVE=true`.
  - Build green; `leadBot.mjs`/`proofReconcile.mjs`/`whatsapp-cloud-webhook.mjs` `node --check` clean. Not touched
    (per instruction): routing, CAPI, the reply delay. Historical false lead db066c09 (+593985506258) left in
    place (already `bot_paused`); delete manually if funnel metrics need it.
- [x] **Lead bot — burst coalesce + tighter felt delay** (2026-10-01, Opus 4.8). Both #27/#30 follow-ups,
  entirely inside **`netlify/functions/lead-reply-background.mjs`** (the delayed-reply background fn); no
  schema change, no change to the webhook's fire-per-message flow (only its stale "FIXED 20s" comments updated).
  - **Tighter delay:** the up-front wait is now `WAIT_MS = REPLY_DELAY_MS(20s) − CLASSIFY_BUDGET_MS(5s)` = 15s,
    so the Sonnet classify (~2.5–4.5s, 8s cap) overlaps the remainder and the Claude path lands near 20s instead
    of ~25s (the old bug: a fixed 20s `sleep` ran BEFORE `runBot`→Claude). Deterministic paths (named therapist
    / agendar / greeting, no model call) now reply a touch sooner (~15s) — acceptable.
  - **Burst coalesce:** a lead firing N quick texts still spawns one background invocation each, but only the
    LAST replies, and it replies to the WHOLE burst folded into one message. Coordination is stateless (separate
    fn instances): after the wait, one newest-first query over `whatsapp_messages` (inbound, matched on
    `raw_payload->message->>from` = phone digits, limit 15) serves both jobs — (a) **bail** if `rows[0].twilio_sid
    !== msg.id` (a newer inbound landed during the wait → a later invocation, waking after its own wait, answers
    the full set); (b) **gather** every inbound text with `received_at > lead.last_bot_at` (the unanswered burst),
    strip media markers (`[`-prefixed), join chronologically, and pass a synthetic `{type:'text', text:{body}}`
    to `runBot`. So the deterministic + Claude layers classify the full thought, not just the first line.
  - **Why not literal "classify-first-then-wait" (the backlog wording):** classifying up front on each message
    would do N model calls on fragments and reply to only the first line — it doesn't compose with coalesce.
    Wait-then-classify-the-combined-text (shaved by the classify budget) gives both the ~20s delay and one
    coherent answer. Single-message behaviour is byte-identical except the shorter wait (combined === myText ⇒
    original `msg` is used; no bail since `rows[0]` is itself).
  - **Edges handled:** `bot_paused` during the wait → early return (also caught by `runBot`); brand-new lead's
    first burst → winner has `isNew=false` but `step_actual` still null ⇒ `firstTouch` true, welcome path intact;
    media-tail burst → `myText` empty ⇒ falls back to original-msg handling (`renderStep`). Build green; both
    fns `node --check` clean. **Not yet observed against a real multi-text burst in prod** — watch Marketing →
    Embudo / function logs on the next live burst.
- [x] **Lead-bot classifier fix — booking intents no longer read as greetings** (2026-10-01, Opus 4.8).
  Live bug (lead +593984765268, 30 Sep): "me gustaría agendar mi primera cita" and "quiero empezar mi cita
  con la Dra. Carolina Almeida" were classified `saludo` by the model → 3 identical "Hola! 🌿 Cuéntame, en qué
  te puedo ayudar" bubbles + 8h silent. Fixed at the root with a **deterministic layer that runs before the
  model** in `netlify/lib/leadBot.mjs#handleFreeText`, plus prompt tightening in `netlify/lib/leadBrain.mjs`.
  - **The bad greeting text is GONE.** The ONLY greeting is now the spec one: `welcomeAndReasons()` sends
    "Hola! Qué gusto que nos escribas" + the reason list ("Me dirías tu motivo de consulta?"). The two
    `'Hola! 🌿 Cuéntame…'` dead-ends (old `handleFreeText` non-firstTouch + `applyDecision` saludo-no-categoria)
    and the two `'Cuéntame, en qué te ayudo 🙂'` nudges (`renderStep` fallback + `runBot` media note) were
    removed — those paths now fall through to `showReasonList`.
  - **New `handleFreeText` priority order:** gracias → diagnostico/varios prompt steps → safety-net pushes →
    **(1) named therapist** → **(2) bare greeting** → **(3) agendar** → **(4) Claude**. Order matters:
    a therapist name beats a booking verb ("quiero empezar mi cita con la Dra. Carolina Almeida" → Carolina).
  - **Named-therapist detection is deterministic + model-independent** (`matchTherapistInText` over
    `allTherapists`, accent-insensitive, matches full name → apellido → ≥5-char first-name token on word
    boundaries). This is why it catches Mariana/Daniela, whom the model never sees (they're `recibe_nuevos=false`
    so absent from the fact sheet). `namedTherapist()`: always `pushNicolas` (safety net a), then if
    `recibe_nuevos=false || id===MARIANA_ID` → handoff + pause, else render that one therapist's card
    (`renderCards([t], {intro})`) with the normal "Quiero conocerla/o" button → existing pick flow.
  - **`agendar`** (`isAgendarText`, no therapist named) → reason list directly, no greeting.
  - **Classifier (`leadBrain.mjs`):** `saludo` is now ONLY a pure greeting; added intents `agendar` and
    `terapeuta_nombrado` (+ a `terapeuta` output field the code resolves via `resolveTherapistByName`) to
    `INTENTS`, the tool schema, `SYSTEM_RULES`, few-shots, and the `decideFreeText` return. The model is a
    backstop; the deterministic layer is the authority. **Not a restructure** — enum + prompt lines only.
  - **Dedup + safety nets** (migration `supabase/lead-funnel-07-greeting-dedup.sql`, applied;
    `leads.saludo_enviado` / `last_bot_text` / `stuck_push_at`): `say()` never sends the same text twice in a
    row; greeting sent once per lead (`saludo_enviado`). Pushes to Nicolás (owner-only, `notifyTherapist(null)`,
    no pause): (a) any `terapeuta_nombrado`, (b) `maybeReengagePush` — lead writes again after >1h without
    moving past `nuevo/toco/eligio_terapeuta`, (c) `maybeStuckPush` — ≥3 inbound and still on the starting step
    (once, via `stuck_push_at`).
  - **Verified** end-to-end against the LIVE DB with the WhatsApp send layer mocked (all 4 cases route without
    touching the model): "buen día" → greeting once + list · "quiero agendar una cita" → list only, no re-greet
    · "quiero una cita con Carolina Almeida" → Carolina card + push · "quiero con Mariana" → handoff + pause.
    `lead_ai_decisions` logged `agendar` / `terapeuta_nombrado:Carolina` / `terapeuta_nombrado_cerrado:Mariana`
    (model `regla`). Also broadened greeting detection so "buen día"/"buen dia" are caught (`classifyKeywords`
    saludo regex + `isBareGreeting` strip).
- [x] **#4b Funnel cards v2 + final routing + Mapa de casos matching — SHIPPED & LIVE** (2026-09-28, Opus 5).
  Commits `800c3f0` → `77f838e` → `1241e8c`. Source of truth for all of it:
  `~/Desktop/MD FILES - MISCELANEOUS/MAPA DE CASOS.md` (survey answered by the team 27–28 Sep).
  - **Cards (`scripts/build-cards.mjs`, new):** renders `public/cards/<slug>.jpg` from a photo in `~/Downloads`
    + the copy in the `CARDS` array. **Slugs are load-bearing** — they're what `therapists.funnel_card_url`
    points at, so renaming one breaks the bot's image cards. Chrome headless screenshot at 2× → `sips`
    downscale → JPEG q86. Webfont (DM Sans) is fetched at render time.
    - The photo is shown **WHOLE — never cropped or zoomed** (Nicolás, 28 Sep: a face-crop v1 looked "crammed").
      Width fixed at 989 so the set looks uniform in a chat; **height follows each photo's aspect**, so
      Carolina (989×1690) and Sophia (989×1629) are taller than the other four (989×1410).
    - Card carries ONLY: whole photo, name, one education line. **The 3 areas are NOT on the card** — they live
      in `therapists.funnel_caption`, which `renderCards` already sends as the message text beside the image.
    - `scripts/face-detect.swift` (macOS Vision) is still run but **only as a sanity check** — a portrait with
      no detectable face means the wrong file was picked up. It no longer drives framing.
    - **Gotcha:** the photos were "in Recents" in Finder, not a folder. `mtime`/`birthtime` are the ORIGINAL
      shoot dates (Mar–Aug 2026) because macOS preserves them on download — the field that proves recency is
      **`kMDItemDateAdded`** (`mdls`). Don't conclude "no new photos" from mtime again.
  - **Captions:** `therapists.funnel_caption` rewritten to the 3 areas as `• `-prefixed lines, no Enfoque.
    Multi-line captions broke the two prompts that list one therapist per line, so `leadBrain.mjs` now has
    `oneLine()` and both `buildFactSheet` and `matchTherapistsForText` flatten before embedding.
  - **Routing:** `funnel_categorias.terapeutas` set to the final ordered lists for all 7 active categories
    (hijo / ruptura / problemas_pareja / depresion_ansiedad / consumo / terapia_pareja / trauma). Verified by
    query that Francisco is in the visible top-3 everywhere he's listed; `terapia_pareja` is the one category
    he's deliberately absent from (✗ for joint couples work). Daniela is stored but `recibe_nuevos=false`, so
    she's filtered out of every list today. The "never bump Francisco" guard already lived in `resolveCards`.
  - **Reasons 7 + 9 now match against the matrix (`netlify/lib/mapaCasos.json`, new):** motivos / poblaciones /
    diagnósticos (★ ○ ✗) + each therapist's stated exclusions. Only the roster's rows are rendered into the
    prompt (`mapaBlockFor`), so the model sees specialties and no-gos instead of marketing copy.
    - Exclusions are enforced **in code, twice**: `matchTherapistsForText` pre-filters the roster (an excluded
      therapist is never offered) and re-filters the model's answer (a hallucinated name can't slip past).
      All candidates ruled out ⇒ `derivar` with motivo `sin_fit_exclusiones`, never an empty card list.
    - `readSignals` reads **only what the lead states outright** — an explicit age, "adicción". **"mi hijo" with
      no age does NOT hard-filter**; it's passed to the model as context, because silently dropping a good match
      on a guessed age is worse. Age parsing excludes durations: "llevo 8 años de casado" is not an 8-year-old
      (that bug would have dropped 4 therapists from a couples case — caught in testing, fixed before ship).
    - `_mapa` is exported from `leadBrain.mjs` purely so the deterministic half can be checked without a
      network call (no test runner in this repo).
    - Self-harm / eating disorders / psychosis / bipolar keep deriving to Nicolás, unchanged.
  - **esbuild note:** the JSON is imported with `with { type: 'json' }`; verified it bundles (esbuild 0.25,
    `node_bundler = "esbuild"`) and inlines into the function.
  - **Verified end-to-end** via synthetic Cloud-API webhooks from `593968029896` (no signature needed —
    `WA_CLOUD_APP_SECRET` is unset; `LEAD_BOT_TEST_PHONES` already held the number): reason 1 → cards/hijo,
    reason 4 → cards/depresion_ansiedad, reason 7 "tengo TDAH" → **`match_diagnostico: Maria Gracia, Francisco`**
    (2.0s, `used_fallback:false`). Two names not three is CORRECT — TDAH is ✗ for the other four.
- [x] **#22 Meta Conversions API (CAPI for Business Messaging) — SHIPPED & LIVE** (2026-09-27, Opus 4.8).
  Commits `9091db5`→`5d7c02c`. Reports each Click-to-WhatsApp lead's funnel progress to Meta, keyed on its
  `ctwa_clid`, so the campaign can optimize on real outcomes. **`CAPI_LIVE=true`** (rollback: unset it).
  - **Data:** migration `supabase/lead-funnel-06-capi.sql` — `leads.ctwa_clid` + `capi_{lead,schedule,
    purchase}_sent_at` + partial index. Backfilled `ctwa_clid` from `whatsapp_messages.raw_payload->message->
    referral->ctwa_clid` (**11/11 ad leads**; 3 organic have none). `recordLead` (leadBot.mjs) captures it
    going forward (`referralOf` returns it; backfills onto a known contact who later clicks an ad).
  - **Transport = Plan B (the Dualhook proxy is messaging-only — it 404s the `/dataset` + `/events` edges).**
    A Meta **system-user token** `efimeramente-capi` (portfolio `1077659662089797`, scopes
    `whatsapp_business_management` + `whatsapp_business_manage_events`; **ads_management wasn't offered on the
    "Efimeramente" app** — only needed for the campaign-goal switch, a manual step) lives in Netlify env
    **`META_CAPI_TOKEN`** (production, secret, never-expires). `netlify/lib/capi.mjs` auto-switches to
    `graph.facebook.com` when it's set, else falls back to Dualhook. **Dataset = `1131866282506788`**
    (`META_DATASET_ID`, from `GET /{WABA 1857507018469524}/dataset`) — NOT the legacy Events-Manager one
    (1722418552501748).
  - **Events (business_messaging enum — web names 'Lead'/'Schedule' are REJECTED):** category picked →
    `LeadSubmitted` · intro call booked → `QualifiedLead` (**optimize the campaign on this**) · first paid
    real session → `Purchase` (value USD). Fired by the **`lead-followups` cron** (Phase E, `sweepCapiEvents`),
    idempotent via the `capi_*_sent_at` cols + deterministic `event_id` (`<lead_id>:<event>`). Test phone
    excluded unless `CAPI_ALLOW_TEST_PHONE=true`. Never touches `convirtio`.
  - **Ops endpoint `netlify/functions/capi-admin.mjs`** (token-guarded by `WA_CLOUD_VERIFY_TOKEN`):
    `status` / `discover` / `sweep` / `test-event`. (The arbitrary-Graph `raw` passthrough was removed after
    the stop-condition probe.) **Validated:** all 3 event types returned `events_received:1` with test code
    `TEST51990`. **Gotcha:** Meta shows the token once — copy via the dialog + `pbpaste`→`netlify env:set` in
    ONE atomic call (clipboard can get swapped between calls). Netlify CLI installed + linked this session.
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
- [x] **Lead funnel v2 (#27) — "answer first, then offer" + VERBATIM canned answers** (2026-09-27) —
  **moved to `CHANGELOG.md`** on 2026-10-01. TL;DR: Message 1 removed; bare greeting → welcome + 10-reason list,
  a question → Claude answers then the one-time invitation. Claude only CLASSIFIES an `intent`; code sends the
  verbatim `CANNED` map in `leadBot.mjs` (`sendCanned`). `funnel_categorias` reseeded (10 reasons, `descripcion`
  col); `funnel_knowledge` fact sheet; night/day handoff via `isNightGYE`; 20s delay + typing in
  `lead-reply-background.mjs`. Commits `8574b58`/`115063f`/`80025d6`, migration `funnel_v2_schema`
  (`supabase/lead-funnel-05-v2.sql`).
> **Lead funnel #24/#27/#4+#20 full records → `CHANGELOG.md`** (2026-10-01). Live operational record still in
> the "✅ Lead funnel" section near the top of this file.
- [x] **#19 saldo a favor (comprobante→lote, net-of-credit matching/reminders, 4-pack retired, comprobante
  warning, Sesiones search fix)** (2026-09-26/27) + **Payment reminders + Comprobante auto-mark** (2026-09-24/25)
  + **/facturar REST rewrite** (2026-09-23) — all **moved to `CHANGELOG.md`**. Key env flags:
  `PAYMENT_REMINDERS_LIVE`, `COMPROBANTES_AUTO_LIVE`, `FACTURAR_SINCE`; files `saldo.mjs`/`proofReconcile.mjs`/
  `facturar.mjs`. Backlog summaries still under "✅ DONE" below.
> **Older completed work (2026-09-22 and earlier) lives in `CHANGELOG.md`.**
> It is deliberately not loaded into session context. Read it on demand.

## Pending / Backlog

### 🔴 Contífico cleanup — surfaced 2026-10-02 (first real /facturar run)
- [ ] **Delete the orphan draft FAC 001-001-000000292** in Contífico (id `y7aA5E2lMiP1YagZ`, Laura
      Vásquez, $36, fecha 25/09/2026, estado P, NEVER authorized). Created by the first emit attempt,
      which the SRI rejected (cod 1017 — fecha must be today). The session was re-invoiced correctly
      as **293**. The function has no delete mode; remove it by hand in Contífico (or add a guarded
      `DELETE /documento/<id>/` mode). Leaves a gap at 292 — fine, it was never sent to the SRI.
- [ ] **Confirm 293 got SRI authorization** (Laura Vásquez, 25 Sep session): signed but still
      `autorizacion:null` minutes after emission, unlike 294–297. Check
      `mode=recon&resource=documento&id=KBe18knZMi0ERdXy`; if stuck, authorize it from the Contífico web UI.

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
    **books via the bot** (web `/agendar` doesn't stamp `agendo_at`, so CAPI stays dormant until leads flow through
    the live bot). For his own phone set `CAPI_ALLOW_TEST_PHONE=true` first (else the test phone is excluded).
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
