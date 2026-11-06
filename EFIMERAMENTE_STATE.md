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

## ⏸️ Lead bot REPLIES paused (#100, Nicolás 6 Nov 2026) — `LEAD_BOT_REPLIES_OFF=true`
Nicolás: "it has flaws and I will lose customers. Only temporary" → "Only stop the auto-answering from ads."
`LEAD_BOT_LIVE` stays `true`; the new `LEAD_BOT_REPLIES_OFF=true` makes `runBot` (every answer to an inbound lead
message, taps and free text) a no-op via `leadBot.mjs#botRepliesAllowed`; the webhook doesn't queue/type either.
STILL ON: +2h/+22h nudges, 1h call reminder, therapist "Se hizo/No contestó" + rebook, 48h first-session nudge,
lead recording, funnel, CAPI. Nicolás answers leads by hand. His phone (LEAD_BOT_TEST_PHONES) / modo prueba still
get replies, for testing fixes. **To turn replies back on:** delete `LEAD_BOT_REPLIES_OFF` (or set `false`) + redeploy.

## ✅ Lead funnel (#4 + #20) — LIVE for real leads since 2026-09-26 (`LEAD_BOT_LIVE=true`; replies paused 6 Nov, see above)

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

### 2026-11-05 (later) — Ad #8 FINAL + Tim's playbook rewritten (Tim)
- **Final cut by Nicolás:** `~/Downloads/VectorEditorial-Efimeramente-PrimeraSenalDeCordura/FINAL-EDITORIAL-VECTOR.mov` (1080×1920,
  59.8 s, his voice converted on makeityours.app, voice "Nil Gallego", + subtitles). Project folder renamed from `TEST-…`. Script
  marked FINAL (`~/.claude/ad-guiones/efimeramente-08-primera-senal-de-cordura.md`). Nicolás is building a Meta campaign with it.
- **Redone after his review:** panels 20–21 (two near-identical bike clips with a "crazy" laughing rider → potter's wheel +
  the opening door now open with a sun) and 14 (Mariana laughing with a magnifying glass read as laughing at the patient →
  close-up, creatures reflected in her glasses, mouth closed). A first fix of 20 that went back to a therapy-room scene was rejected.
- **`.claude/agents/tim.md` rewritten:** zigzag comic = default format; 1 test frame per style; Nicolás's scripts as written; new CTA;
  lessons (scene variety, nobody laughs, references drag their setting, Kling slides people into glass). Reusable tools in
  `~/.claude/adgenerator-comic/` (`comic_pan.py`, `gen.py`, `vgen.py`); comic block added to `~/.claude/workflow-anuncio.md`.
- Bauhaus version of the same script postponed (APIMart ~$5.3 left, a full ad ≈ $6).

### 2026-11-05 — Ad #8 "La primera señal de cordura" produced as a zigzag comic + CTA fixed (Tim; ad work, no app code)
- **Script = Nicolás's own, used as written (~70 s, no cuts)** → `~/.claude/ad-guiones/efimeramente-08-primera-senal-de-cordura-BORRADOR.md`.
- **CTA corrected (Nicolás, 5 Nov): "Agenda hoy tu llamada gratuita y encuentra a tu terapeuta ideal."** The first APPOINTMENT is
  NOT free (only the call). `.claude/agents/vince.md` updated (→ `netlify/lib/hqAgents.json` on next build). Drafts #3–#7 still end
  with the old "La primera cita es gratis" — swap the CTA before producing any of them.
- **Style test:** 1 frame each in enamel pin / Bauhaus / editorial vector → Nicolás chose **editorial vector**.
- **New format: zigzag comic.** 23 Seedream 1K panels on one comic page (gutters, 2 columns, snake order right→down→left…); each panel
  gets a Kling v3-omni std 3 s clip (first_frame only); the camera swipe between panels is CODE (PIL+ffmpeg), not AI → zero melting.
  Builder `~/Downloads/TEST-Efimeramente-PrimeraSenalDeCordura/comic_pan.py` (`CLIPMAX=2.6 SWIPE=0.45`, args `panel.png:clip.mp4`).
  Output `VectorEditorial-Efimeramente-PrimeraSenalDeCordura-COMPLETO.mp4` (68.6 s, mute) + README with the panel/locución table.
