# Efimeramente — Changelog (archive)

Completed work, 2026-09-14 and earlier. Split out of `EFIMERAMENTE_STATE.md` on 2026-09-22
(and trimmed on demand) to keep session startup cheap. **Not loaded automatically — read on demand.**

Newest first.

<!-- moved from EFIMERAMENTE_STATE.md by /cierre 2026-10-05 (#49b) -->
### 2026-10-04 — #41 lead templates _v2 (Nico voice) + v1→v2 auto-switch (executor, f87944f)
- `netlify/lib/leadTemplates.mjs`: new `TEMPLATES_V2` (`<base>_v2`, field `base`) — Nicolás's verbatim copy, no
  emoji/¡¿, "Att: Nico"; examples + BUTTONS reused from v1 objects (identical texts → leadBot reply handlers match
  on button text/payload + `resultado_llamada_wamid`, no change needed). v1 `TEMPLATES` untouched.
- Auto-switch: `primeTemplateStatuses()` (one GET via `listTemplates()`, called at the top of each lead-followups
  run; lazy w/ 15-min TTL for the webhook's rebook send) + `pickTemplateName(base, statuses)` → `_v2` only if
  APPROVED **and in the category we requested**; PENDING/REJECTED/reclassified/fetch error → v1. `sendTemplate` resolves.
- `submitTemplates()` default is now the `_v2` set (names may pick v1 or v2). Dualhook 429s after 2 creates —
  submit one `?name=` at a time with ~60s gaps.
- Status at close: `rebook_llamada_v2` APPROVED (MARKETING, live now); `recordatorio_llamada_v2` + `resultado_llamada_v2`
  PENDING (UTILITY); `primera_sesion_v2` PENDING but **reclassified UTILITY→MARKETING** (v1 is MARKETING too) → the
  switch keeps v1 for it until Nicolás decides (set its `category` to 'MARKETING' to accept).

<!-- moved from EFIMERAMENTE_STATE.md by /cierre 2026-10-05 (#49) -->
### 2026-10-04 — #37 bot copy/flow polish + #40 new CAPI LeadSubmitted signal (executor, 80615a7 + cb967de)
- **Style rule (hard):** no emojis, no opening ¡ ¿ in patient-facing bot text; the bot speaks as "Nico".
  Enforced by `cleanBotText()` in `netlify/lib/waSend.mjs` on EVERY session send (text, button/list/card
  body/header/titles; ids untouched). waSend's send fns are imported ONLY by `leadBot.mjs` → templates /
  payment reminders / invoices never pass through it. Source strings + leadBrain SYSTEM_RULES cleaned too.
- **First question everywhere** = `showQuien()` (leadBot): "Hola, hablas con Nico. Cuéntame, para quién buscas
  empezar terapia?" [Para mí][Mi pareja y yo][Mi hijo/a] (`quien:yo|pareja|hijo`; "Hola…" only if !saludo_enviado).
  Replaces welcomeAndReasons/showReasonList-as-first on all paths (bare greeting, prefill, isAgendarText, intent
  agendar, unresolved terapeuta, invitation Sí w/o categoria, renderStep). New `leads.quien` column records the tap.
- **Deterministic prefills** (`prefillKind()`, no model): "Me gustaría empezar terapia con ustedes" → quien;
  "Quiero saber el precio" → CANNED.precio + invitation; "más información"/"info" → precio + ubicacion + invitation.
- **Para mí** → list "Perfecto. Qué te trae a terapia?" / "Ver opciones" (funnel_categorias `hijo`,
  `terapia_pareja` now activo=false; `chooseReason` no longer filters on activo). **Pareja** → CANNED.pareja +
  Carolina card. **Hijo** → age buttons (`edad:nino|adolescente|adulto`) → hidden rows `hijo_nino`,
  `hijo_adolescente`, `hijo_adulto` (activo=false). Any path landing on categoria `hijo` asks the age.
  ⚠️ resolveCards still caps at 3 cards → adolescente drops Carolina, adulto drops Ma. Gracia + Carolina.
- **Nudge:** ONE at +22h (`NUDGE_TEXT`, "…Att: Nico"), then stage frio (lead-followups `lt('nudges_sent',1)`).
- **#40 CAPI:** `leads.precio_visto_at` stamped on CANNED.precio/pareja, a Claude "libre" answer with `$<d>`,
  and Nicolás's manual echo with `$<d>` (handleEchoes). `capi.mjs#leadSubmittedDecision()` (pure): fire when
  ≥2 inbound after precio_visto_at (taps count; reaction/edit/revoke/unsupported don't) → event_time = 2nd msg,
  OR eligio_terapeuta_at → that time; earliest fresh wins; >7 days old → skip (`summary.stale`), no stamp.
  Old "categoria set" trigger removed. Migration `lead_funnel_09_precio_signal` (`supabase/lead-funnel-09-precio-signal.sql`).
- **Backfill:** precio_visto_at set on 6 leads (lead_ai_decisions canned replies + outbound `$` echoes since 26 Sep);
  sweep sent **1** new LeadSubmitted.
- **Meta Step 0 (4 Oct, read-only):** B Gottman 6.904 impr / 4.984 reach / 10 results / $2,86 CPR / $28,62 spent;
  A Stutz "En preparación", 0 impr, $0 — NOT delivering. Account shows "Revisar y publicar (12)" pending drafts.
  Events Manager: LeadSubmitted 10 total, active, no warnings.
- Harness (not committed): scratchpad stubs fetch + supabase, walks all flows; 0 emoji/¡¿ in 46 payloads.

<!-- moved from EFIMERAMENTE_STATE.md by /cierre 2026-10-05 -->
### 2026-10-04 — #35 infra + director/executor split (cloud session, 1356ac2)
- **Split from now on:** cloud session = **director only** (prioritizes, writes prompts, verifies read-only);
  Mac terminal Claude Code = **executor** (builds, migrations, deploys, /facturar; blanket permissions).
- **Director docs:** `CLAUDE.md` "Director docs" → Drive folder "Efimeramente · Claude" (`PERMANENT TO-DO.md`
  = priorities). `/cierre` step 5 replaces that file in Drive (create new + trash old — the connector can't
  overwrite content, so its file id changes every time; find it by title).
- **`CONTIFICO_FACTURAR_TOKEN` re-generated** in Netlify (production, functions) and deployed. It ended up
  marked **secret** → unreadable. Nicolás (2026-10-04): this token is NOT sensitive, don't rotate it for
  safety. If a session needs its value (e.g. for /facturar), the executor re-creates it as a NON-secret var
  (delete + add, redeploy) — that's the only way to read it again.
- **Key policy (Nicolás):** never ask him to save/copy/handle keys. Netlify env is the only key store;
  `VAPID_PRIVATE_KEY` / `LEAD_TOOLS_TOKEN` / `WA_CLOUD_VERIFY_TOKEN` stay **non-secret on purpose** (sessions read
  them via the Netlify connector). The cloud session's auto-mode classifier blocked copying keys to Drive and
  editing CLAUDE.md with this rule → the executor should add it to CLAUDE.md "Environment variables".
- ⚠️ **DB leftovers to drop (executor):** a duplicate #34 attempt left 4 UNUSED functions, no triggers —
  `link_lead_from_session()`, `link_lead_from_patient()`, `lead_link_rank(text)`, `phone_last9(text)`. Live ones
  are `lead_link_from_*` + `trg_lead_link_from_*` (cb39f59). Drop:
  `drop function if exists link_lead_from_session(), link_lead_from_patient(), lead_link_rank(text), phone_last9(text);`
  (the cloud Supabase connector waits for approval on destructive SQL and times out).
- **Supabase connector gotcha (cloud):** any DROP/destructive statement hangs → 60s timeout; also a
  pre-existing `lead_stage_rank(stage text)` exists in DB (used by the #34 triggers) — don't redefine it.

### 2026-10-02 — #34 CAPI hole closed: hand-handled leads now link to the panel (Opus 4.8)
Leads Nicolás takes over (`bot_paused`) and books by hand never advanced `leads.stage`, so the CAPI sweep
never fired QualifiedLead/Purchase for them — the best leads. **Fix = two DB triggers** (chose triggers over
server code: `queries.js` is client-side and `leads` RLS is owner-only, so a therapist's session write can't
touch `leads`; `public-booking` is another path; a `SECURITY DEFINER` trigger catches every path + bypasses RLS).
Migration `lead_funnel_08_panel_link`, mirror `supabase/lead-funnel-08-panel-link.sql`:
- `lead_link_from_session()` / `trg_lead_link_from_session` (AFTER INSERT OR UPDATE OF patient_id,tipo,pagado ON
  sessions): matches the session's patient to a lead by **last-9 phone digits**; backfills `leads.patient_id`
  (→ Purchase); `tipo='llamada'` → sets `session_id` + advances stage→`agendo` (`agendo_at`) → QualifiedLead;
  **paid** non-llamada → stage→`paciente`. `lead_stage_rank()` makes stage move **forward only**. All patches
  only-if-null / only-forward → idempotent (safe alongside the bot's own linking).
- `lead_link_from_patient()` / `trg_lead_link_from_patient` (AFTER INS/UPD OF telefono ON patients): panel-created patient matching an unlinked lead → sets `leads.patient_id`.
- **Backfill** (leads since 2026-09-26): linked **1 lead** (`73940c73`, was `bot_paused`+stuck at `toco` with a
  hand-booked llamada → now `agendo`; organic, no `ctwa_clid`, so sweep won't report it but funnel is honest).
- **Stop-condition clear:** no lead matches >1 patient by last-9 (leads unique by last-9). Verified end-to-end on
  the test number (seeded `toco`+paused+`ctwa_clid` lead → hand-booked llamada → advanced to `agendo`, links set,
  `capi_schedule_sent_at` null = valid sweep target); test rows cleaned up.
- **Gotchas:** (1) `leads.session_id` FK has **no `ON DELETE SET NULL`** — hard-deleting a linked session errors
  (delete the lead first); pre-existing, now more common. (2) Meta "Test Events" leg NOT run — `CAPI_TEST_CODE`
  unset (events route to production) + `CAPI_ALLOW_TEST_PHONE` off; manual recipe in the #22 backlog bullet below.

<!-- moved from EFIMERAMENTE_STATE.md by /cierre 2026-10-04 pm -->
### 2026-10-02 → 10-04 — /facturar go-live + WhatsApp invoices (cloud session)
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
  changed it: ALWAYS show patient-facing copy before submitting a template. Wired into `/facturar` as
  **step 6** (`.claude/commands/facturar.md`: plan → Nicolás's OK → send → confirm in `whatsapp_delivery_status`).
- **Back-invoicing missed sessions (2026-10-03):** sessions before `FACTURAR_SINCE` were never invoiced by hand
  (Laura's + Cecilia's chats). `emit-one&before_floor=1` invoices ONE named pre-floor session; `batch` keeps
  the floor (backlog never swept). `send-rides` has **no date floor** (`contifico_doc_id` is only set by our own
  emissions). Emitted + sent **298/299** (Valentina 5 & 15 Sep), **300** (Cecilia 17 Sep) → Cecilia; **301**
  (Emilie) + **302** (Raguel) 18 Sep → Laura (sessions moved 19→18 Sep per Laura). Raguel 12 Sep skipped on purpose.
- **SRI authorization lag:** 293 and 298–302 sat signed-but-unauthorized for hours (overnight) while 294–297
  authorized in seconds — not batch-vs-single; SRI "offline" mode allows up to 24h. Just wait / re-check next day;
  `send-rides` only sends authorized docs, so nothing goes out early.
- **Greeting name:** `rideRecipient` greets non-menor patients with `nombre_factura`'s spelling ("Cecilia", not
  the record's "Cecília").
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
- [x] **#22 Meta CAPI + #30 `recentInbound` fix** (2026-09-27) — **moved to `CHANGELOG.md`** 2026-10-04. TL;DR:
  CAPI for Business Messaging live (`capi-admin` status/discover/sweep/test-event); `recentInbound` uses `received_at`.
- [x] **Lead funnel v2 (#27) — "answer first, then offer" + VERBATIM canned answers** (2026-09-27) — **moved
  to `CHANGELOG.md`** 2026-10-01. TL;DR: Msg 1 removed; greeting→welcome+10-reason list, question→Claude answers
  then one-time invite; code sends verbatim `CANNED` (`sendCanned`). Migration `funnel_v2_schema` (`supabase/lead-funnel-05-v2.sql`).
> **Lead funnel #22/#24/#27/#30/#4+#20 full records → `CHANGELOG.md`**. Live operational record still in the "✅ Lead funnel" section near the top of this file.
- [x] **#19 saldo a favor + Payment reminders + Comprobante auto-mark + /facturar REST rewrite** (2026-09-23→27)
  — all **moved to `CHANGELOG.md`**. Env flags `PAYMENT_REMINDERS_LIVE`/`COMPROBANTES_AUTO_LIVE`/`FACTURAR_SINCE`;
  files `saldo.mjs`/`proofReconcile.mjs`/`facturar.mjs`. Backlog summaries still under "✅ DONE" below.
> **Older completed work (2026-09-22 and earlier) lives in `CHANGELOG.md`.**
> It is deliberately not loaded into session context. Read it on demand.

<!-- moved from EFIMERAMENTE_STATE.md by /cierre 2026-10-04 -->
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
- [x] ~~**Wire `/facturar` to the payer.**~~ — DONE 2026-09-23 in the API rewrite: `billingIdentity()`
      issues to the `payers` row when `payer_id` is set (its cédula/razón_social/contifico_id), else the
      patient; the descripcion always names the patient.
- [x] ~~**Flag interaction — the 4 insurance patients**~~ — RESOLVED 2026-09-23: `facturacion_manual`
      is no longer read by `/facturar` (eligibility keys off `facturacion_obligatoria` only). The API
      produces the insurance format, so Sharian Narváez / Raguel & Emilie Conforme / Laura Vásquez are
      now invoiced automatically like everyone else. The `facturacion_manual` column is left dormant.

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
  - **Known follow-ups (both since resolved 2026-10-01):** felt delay ~25s (sleep before the Claude call) and the
    `recentInbound` `created_at`→`received_at` bug — see EFIMERAMENTE_STATE Completed Features.
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
    Mariana `+593994342657` (recovered from their leads rows). Deleted the mis-created leads rows for the 4
    NULL-phone therapists + `+593999025081` (their `whatsapp_messages` kept). Cancelled the Mariana↔Sophia test
    llamada (session `cf48a941`, 28 Sep 09:00) via the calendar fn `cancel` action + `estado→cancelada`.
  - **B — answer before asking:** classifier is keyword/regex FIRST (`classifyKeywords`), LLM only as a
    fallback. An answer was ONE interactive message: canned copy body + `[Elegir terapeuta][Otra pregunta]`
    buttons. **⚠️ SUPERSEDED by #24/#27 funnel v2** — these canned answers became the fallback path.
- [x] **#4 + #20 Lead funnel WhatsApp bot — 4 phases + LIVE for real leads** (2026-09-26, Opus 4.8).
  `LEAD_BOT_LIVE=true`. Commits `2eb9c8f` (A) `9e8d60e` (B) `a74e3ae` (C) `d9d7448` (D) + fixes. New:
  `netlify/lib/{leadBot,waSend,booking,leadTemplates}.mjs`, `netlify/functions/{lead-followups,submit-lead-templates}.mjs`,
  `src/pages/MarketingFunnel.jsx`, `src/lib/funnel.js`; migrations `lead_funnel_0{1,2,3}_*`. `public-booking.mjs`
  delegates to shared `booking.mjs`. **Gotcha fixed (`25ba446`):** messages-branch patient cache select MUST
  include `es_lead`, else booked leads read undefined → runBot skipped for all post-booking msgs. Verified:
  full flow + echo pause (smb_message_echoes → bot_paused) + FAQ. (Full live record in the "✅ Lead funnel"
  section of `EFIMERAMENTE_STATE.md`.)
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
  (2026-09-15/16). Dualhook BSP (WABA `1857507018469524`, PN `915558374975708`);
  `whatsapp-cloud-webhook.mjs` (inbound → `whatsapp_messages`), `/comprobantes` owner page, `wa-proof-media.mjs`
  (Dualhook two-hop image fetch), `extract-proof.mjs` (APIMart Opus 4.8 OCR, `stream:false`). Migrations
  `whatsapp_messages_reconcile` + `whatsapp_messages_extraction`. Human-confirm mode LIVE; auto-mark+push
  was the deferred NEXT. See memory `whatsapp-coexistence-consolidation.md` for detail.

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
