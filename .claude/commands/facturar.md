---
description: Emit Contífico facturas for eligible sessions via the REST API (Netlify function), then WhatsApp each PDF to its payer
---

# /facturar — Contífico invoicing protocol (REST API)

> **Normal path since 2026-10-04 (#16): no Claude session needed.** Every **Monday and Thursday
> 09:00 GYE** `facturar-report` (cron `0 14 * * 1,4`) pushes Nicolás "Facturación pendiente" when
> anything is ready or blocked. He writes **`facturas`** to the 9933 from his phone (owner number =
> `ownerWhatsApp()`: env `OWNER_WHATSAPP`, default `+593968029896`) → the webhook runs this same
> dry-run, freezes a `pendiente` snapshot in **`factura_aprobaciones`** (session_ids + total + the list
> he saw) and replies with the list + **[Aprobar] [Ahora no]**. Aprobar → `facturar-aprobar-background`
> claims the snapshot atomically (pendiente→aprobada, <48h — double taps are no-ops), re-checks each
> snapshot session with the same eligibility rule, emits ONLY those still eligible (never one outside
> the snapshot), WhatsApps their RIDEs, stores everything in `resultado` and replies
> "Listo. Emitidas k de N…". A CRITICAL (emitted, not marked) replies `CRÍTICO: …` + push — fix it by
> hand (step 4) before anything else. Code: `netlify/lib/facturarAprobacion.mjs` on top of
> `netlify/lib/facturarCore.mjs` (the core this HTTP function also uses). Audit:
> `select created_at, estado, total, resultado from factura_aprobaciones order by created_at desc;`
> The manual HTTP protocol below stays for backfills, one-offs and debugging.

Emit electronic facturas in Contífico for every eligible session, then mark each
`facturada` in the app. This runs entirely through the **`facturar` Netlify function**
(`netlify/functions/facturar.mjs`) — the old Chrome-automation protocol is retired.
`api.contifico.com` is only reachable from Netlify, so all Contífico traffic runs
server-side in that function. **Each emission is a real, SRI-authorized legal document
that cannot be quietly undone — work carefully.**

## 0. Setup (once per run)
- **Function URL:** `https://efimeramente-panel.netlify.app/.netlify/functions/facturar`
- **Guard token:** `CONTIFICO_FACTURAR_TOKEN` (never printed, never committed). Every call needs
  `?token=<it>`. Cloud sessions get it from the environment's variables; on the Mac it's in
  `~/my-site/.env`. Export it once:
  `TOKEN=${CONTIFICO_FACTURAR_TOKEN:-$(grep '^CONTIFICO_FACTURAR_TOKEN=' ~/my-site/.env | cut -d= -f2)}`
  The authoritative copy is the Netlify env (production, secret, unreadable). Rotated 2026-10-02 — if the
  local copy is stale every call 404s; replacing it means a new Netlify value + redeploy. This token is OURS,
  not a Contífico credential — **never rotate the Contífico keys** (Nicolás's rule).
- The function already holds the Contífico creds (`CONTIFICO_API_KEY`, `CONTIFICO_POS_TOKEN`)
  and `SUPABASE_SERVICE_KEY` in the Netlify env. Nothing else to configure.
- Supabase reads/writes for backfill use the `mcp__claude_ai_Supabase__*` connector
  (project `vnityzpuhnkumsyfnskz`).

## 1. Eligibility (encoded in the function — do not re-derive)
A session is eligible when ALL are true:
`estado='confirmada'` AND `pagado=true` AND `NOT facturada` AND `tipo <> 'llamada'`
AND `patient.facturacion_obligatoria = true` AND `fecha >= FACTURAR_SINCE` (**2026-09-24**).

- **Non-retroactive:** `FACTURAR_SINCE` is a hard floor. Every session before it was
  already invoiced manually; the protocol must never touch the historical backlog.
- **No `facturacion_manual` exemption and no named NEVER-INVOICE list** — both were
  deleted 2026-09-24. The 4 old insurance patients (Laura Vásquez, Raguel/Emilie Conforme,
  Sharian Narváez) ARE now invoiced by this protocol; the API produces the insurance format.

## 2. Dry-run FIRST — always
```bash
curl -s "$URL?token=$TOKEN&mode=dry-run" | jq
```
Returns `{ totals:{eligible,ready,blocked}, ready:[…], blocked:[…], full:[…] }` and makes
**zero Contífico calls**. Review it:
- **`ready`** — data-complete, will be emitted. Check each `descripcion` string, which is
  what the insurance depends on. Format (built by the function):
  `Paciente {NOMBRE PACIENTE} | {CIE} {diagnóstico} | Sesión {fecha en texto}`
  e.g. `Paciente Laura Vásquez | F41 otros trastornos de ansiedad | Sesión 4 de Septiembre`.
  Billing goes to the **payer** when `patient.payer_id` is set, otherwise the patient —
  but the descripcion **always names the patient** (for a `menor`, the child).
- **`blocked`** — each lists why. **STOP and report these; never improvise a fallback.**
  The only hard block is a missing **cédula/contifico_id** (patient's own, or the linked
  payer's). **Diagnosis is optional** — a patient without one is invoiced with a no-CIE
  descripcion (`Paciente {nombre} | Sesión {fecha}`); when present, the CIE is included.

### Fixing a block (only with real data — ask Nicolás, never invent)
- Patient cédula → `update patients set cedula=…, contifico_id=… where id=…;`
- Payer cédula → `update payers set cedula=…, contifico_id=… where id=…;`
  (If a cédula isn't in the app, it may be recoverable from the patient's past invoices
  in Contífico — `mode=recon&resource=persona&cedula=…`.)
- Diagnosis (optional, improves the descripcion) →
  `update patients set diagnostico_codigo=…, diagnostico_texto=… where id=…;`
Then re-run the dry-run and confirm the session moved to `ready`.

## 3. Show Nicolás the plan, get his OK
Report the `ready` list (patient, billing party, amount, descripcion) + the total, and the
`blocked` list. **Wait for his go-ahead before emitting** — these are legal documents.

## 4. Emit
Two paths. Both do `POST /documento/` (create, `electronico:true`, next sequential computed
live from Contífico) → `PUT /documento/<id>/sri/` (SRI emission) → **mark `facturada=true`
immediately**. SRI authorization is async but usually completes in seconds.

- **One session (recommended for the first of a batch, as a live check):**
  ```bash
  curl -s "$URL?token=$TOKEN&mode=emit-one&session_id=<uuid>&confirm=EMIT-ONE" | jq
  ```
- **Whole batch (every `ready` session):**
  ```bash
  curl -s "$URL?token=$TOKEN&mode=batch&confirm=EMIT-BATCH" | jq
  ```
Each result carries `contifico_id`, `marked_facturada`, and `urls` (RIDE/XML).

### ⚠️ The one failure mode to guard
An emitted-but-unmarked invoice risks a **duplicate next run**. If any result shows
`emitted:true` with `marked_facturada:false` it is flagged **CRITICAL** — set
`facturada=true` on that `session_id` by hand before re-running anything.

## 5. Verify
- Re-run `mode=dry-run`; confirm `ready` is now 0.
- Confirm SRI authorization of each doc (usually seconds, sometimes a minute or two):
  `curl -s "$URL?token=$TOKEN&mode=recon&resource=documento&id=<contifico_id>" | jq '.body | {documento,firmado,autorizacion,url_ride}'`

## 6. WhatsApp each invoice to its payer
Every emitted factura's PDF (the RIDE) goes to the billing party on WhatsApp — part of every run.
1. **Plan (sends nothing):**
   ```bash
   curl -s "$URL?token=$TOKEN&mode=send-rides" | jq '{totals, plan: [.plan[] | {documento, recipient, detalle, ready, blocking}]}'
   ```
   Lists every invoiced session (since `FACTURAR_SINCE`) not yet sent. Check each recipient + `detalle`.
2. **Show Nicolás the plan and wait for his OK** (same as step 3 — it messages real people).
3. **Send:** `curl -s "$URL?token=$TOKEN&mode=send-rides&confirm=SEND-RIDES"`
   (one only: add `&session_id=<uuid>`). Each result shows `sent`, `wamid`, `stamped`.
4. **Confirm delivery** (status webhooks land in Supabase):
   `select right(recipient,4), status, error_title from whatsapp_delivery_status where wamid in (…);`

Rules (encoded in the function — don't re-derive):
- **Recipient = the payer's phone; if the payer has none, the patient's phone.** (Dorian Solis has no
  phone on purpose → his invoices go to Cecilia Saltos.)
- **Only SRI-authorized invoices are sent.** An unauthorized one shows `blocking: not yet SRI-authorized`
  and is simply picked up by the next run once authorized.
- **Never twice:** a send stamps `sessions.factura_enviada_at`; stamped sessions are excluded. If a result
  says `SENT but … stamp FAILED`, set `factura_enviada_at = now()` on that session by hand before re-running.
- Template **`factura_sesion_link`** (Meta-approved, UTILITY): *"Hola {nombre} 🌿 Te enviamos la factura de
  {tu sesión / la sesión de X} del {fecha}. Gracias por confiar en Efimeramente."* + a **"Descargar
  factura"** button that opens the RIDE. A real PDF attachment isn't possible: Dualhook can't upload the
  sample file Meta requires. Each send is a billable Meta utility message (~1¢).
- **Any change to patient-facing copy is shown to Nicolás BEFORE a template is submitted** (needs re-approval).

## 7. Report
Each patient, amount, Contífico `documento` number, WhatsApp delivery status; anything skipped
(blocked / not authorized / no phone) and why; any new sessions that appeared mid-run.

## Config reference (locked)
Producto **SESION INDIVIDUAL** (`producto_id O8bYEmDllFv68b7j`) · IVA **0%** · precio = session
`monto` · **fecha_emision = TODAY** (Ecuador; the SRI rejects any other date — cod_error 1017 —
so late invoices carry the session date only in Observaciones) · dirección **Quito** always (rule) ·
Observaciones name = `patients.nombre_factura` when set (e.g. Cecilia Saltos vs Valentina Loor, both
billed to Dorian Solis) · establecimiento-punto **001-001** (sequential auto-computed) · estado **P** (por cobrar,
no `cobros` — matches every existing invoice) · Observaciones → **`descripcion`** (mirrored to
`referencia`) · billing party = **payer if `payer_id` set, else patient** · persona keyed by
**cédula/contifico_id** (Contífico creates it if new). Company RUC 1760388700001.

## Modes reference
`recon` (GET-only exploration), `dry-run` (default, no Contífico calls), `emit-one`
(`?session_id&confirm=EMIT-ONE`), `emit-dummy` (`?confirm=EMIT-DUMMY` — a $1 test invoice to a
fixed identity, no session touched), `batch` (`?confirm=EMIT-BATCH`), `send-rides` (plan; `&confirm=SEND-RIDES`
sends, `&session_id=` for one), `ride-template-status` (Meta review state), `ride-template`
(`&variant=link|document&confirm=SUBMIT-TEMPLATE` — only for a new template, copy approved by Nicolás first).
