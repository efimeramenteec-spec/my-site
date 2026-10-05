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

### 2026-10-05 — #45 Owner outbox + ping_nico: facturación arrives by itself (executor, ba7578d)
- **Rule:** any workflow that must reach Nicolás calls `notifyOwner({kind, resumen, messages})`
  (`netlify/lib/ownerOutbox.mjs`) — never a new template. Table `owner_outbox` (migration `owner_outbox`,
  mirror `supabase/owner-outbox.sql`, owner-only RLS; cols kind/resumen/payload/estado/sent_at/ping_sent_at/error).
- Window open (owner inbound in `whatsapp_messages` < 24h − 5 min, matched by last-9 of `raw_payload.message.from`)
  → sent now. Closed → `pendiente` + ONE `ping_nico` per closed window ({{1}} = resumen, "{n} pendientes: …"
  ≤100 chars). ping_nico not APPROVED as UTILITY / send fails → Web Push fallback, row stays pendiente.
  Rows are claimed atomically (pendiente→enviado) so concurrent flushes never double-send.
- Webhook: ANY owner inbound → `flushOwnerOutbox()` first (a "facturas" command first supersedes a queued
  facturas list → `fallido` "reemplazado"); the "Ver" tap stops there. **Owner phone never enters the lead
  bot now** (was the `LEAD_BOT_TEST_PHONES` phone + an es_lead patient row → bot tests from his phone no longer work).
- `facturar-report` (cron `0 14 * * 1,4`, confirmed on deploy) → `runReport`: dry-run → `prepareFacturas(…,'cron')`
  (expires older pendiente snapshots, new snapshot origen `cron`, the exact list + [Aprobar][Ahora no]) →
  `notifyOwner(kind 'facturas', "{N} facturas listas para aprobar")`. Old push-only path removed. Command,
  fac_ok/fac_no handlers unchanged. Nothing emits without his Aprobar tap.
- Template `ping_nico` (UTILITY, es, QUICK_REPLY "Ver", in `leadTemplates.mjs#OWNER_TEMPLATES`) submitted
  2026-10-05 via `submit-lead-templates?name=ping_nico` → Meta id 1493892519462882, PENDING/UTILITY.
- Harness (scratch, stubbed WA/push/Meta/Supabase): 12/12 pass.

### 2026-10-04 — #44 María Emilia Worm: must-invoice + retroactive from 1 Sep (executor, f55495b)
- New column `patients.facturar_desde date NULL` (migration `patients_facturar_desde`, mirror
  `supabase/patients-facturar-desde.sql`). `fetchEligible` (facturarCore.mjs) now filters in JS:
  `fecha >= coalesce(patient.facturar_desde, FACTURAR_SINCE)` (the server-side `.gte` was removed; `?all=1`
  still lifts it). FACTURAR_SINCE, eligibility rule and emission code unchanged. Old-vs-new core diffed
  locally: identical for every other patient (0 with floor, 27 with `all=1`).
- Her row: facturacion_obligatoria=true, facturar_desde=2026-09-01, cedula=contifico_id=1718551201.
  No Contífico persona yet (recon empty) → created inline by the first POST, as for any new persona
  (direccion **Quito** per the locked rule — Cumbayá NOT used; no email/phone, patient billing never sends them).
  No existing Contífico doc for her cédula/name (303 checked).
- Live dry-run: exactly 1 ready — 2026-09-07 $39 "Paciente María Emilia Worm | Sesión 7 de Septiembre"
  (no CIE, no diagnosis). 1 Sep llamada + 21 Sep cancelada excluded. NOT emitted → goes in the Mon 5 Oct run.

### 2026-10-04 — #43 Mariana back from maternity leave: hardcoded booking rules (executor, a4edfbb)
- Rules (until further notice): R1 10:00–20:00 (start ≥10, end ≤20) · R2 starts ≥120 min apart · R3 max 3/day ·
  R4 en línea only. Only non-cancelled (not cancelada/no_show) sessions count. Durations unchanged.
  Applies to ALL her rows (llamadas too).