- **Gotchas:** a reference image drags its whole setting (patterns frame copied the hallway; #6 copied #4) → say "NEW SETTING" and
  describe the new composition; Kling made Mariana slide into the shop window (clip 22) → "stays in the doorway, never behind the glass".
  Cost ≈ $8.6 APIMart (Nicolás topped up $10; ~$6.2 left).

### 2026-11-03 — Payroll unstuck + owner alerts re-ping + Comprobantes: PDFs, COP, therapist skip (Michael, add974b + bd603a0)
- **Payroll accept path (#48, `netlify/lib/payrollFlow.mjs` `acceptPayroll`, `payroll-run?action=accept&periodo=&nombre=`):**
  a `mismatch` could only resolve when the SYSTEM changed to the therapist's count; when the therapist's list misses
  confirmed sessions there was no exit. Now Nicolás's "sí" stores `detalle.aceptado_sistema {a, at}`; `checkOne` treats it as
  a match while the system count still equals `a` and sends `aceptadoMessage` (`payrollCopy.mjs`, "En tu lista faltaba…").
  The hand-written `detalle.override_owner` on María Gracia's row was never read by code (ignore that key).
- **October payroll DONE:** all 6 sent (Francisco 8/$200, Camila 24/$576, Carolina 26/$642, Daniela 40/$960, María Gracia
  16/$384 via accept, Sophia 6/$120). Sophia was asked by hand (payroll-send) about 2 Oct + 29 Oct; she confirmed 2 Oct,
  Andrea Torres 29 Oct was cancelled → session 9e10e2d3 → cancelada (trigger reverted the $35 to her package: $70 left).
- **Protocol ends at the report (Nicolás 3 Nov):** no invoice tracking, no "closing the month" — no invoice, no payment.
- **Owner outbox (`netlify/lib/ownerOutbox.mjs` notifyOwner):** was ONE ping per closed window → an unanswered 2 Nov ping
  left 15 alerts silent. Now at most one ping per 24 h while his window is closed.
- **Comprobantes (`netlify/lib/proofOcr.mjs`, `netlify/lib/proofReconcile.mjs`):** PDFs read via Anthropic Messages API
  (`ocrPdfRow`, document block, `claude-opus-5-5`, ANTHROPIC_API_KEY) — tested on Nikole's PayPhone PDF ($50, ref 93027592);
  new `currency` field, non-USD → confidence low → held (Mayra's "101799" was COP from a Colombian bank); `closeTherapistProofs`
  closes image/doc proofs from therapist phones (except Mariana, #81 A) as `ignorado` "mensaje de terapeuta"; recipient check
  accepts "mariana|villegas|kraemer" (banks truncate). Gabriela Acosta (payer of Martín Torres) $35 then auto-matched Martín 30 Oct.
- **Data (Nicolás's orders):** Zara 22 Oct paid by her 26 Oct receipt e3d66145; Nikole 29 Oct pareja 39→$50 paid (PayPhone);
  Fátima Tubon $240 = two package lotes 4×$30 (Fátima bf3a1f24 + Valentina Yanchaluiza a2ad3f7c, proof c085c8e5 on Fátima's lote
  only — `saldo_lotes_proof_id_unique`), 29 Oct consumed from each → $90 left each; Shyam 2 Nov paid from his package ($70 left);
  Mayra + therapist lists + Zara 30 Sep/Raguel 16 Oct receipts closed; Fabian Banderas phone (was Camila's) → '' (telefono NOT NULL).
- **Ad #3 draft** (La Odisea / Gollwitzer, ~55 s) at `~/.claude/ad-guiones/efimeramente-03-odisea-gollwitzer-BORRADOR.md`, awaiting
  Nicolás's approval (Compuerta 2). Toy Story 5 angle pinned for a later ad.

### 2026-11-02 — #48 Payroll workflow: automatic every 2nd (Michael, 8ade73d → 450fc9a)
- **Flow (Nicolás's design):** template `conteo_sesiones` (UTILITY, Meta id 1500377868577111, PENDING on 2 Nov) to each
  therapist on payroll (provision_rate > 0 → never Mariana) → hourly read of their replies (text, screenshots, PDFs; Claude
  Opus 5.5 via ANTHROPIC_API_KEY) → **match = session COUNT only** vs confirmed non-llamada sessions → match: `matchMessage`
  + system PDF from the 9933 (needs their 24 h window open; closed → Nicolás told, sent as soon as they write again) →
  mismatch / ambiguous / audio: ONE WhatsApp to Nicolás → 24 h after the template with nothing: one WhatsApp listing who.
- **Auto-start:** from the 2nd to the 10th of each month, the hourly pass sends the template to every therapist on payroll
  with no `payroll_runs` row for last month, once the template is APPROVED. Nobody triggers it.
- **Code:** `netlify/lib/payrollFlow.mjs` (startPayroll / runPayrollCheck / autoStart / recheckPayroll);
  `payroll-check` (scheduled :05) → `payroll-check-background` (withCronLock 'payroll-check', 15 min);
  `payroll-run?token=PAYROLL_TOKEN&action=start|check|recheck|status`; migration `supabase/payroll-flow-48.sql`.
  Errors land in `payroll_runs.detalle.ultimo_error` (status shows them). `scripts/payroll-report.mjs` = one PDF by hand.
- **Gotchas:** APIMart returned EMPTY content for multi-part text+image → reading uses the Anthropic API directly.
  A prompt with inline `//` comments made the model echo them (unparseable). Image download failure = retry, never judge
  from the text alone.
- **October (2 Nov):** Francisco 8 = 8 → report sent, then RE-SENT corrected at **$25/session → $200** (Nicolás: Francisco
  is the only one at $25; `therapists.provision_rate` 24→25, Finanzas + reports use it). Daniela: screenshot read = 40 =
  system 40 → match, but her window was closed → Nicolás told; PDF goes out when she next writes. Camila, Carolina,
  María Gracia, Sophia: asked 2 Nov 14:37 (auto-start), all delivered. Sophia's 31 Oct 10:00 session (Elena Valentina)
  set **confirmada** by hand 2 Nov (Nicolás: she told him it happened) → her October = 7.
- **`info_consultorio` template (Nicolás, 2 Nov; APPROVED as MARKETING, id 2664067827398492):** "Hola {{1}}. Quiero
  enviarte información relevante del consultorio. Responde cualquier mensaje para poder enviártela. Att: La Caracola
  Mágica🐚✨" — reopens a therapist's 24 h window. `sendInfoConsultorio` in leadTemplates.mjs. Payroll uses it by itself:
  report ready + window closed → sends it once (`detalle.reabrir_at`), their reply → PDF goes out. Daniela got it 2 Nov
  15:19 (delivered). `conteo_sesiones` body edited to end with 🐚✨ (re-review; `submit-lead-templates?edit=<name>`).
  Reading step max_tokens 600 → 4096 (answer was cut mid-JSON once).
- **Hardening + end-to-end check (2 Nov, 450fc9a):** auto-start only 09:00–20:00 Quito (first pass on the 2nd = 09:05);
  template not APPROVED on the 2nd → Nicolás told ONCE (owner_outbox kind `nomina_plantilla`), retries hourly to the 10th;
  `mismatch` rows re-compare every pass (stored count vs system) → fixed in the panel = report goes out by itself; one
  owner alert per distinct count. Verified: `payroll-check 5 * * * *` in the live deploy's function_schedules, scheduler
  fired 20:05 UTC on its own; conteo_sesiones re-APPROVED with 🐚✨; rehearsal of 2 Dec (night = nothing, 09:05 = 6
  therapists asked, Mariana never).
- **Mismatch alerts name the difference (2 Nov, 1fd1bfe):** the reading also returns their list per patient (`detalle`:
  paciente, cantidad, días) → `diffDetail()` matches it to the system's sessions (name prefix/nickname + shared days) and
  the owner alert lists only the patients whose counts differ, with the missing day. Information only — COUNT decides.
- **Template category bug (fixed 2 Nov, e438461):** `sesion_pendiente` and `ping_nico` are APPROVED as **MARKETING**, but
  `sesionesPendientes.mjs#templateApproved` and `ownerOutbox.mjs#pingTemplateApproved` required UTILITY → closed-window
  "¿se dio la sesión?" reminders and owner alerts went ONLY as phone pushes (why Sophia's 31 Oct never got a WhatsApp).
  Now: approved = usable, any category (standing rule). `resolveName` v2 check left as is (#41, deliberate).
- **Francisco $25 = October onward only** (Nicolás 2 Nov: nothing retroactive, September stays $456). Known quirk:
  `provision_rate` has no start date, so Finanzas shows his PAST months at $25 too — display only, accepted.

### 2026-11-02 — #99 Duplicate sends: one run at a time for every scheduled function (Michael, 6efff0e)
- **Symptom (Nicolás):** payment reminder WhatsApp'd twice in a row. `reminder_sends` showed it on 2 Nov (4 patients,
  same session_ids, 1–4 s apart) and 23 Oct (5 patients). Scouting also found: "Comprobante en espera" owner alerts
  sent 2–4× (21, 22, 26, 30 Oct, 2 Nov), one sesión-pendiente reminder doubled (21 Oct).
- **Root cause:** Netlify's scheduler drops a scheduled invocation after ~15 s (request log status **499**,
  duration ≈14.97 s) and invokes the function AGAIN ~15 s later; the first execution keeps running to the end.
  Jobs that send first and stamp after then send twice. On 2 Nov the 10:00 run had 9 patients (~27 s): run 1 sent
  all 9, the retry re-read the list after 5 were stamped and resent the other 4. lead-followups and process-proofs
  were being double-run on EVERY tick (both executions completed).
- **Not affected (verified):** invoicing (overlap guard `en_curso` + per-session re-check; one `factura_aprobaciones`
  row per run day, no session invoiced twice), RIDE sweep + broadcasts (atomic `claimed_at`), money (no duplicate
  `saldo_lotes` per proof, no duplicate `saldo_consumos`), appointment reminders (no dupes in `reminder_sends` cita).
- **Fix:** `cron_locks` table + `try_cron_lock(name, holder, ttl)` / `release_cron_lock` (service_role only,
  `supabase/cron-locks-99.sql`); `netlify/lib/cronLock.mjs#withCronLock` (fails CLOSED: lock error → run skipped).
  All 8 scheduled fns now `run()` inside the lock; a retry logs `[cron-lock] <name>: another run in progress`.
  `payment-run` / `proofs-run` live share their twin's lock name (409 when busy). Belt and braces:
  `paymentReminders.mjs` CLAIMS `recordatorio_pago_at` (NULL→now) BEFORE sending, unclaims on a failed send (resend
  path unchanged); `proofReconcile.mjs` claims `alerted_at` before `notifyOwner`, unclaims on failure.
- **Gotcha:** don't re-add "send, then stamp" in any scheduled job; claim first or rely on the lock.


### 2026-10-31 (evening) — #48 payroll on the 2nd + "cred" undo + no-new-sessions rule (Michael, 4cf6c23)
- **#48 Payroll moves to the 2nd of each month** (Nicolás, 31 Oct), for the month just closed. October runs **Mon 2 Nov**.
  The morning brief routine flags it. `netlify/lib/payrollCopy.mjs` now takes a `mes` parameter.
  Still pending: close September (no `factura_recibida` yet; check María Gracia's delivery; Carolina's $828 v2 PDF),
  then automate calculate → send → collect invoices.
- **"cred" DONE:** the 5 payments made from unapproved credit were undone (Paola Ibarra, Daniela Santillan, Karo
  Merizalde, Emilie Conforme [already invoiced], Zara Basantez). Lotes zeroed, sessions back to unpaid with
  `pago_excluido=true`, receipts back in Comprobantes for review by hand — the tab now keeps pending receipts 90 days
  (`src/lib/queries.js`, `Comprobantes.jsx` "hasta 90 días"). Backups `undo_credito_backup_20261031_*`. SQL:
  `supabase/undo-credito-no-aprobado-31oct.sql`.
- **New rule:** never tell Nicolás to open a new session (CLAUDE.md + `.claude/agents/michael.md`).
- Shipped from the Mac: branch `claude/compassionate-moore-45c7b8` fast-forwarded into main, then deleted.


## Pending / Backlog

### 🔥 Next (Michael picks up) — priorities live in the Drive TO-DO
- [ ] **Ad #8 La primera señal de cordura** — FINAL (`FINAL-EDITORIAL-VECTOR.mov`), Nicolás launching a Meta campaign with it
      (5 Nov) → Alex: first read of results at the next /marketize. Comic format = default for the next ads (Tim).
- [ ] **Ad #3 La Odisea** — draft in `~/.claude/ad-guiones/efimeramente-03-odisea-gollwitzer-BORRADOR.md`; Nicolás approves
      (as is / 48 s cut) → rename without BORRADOR → Tim (/adgenerator). Toy Story 5 angle (Lilypad, Wilson 2014, Lieberman) pinned next.
- [ ] **Carousel (#93–#95) ON HOLD** (Nicolás 3 Nov).
- [ ] **Juan José Flores $35 receipt** (4f5b3348, 3 Nov) held: tarifa $39. Nicolás is handling unpaid sessions himself.
- [ ] **Watch:** next PDF receipt reads by itself (extraction.source='pdf'); owner re-ping once/24 h works; therapist images auto-close.
- [ ] **/carrusel #93–#95** (#92 done 27 Oct): #93 queue (Nicolás sends IG links to 9933 → queued) + `/carrusel` command
      (translation + `renderCarousel`), #94 WhatsApp preview to Nicolás → post to @efimeramente.ec ONLY after he replies "sí"
      (Instagram posting), #95 Mon/Wed/Fri 19:00 GYE schedule. **Mode decided (#92c): exact translation**, flow + hashtags + color
      rotation in `assets/brand/BRAND.md` "/carrusel flow". Colors: FINAL rule #92f = 8 violet combos rotating via `nextPair` (POST-01 used combo 1, so #93's history starts with `violeta-sobre-crema`). POST-01 (#92g: Chetta titles) is in Drive IG · Listos and was WhatsApp'd to Nicolás 28 Oct to post by hand. #94 preview = `owner-outbox-send` (image messages + texto_exacto); images need public HTTPS links (a hosting path for #94 is still to decide: Supabase storage signed URLs from a function).
- [ ] Ask blnk estudio whether Helvetica Now Display + Chetta Vissto can be used on the web (needed before the website).
- [ ] **#90 duplicate patients:** Kathy, Melania, Romesvary, Cecilia Reascos lead record → merge; Luna/Domenica/Nikole wait on Nicolás.
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
- **One desk since 2026-10-31 (#98):** a `/michael` session plans AND executes; no separate
  director chat. See `CLAUDE.md` "How we work — one desk".

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
