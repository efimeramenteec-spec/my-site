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

### 2026-10-27 (late night) — #92c Carousel color pairs + Nicolás's corrected translation in 3 colors (executor, 59183b6)
- **Color system** `scripts/carrusel/colors.mjs`: `PAIRS` (11 ids), each a flat bg + ONE ink for all text, same on every slide.
  Light = manual pastel + black; deep = `deep(hex, L)` (same HSL hue, sat ≤ 80%, lightness L%), because mixing with black turned
  warm hues brown. `contrast()` (WCAG), `checkPairs()` throws if any < 4.5:1 (`node scripts/carrusel/colors.mjs` prints the table;
  lowest terracota-crema 5.44). `nextPair(history)` = next id after the last used (never repeats). **#93 must store the history.**
- `render.mjs`: spec `"color": "<id>"` (default `crema-tinta`), refuses < 4.5; `renderCarousel` returns `{files, fonts, color, sizes}`;
  `render.json` logs color + contrast + final font sizes per slide. The credit line is no longer faded (full ink).
- Test (Nicolás's corrected text, verbatim, checked by script; S4/S5 now body-only, no credit line) in Drive IG · Listos:
  `TEST-2026-10-27-final-colorA` terracota `#A54C12`/crema, `-colorB` deep blue `#1263A5`/crema, `-colorC` violet `#4E1F85`/yellow
  `#FFD84A` (9 PNG + caption.txt + render.json each, byte-checked) + `COLORES-2026-10-27.png` (cover + slides 04, 08 per color).
  Body sizes = #92b (56 body-only, 46 with title, 43 closing); everything fit.
- **#93 decisions** (BRAND.md "/carrusel flow"): Mon/Wed/Fri the morning brief gives Nicolás the full translated copy → he corrects
  → only then render → preview → his "sí" → post 19:00 GYE. Default = exact translation; caption drops the author's first-person
  claims; exactly 5 Spanish hashtags (2–3 broad, 1–2 medium, 1 niche) inside the copy; color via `nextPair`. Slide doesn't fit → stop, report.
- Gotcha: Drive upload = Chrome injected `<input type=file>` + synthetic drop (connector can't upload binaries); in a folder with
  subfolders, drop at ~66% width / 80% height of the viewport, not on a tile.

### 2026-10-27 (night) — #92b Carousel design fixes + exact-translation test (executor, d209039)
- **Design in force (Nicolás):** flat cream `#FEF8E9` + black, NO gradients/orbs, NO logos on any slide; ✦ + NN/NN numbers +
  "desliza →" (cover) + "pensar con luz" (closing) kept. Content titles pinned to the top (`.fit.top-align`), so the same
  height on every content slide; body right below. `contenido.title` is optional (a body-only slide starts at the same spot,
  body max 56px); `cierre.credit` = optional small line under the handle.
- **Handle = `@efimeramente.ec`** (single const `HANDLE` in `scripts/carrusel/render.mjs`), shown ONLY on the closing slide.
  The old handle is gone from the repo (grep → 0 outside CHANGELOG). The manual's p.32 mockup shows the old one; don't copy it.
- Drive `IG · Listos/`: `TEST-2026-10-27-traduccion` (9 PNG, faithful translation incl. slide 6 statistic, caption translated +
  "Traducido de @drdianahill", no CTA added) · `TEST-2026-10-27-reescritura-v2` (same 7-slide text, new design) ·
  `COMPARACION-2026-10-27.png` (A top row, B bottom). The first folder `TEST-2026-10-27-terapia-que-se-queda` was left as is.
- `assets/brand/logos/` stays in the repo as brand assets, but carousels no longer use them.

### 2026-10-27 (eve) — #92 /carrusel piece 1: Instagram brand templates + test carousel (executor, 065f59d)
- **Brand manual → code:** `assets/brand/BRAND.md` (8 HEX from manual p.13–20, fonts p.11–12, área de respeto p.29,
  usos incorrectos p.30). Cream `#FEF8E9` (sampled p.26) + black ink approved by Nicolás. Logos trimmed in `assets/brand/logos/`.
- **Renderer:** `scripts/carrusel/render.mjs` — `renderCarousel(spec, outDir)` (importable, for #93) + CLI
  `node scripts/carrusel/render.mjs <spec.json> <outDir>`. Spec `{slides:[{type:portada|contenido|cierre,title,body?,kicker?}]}`;
  `**x**` in a title = Helvetica bold (manual's headline pattern). Playwright (devDependency 1.64.1) → 1080×1350 PNG, size
  checked from the PNG header. Auto-fit shrinks all type together; still overflowing at min → THROWS (no clipped slides).
  Gotcha fixed: measure `.inner` height, not `scrollHeight` (centered blocks overflow upward invisibly).
- **Fonts NOT in git** (repo is public; Helvetica Now = Monotype "may not copy or distribute"; Chetta Vissto has no license
  info): `node scripts/carrusel/fetch-fonts.mjs` pulls them from Drive TIPOGRAFIA (link-shared) into gitignored
  `assets/brand/fonts/`. Without them → Playfair Display / Inter Tight (`CARRUSEL_FALLBACK_FONTS=1` to preview).
  Chetta lacks ¿ ¡ — “ ” … → those glyphs come from Playfair. Nicolás: fine for IG images; web use needs blnk's OK.
- **Test carousel** from @drdianahill DesKKVGErca (9 slides, ACT "therapist avoidance") → 7 slides, rewritten for patients
  ("Una buena terapia no corre a quitarte el malestar"), caption 94 words + 8 hashtags. Drive: `Efimeramente · Claude/IG ·
  Listos/TEST-2026-10-27-terapia-que-se-queda` (folder id `1wa-rnf6k5HAwcEqYwfSgViYk0ZccqUsH`; IG · Listos =
  `1cNOTjtAOx3d3c-yLiCF9-ql_yuCVqF2b`) with 01–07.png + caption.txt + source.txt. Nothing posted, no WhatsApp sent.
- **Drive PNG upload gotcha:** the Drive connector only takes base64 (too heavy for PNGs). Worked: Chrome on the folder →
  inject `<input type=file>` → `file_upload` → dispatch synthetic dragenter/dragover/drop with a DataTransfer. #93 should
  deliver previews by WhatsApp media instead and keep Drive optional.
- Approver = **Nicolás only** (not Mariana).

### 2026-10-27 (pm) — #90 Backup tables locked down (Supabase critical alert) (executor)
- Supabase flagged `patients_/sessions_/saldo_lotes_backup_20261022` as "RLS Disabled in Public". anon already had no
  grants on them but **`authenticated` had SELECT** (any therapist login could read). Also `*_backup_20261023` (4 tables) had RLS off, no grants.
- Migration `backup_tables_lockdown_90` = `supabase/backup-tables-lockdown-90.sql`: DO-loop over every `public.*_backup_*`
  (17 tables) → `enable row level security` + `revoke all … from anon, authenticated`. Idempotent; re-run after new backups.
  Nothing dropped, no non-backup table/function touched. service_role still reads them (verified via REST).
- **Gotcha:** `saldo_lotes_backup_20261019/21` + `sessions_backup_20261021` had owner RLS policies + GRANTs to authenticated;
  the REVOKE makes those policies inert — backups are now service_role/SQL-editor only, by design.
- Verified: advisor 0 `rls_disabled_in_public`; anon read of a backup → 401; live site 200; build OK.
- Standing rule added to CLAUDE.md (DDL section): every backup gets RLS + REVOKE in the same batch that creates it.
- Numbering clash: the director also used "#90" for the duplicate-patients item in the backlog — renumber in the TO-DO.

### 2026-10-27 — #89 3 held receipts applied by hand + Raguel 24 Oct invoice 331 (executor, data only)
- **Backups:** `sessions_backup_20261027`, `whatsapp_messages_backup_20261027`, `saldo_lotes_backup_20261027` (RLS on).
- **A Pamela Iturralde** receipt f12d0556 ($90, PayPal): 16 Sep aadcad0b (marked paid by mistake on 24 Sep, never paid) keeps
  pagado, paid_at → receipt time; 10 Oct d8521525 + 24 Oct 4da18d17 → pagado, metodo `paypal`, paid_at = receipt time.
  Receipt reconciled_at=now, reconciled_session_ids = those 3, auto_reconciled=false; propuesta left as-is (ignored).
- **B Cristina Fueres** split $9 (a594be1f) + $30 (c293f85d) → 21 Oct e4470822 pagado (transferencia); both receipts closed on it.
- **C Cecilia Reascos / Amelia Sofía** $38 (5425ce21, PayPhone) → 21 Oct 76c89fe4: monto 39→38, pagado, metodo `payphone`,
  notas "acepta $38, $1 condonado (dueño 27 Oct)". Tarifa stays 39. 12 Aug $0 llamada untouched.
- No saldo_lotes created (Cecilia's only lote is the 9 Oct $17 overpayment, remaining 0). metodo_pago follows the receipt's
  `extracted.destination` (same as `proofReconcile.mjs#metodoFromDestination`).
- **D Raguel 24 Oct** c7cd68b0 → `facturar?mode=emit-one` → **001-001-000000331** ($36, LAURA VÁSQUEZ 1718240995, descripcion
  `Paciente Raguel Conforme Vasquez | F88 … | Sesión 24 de Octubre`, same as #322). factura-rides-sweep sent it 14:15 UTC to …3019
  (delivered). **Gotcha:** the director's premise "facturacion_manual skips it" is wrong — no code reads `facturacion_manual`; it was
  missed because it was paid Mon 26 Oct 10:10 GYE, after that day's 09:00 auto run.
- **E** Drive TO-DO: #87/#88 were already in it (written 26 Oct 19:21 GYE by the #87/#88 /cierre — step 5 DID run; the director read
  a stale copy). Added #89 + Zara $32 held + #90 duplicates + campaign OFF; added a "take the newest modifiedTime" rule to the file.

### 2026-10-23 — #87 Mila/Sébastien invoice 329 · #88 Julián package + Laura prepay (date-limited credit) (executor, d415bb6)
- **#87:** session fe2f0b02 (Mila 20 Oct, $32) → `facturar?mode=emit-one` → **001-001-000000329**, customer SÉBASTIEN PAQUE /
  1004438295, Observaciones "Sesión Psicológica Individual | Sesión 20 de Octubre" (factura_concepto_general, same as #315).
  facturada=true at once. SRI authorization took **~3.5 h** (emitted ~19:50 UTC, sent 23:30) — the sweep (`factura-rides-sweep`)
  delivered it on its own: factura_sesion_link to +593985506258 (same as #315), delivered 00:52 UTC 24 Oct. Gotcha: SRI delays
  of 1–4 h happen (#325 = 1 h); don't re-PUT /sri/, just let the sweep send. The 22 Oct auto-run had missed it (paid 10:10,
  after the 09:00 run); next auto-run Mon 26 Oct 09:00 would have caught it.
- **#88 backups:** `patients_/sessions_/saldo_lotes_/saldo_consumos_backup_20261023` (Julián + Laura only).
- **New column `saldo_lotes.valido_desde`** (date, null = any session) — migration `saldo_valido_desde_88` =
  `supabase/saldo-valido-desde-88.sql` (also CREATE OR REPLACE `consume_saldo_on_confirm`: both the unit and the fragment
  branch skip lotes with `valido_desde > new.fecha`). JS mirror `saldo.mjs#loteValidoPara(l, fecha)`, used in
  `owedAfterCredit` (per row; leftover-fragment netting ignores date-limited lotes), `paymentReminders.mjs` (selects
  valido_desde) and `proofReconcile.mjs` (fifoConsumeLotes + proposal credit, against GYE today). Needed because ANY update
  to an old confirmada+unpaid session (e.g. a reminder stamp) fires the trigger.
- **Julián Velasco:** lote package 140/35, remaining 70, approved (owner uuid 92ebe5c0), 2 `saldo_consumos` ($35: 20 + 30 Oct),
  those sessions monto 39→35 (paid_at kept), tarifa 39→35. 13 Oct llamada untouched.
- **Laura Galindo:** lote prepay 60/30, remaining 60, approved, **valido_desde 2026-10-24**. Insert's settle touched 9 Oct →
  stayed unpaid. Rollback test: next 2 confirmed sessions draw (Julián $35 ×2, Laura $30 ×2), 3rd not, 9 Oct not.

### 2026-10-22 (late night) — #86 A Emily merge · B 4 payment reminders resent · C failed reminders ≠ sent · D Marthina package (executor, 0ab636f)
- Backups first: `patients_backup_20261022b`, `sessions_backup_20261022b`, `saldo_lotes_backup_20261022b` (Emily ×2 records, Marthina; RLS on, GRANT service_role).
- **A Emily Rivera:** kept 9a8013b6 → telefono `+61433182326` (was `+593433182326` = AU number with an EC prefix → 131026 every time), tarifa 35.
  Moved 18 Oct (confirmada, paid) + 17 Oct (cancelada) from 25fa01b0 → 9a8013b6; 25fa01b0 `inactivo` (not deleted). Its phone
  +593996404279 belongs to NO other patient/therapist — also 131026 undeliverable (16 + 20 Oct). Lote fc6ce9f9 ($140 package,
  approved) → 2 `saldo_consumos` rows (10 + 18 Oct, $35 each), remaining 140→70. Old 26 Sep lote untouched. Nothing sent.
- **D Marthina Cortes:** Nicolás marked 14 + 22 Oct paid by hand mid-session → new lote `4ddbfa84` (package, 140/35, approved
  now, aprobado_por = owner uuid 92ebe5c0 — column is uuid, "nicolas-86" in the note), 2 consumos rows, remaining **70**.
  Her next 2 confirmed sessions are drawn automatically by `consume_saldo_on_confirm`. Nothing sent.
- **B:** `payment-run?…&mode=live&only=<4 ids>&resend=1` (new params) → recordatorio_pago_v2 to Grace Atiencia ($108, 6/13/20 Oct),
  Génesis Taco ($39, 8 Oct), Pamela Iturralde ($30, 10 Oct), Gabriela Abril ($30, 18 Oct); none has a payer. 4/4 accepted;
  3 delivered, Gabriela "sent" at close. wamids in `reminder_sends`.
- **C:** new `netlify/lib/reminderSends.mjs` + table `reminder_sends` (`supabase/reminder-sends-86.sql`). Accepted pago/cita
  reminders logged by wamid (`logReminderSend` in `paymentReminders.mjs` and `whatsapp.mjs#deliverReminder`); webhook calls
  `reconcileWithSupabase({wamids})` on any `failed` status, and both reminder runs reconcile at start (status may beat the
  log insert). Failure → stamp cleared, `failed_at/error`, ONE `notifyOwner` kind `recordatorio_fallido` (atomic claim).
  `failedBefore` blocks re-sending the same session to the same dead number (fix the phone → retries). Harness
  `node scripts/harness-recordatorio-fallido-86.mjs` (9/9). Gotcha: whatsapp.mjs ↔ reminderSends.mjs ↔ ownerOutbox.mjs is an
  import cycle — fine because everything is used at call time only.
- **C2 (by design):** Grace's 13 Oct — her 6 Oct was reminded and still unpaid → "en mora" skip. Paola Ibarra's 15 Oct — her
  8 Oct was reminded and unpaid until 22 Oct (#85 follow-up) → en mora skip; the +1 number is fine (delivered 10 Oct).
- Push to main DID auto-deploy this time (0ab636f live within minutes).

## Pending / Backlog

### 🔥 Next (director picks up) — surfaced 2026-10-04
- [ ] **/carrusel #93–#95** (#92 done 27 Oct): #93 queue (Nicolás sends IG links to 9933 → queued) + `/carrusel` command
      (translation + `renderCarousel`), #94 WhatsApp preview to Nicolás → post to @efimeramente.ec ONLY after he replies "sí"
      (Instagram posting), #95 Mon/Wed/Fri 19:00 GYE schedule. **Mode decided (#92c): exact translation**, flow + hashtags + color
      rotation in `assets/brand/BRAND.md` "/carrusel flow". Waiting on Nicolás: pick a color direction (COLORES-2026-10-27.png in IG · Listos).
- [ ] Ask blnk estudio whether Helvetica Now Display + Chetta Vissto can be used on the web (needed before the website).
- [ ] **Zara Basantez 26 Oct $32 receipt** (e3d66145) held — waiting on Nicolás (what it pays). (#89)
- [ ] **#90 duplicate patients:** Kathy, Melania, Romesvary, Cecilia Reascos lead record → merge; Luna/Domenica/Nikole wait on Nicolás.
- [ ] Unreadable receipt 762ee117 (26 Oct 12:28, needs_review, no patient) still open in Comprobantes.
- [ ] **Supabase advisor WARNs left (#90 follow-up, not urgent):** 8 SECURITY DEFINER fns executable by anon via /rpc
      (trigger fns + is_owner/my_terapeuta_id — revoke EXECUTE from anon after checking callers), 6 fns with mutable
      search_path, Auth leaked-password protection off (dashboard toggle). Old backups could eventually be dropped (Nicolás's call).
- [ ] Meta campaign is OFF since 27 Oct (Nicolás) — no new ad leads expected.
- [ ] **#88 watch:** Laura Galindo's 9 Oct ($30) must stay owed and keep getting payment reminders; her first two sessions
      from 24 Oct onward should draw $30 each from lote (valido_desde 2026-10-24). Julián's next 2 confirmed → $35 each.
- [ ] **#86 follow-ups:** confirm Gabriela Abril's 22 Oct wamid reaches delivered (`reminder_sends`). First real
      `recordatorio_fallido` owner message → check it names patient/number/error and the stamp got cleared. Dead numbers
      still to fix: Fátima Tubon +59398067281 (one digit short), Wolfgang Armas +59363158790 (→ +593963158790).
- [ ] **#85 flags:** Karo still `inactivo` with a 15 Oct session · Odd-character phones (Cristina Gomez, Andres Luzuriaga, Sebastián Villegas).
      (Closed: David Betancourt tarifa + 3 Oct → $35; Daniela Santillan tarifa → $36; Martín Torres isn't facturacion_obligatoria → payer cédula irrelevant.)
- [ ] **Brief fix (director):** routine trig_014bnWaSpPv3quC8YPHZWqGS item 2 → `remaining > 0 and aprobado_at is null`
      (drop `proof_id is not null`), list every credit one per line, no ~15-line cap for that list.
- [ ] **Auto-deploy flaky?** 21 Oct pushes didn't deploy; 22 Oct (0ab636f) did. If it stalls again: Deployed via the Netlify
      connector `deploy-site` → `npx @netlify/mcp … --site-id f8418788…` (needs `npm_config_cache=<scratchpad>`: ~/.npm has
      root-owned files → EEXIST). Check the GitHub→Netlify build hook in the dashboard (Nicolás) or keep using the connector.
- [ ] **#83 notes for Nicolás (untouched, his call):** Luis Vaca record is tipo individual / tarifa $35 but his sessions are
      pareja (2 Oct pareja billed $35 too); Karina Almache's OLD record holds an unapproved $35 prepay lote from 6 Oct (ref
      2358170, proof a844a2d8); Luis has an unapproved $15 lote from 1 Oct.
- [ ] **#83 live proof:** first real repeat receipt → check it's closed `duplicado` with no owner message.
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
- [ ] **#53** — 3 patients didn't get "Mariana retoma" (Diana Romero 131049, Luna Guamán + Emily Rivera 131026 — Emily's number fixed #86) → Nicolás
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