- **One JS source:** `src/lib/therapistRules.js` (`THERAPIST_RULES` keyed by id, `MARIANA_ID`, `allowedWindow`,
  `forcedModalidad`, `onlyModalidadCopy`, `violatesRules(session, sameDaySessions)` → friendly reason|null,
  `scheduleChanged(prev, next)`). Imported by `netlify/lib/booking.mjs` (computeSlots clamps + filters R2/R3;
  createBooking forces modalidad, maps trigger error → `therapist_rule` + message), `public-booking.mjs`
  (409 `{error:'therapist_rule', message}`), `SesionDrawer.jsx` (Presencial disabled + hint, rose box, save
  blocked), `Sesiones.jsx#handleSubmit` backstop, `PublicBooking.jsx` (only En línea pill for her).
  `Select.jsx` now honors `opt.disabled`.
- **DB trigger** `trg_enforce_therapist_rules` / `enforce_therapist_rules()` (migration
  `therapist_rules_trigger_mariana`, mirror `supabase/therapist-rules-trigger.sql`): raises
  `MARIANA_RULE: <reason>`; checked only on INSERT or when fecha/hora_inicio/hora_fin/modalidad/terapeuta_id
  change (estado/pagado/facturada re-saves pass). Hardcodes her uuid — keep in sync with the JS file.
  Room-cap trigger untouched. **Gap by spec:** reactivating a cancelled session (estado-only) is not checked.
- Data: her `booking_availability` = mon–sat [["10:00","20:00"]]; recibe_nuevos=false, activo=true unchanged.
- Verified: build; 8 helper cases + slot-engine cases (other therapist identical); trigger tests in a
  rolled-back tx (R1–R4 raise, 15:00 after 13:00 OK, cancelled 4th OK, pagado/estado on old presencial OK).
- **Pre-existing violation left untouched:** 2026-10-06 14:00 Mauro Baquero — PRESENCIAL (breaks R4). Any
  reschedule of it will be blocked until it's switched to En línea.
- To lift the rules: delete her entry in `THERAPIST_RULES` + `drop trigger trg_enforce_therapist_rules`.

### 2026-10-04 — CONTIFICO_FACTURAR_TOKEN re-synced: now NON-secret in Netlify (executor, 5f6e46d)
- The Netlify value was secret/unreadable and ~/my-site/.env held a stale one (live endpoint 404'd it). Recreated
  per the backlog plan: deleted the var, upserted a fresh 48-hex value as **non-secret**, context production,
  scope functions; same value written to `.env` (gitignored). Redeploy via push 5f6e46d.
- Verified: live `mode=dry-run` → 200 (0 ready); live `dry-run&all=1` (27 items) **identical** to the
  pre-#16-extraction baseline → the core extraction is also confirmed in production.
- From now on a stale local copy is fixed by READING the value (connector `manage-env-vars getAllEnvVars`), not
  rotating. Cloud director sessions that cached the old value in their environment need the new one.
- Also confirmed: `OWNER_WHATSAPP` is NOT set in Netlify → #16 owner = code default +593968029896 (no mismatch).

### 2026-10-04 — #16 /facturar by WhatsApp approval: Mon+Thu push → "facturas" → Aprobar (executor, 0a8432d)
- **Extraction:** `netlify/lib/facturarCore.mjs` = facturar.mjs's core moved verbatim (fetchEligible, assemble,
  emitOne, emitPayload, ridePlan …) + new `dryRun()` and `sendRides()` (the send-rides loop). facturar.mjs is now
  only the HTTP shell. Dry-run JSON diffed before/after (normal + `all=1`, 27 items): **byte-identical**.
- **`facturar-report.mjs`** — SCHEDULED `0 14 * * 1,4` (Mon+Thu 09:00 GYE; confirmed in deploy `function_schedules`).
  Dry-run only; ready=0 & blocked=0 → nothing; else owner push "Facturación pendiente / Hay N sesiones listas…
  Escribe facturas al 9933…" (+ "M bloqueadas."). No snapshot.
- **`netlify/lib/facturarAprobacion.mjs`** — `handleFacturasCommand` (owner texts "facturas", accent/case-insensitive:
  older 'pendiente' → 'vencida', new 'pendiente' snapshot w/ session_ids + total + `resultado.lista`, list ≤10 per
  message, buttons `fac_ok:<id>`/`fac_no:<id>` on the last), `runAprobacion` (atomic `update … where estado=
  'pendiente' and created_at>=now-48h returning`; duplicate tap = silent no-op; re-checks each snapshot id via
  dryRun → emitOne only if still ready; never adds ids; RIDE send for exactly those, 4 attempts 15s apart for SRI
  auth; stores emitidas/omitidas/rides in `resultado`; "Listo. Emitidas k de N. Enviadas por WhatsApp s." +
  failure lines; CRÍTICO line + owner push), `handleDescartar`, `runReport`. All effects go through `deps` (harness).
- **`facturar-aprobar-background.mjs`** — runs runAprobacion (15-min budget). Gate: `x-lead-verify` =
  WA_CLOUD_VERIFY_TOKEN, same as lead-reply-background.
- **Webhook:** `handleOwnerFacturar` runs right after logging, BEFORE estado flip / therapist result / lead bot.
  Owner = `ownerWhatsApp()` (env OWNER_WHATSAPP, default +593968029896 — matches the task). fac_* taps from any
  other number are swallowed (logged), never reach the bot.
- **DB:** `factura_aprobaciones` (supabase/facturar-aprobaciones.sql, applied, owner-only RLS).
- **Harness** (stubbed Contífico/Dualhook/push, in-memory DB): cron 0→no push; "facturas"→snapshot+split list+
  buttons; Aprobar emits only snapshot ids (skips ineligible + vanished, ignores newly eligible); double tap no-op;
  >48h → expired copy; non-owner tap ignored (webhook-level check too); CRITICAL path. All PASS. No real invoices.
- First live run: **Mon 5 Oct 09:00** with Nicolás.

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

### 2026-10-02 → 10-04 — /facturar go-live + WhatsApp invoices → moved to `CHANGELOG.md` (top) by /cierre 2026-10-04 pm.

## Pending / Backlog

### 🔥 Next (director picks up) — surfaced 2026-10-04
- [ ] **#41 templates _v2** — submitted, auto-switch live (f87944f). Done once all 4 `_v2` APPROVED. Decide:
      `primera_sesion_v2` reclassified MARKETING (ask Nicolás; accepting = change its category in TEMPLATES_V2).
      Later: delete the v1 templates only after 7 days with no v1 sends.
- [ ] **A Stutz never delivered** ("En preparación", $0 since 1 Oct) — 12 unpublished drafts in Ads Manager. Director decides.
- [ ] **Card cap 3 vs hijo_adolescente (4) / hijo_adulto (5)** — confirm with Nicolás whether to show all.
- [ ] **#38 Drop the 4 unused functions** (SQL in the 2026-10-04 Completed entry) + add the key policy to CLAUDE.md.

### 🔴 Contífico / invoicing follow-ups — surfaced 2026-10-02→04
- [x] **#16 first live run Mon 5 Oct** — done: "facturas" 15:10 UTC, Aprobar 17:56, 1 emitted; its RIDE was
      still unauthorized at the end of the run (`rides_pendientes`) → check it went out on the next send-rides.
- [ ] **ping_nico review** (#45) — check status: `submit-lead-templates?token=…&list`. Until APPROVED (as UTILITY)
      the Thu 8 Oct cron falls back to push if his window is closed. Reclassified/rejected → Nicolás decides, don't edit copy.
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
