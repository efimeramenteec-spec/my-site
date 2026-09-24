---
description: Emit Contífico facturas for eligible sessions via the REST API (Netlify function)
---

# /facturar — Contífico invoicing protocol (REST API)

Emit electronic facturas in Contífico for every eligible session, then mark each
`facturada` in the app. This runs entirely through the **`facturar` Netlify function**
(`netlify/functions/facturar.mjs`) — the old Chrome-automation protocol is retired.
`api.contifico.com` is only reachable from Netlify, so all Contífico traffic runs
server-side in that function. **Each emission is a real, SRI-authorized legal document
that cannot be quietly undone — work carefully.**

## 0. Setup (once per run)
- **Function URL:** `https://efimeramente-panel.netlify.app/.netlify/functions/facturar`
- **Guard token:** read `CONTIFICO_FACTURAR_TOKEN` from `~/my-site/.env` (never printed,
  never committed — it lives in the Netlify env too). Every call needs `?token=<it>`.
  Export it once: `TOKEN=$(grep '^CONTIFICO_FACTURAR_TOKEN=' ~/my-site/.env | cut -d= -f2)`
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

## 5. Verify + finish
- Re-run `mode=dry-run`; confirm `ready` is now 0.
- Optionally confirm SRI authorization of a doc:
  `curl -s "$URL?token=$TOKEN&mode=recon&resource=documento&id=<contifico_id>" | jq '.body | {documento,firmado,autorizacion,url_ride}'`
- Report: each patient, amount, Contífico `documento` number; anything skipped (blocked) and why;
  any new sessions that appeared mid-run.

## Config reference (locked)
Producto **SESION INDIVIDUAL** (`producto_id O8bYEmDllFv68b7j`) · IVA **0%** · precio = session
`monto` · establecimiento-punto **001-001** (sequential auto-computed) · estado **P** (por cobrar,
no `cobros` — matches every existing invoice) · Observaciones → **`descripcion`** (mirrored to
`referencia`) · billing party = **payer if `payer_id` set, else patient** · persona keyed by
**cédula/contifico_id** (Contífico creates it if new). Company RUC 1760388700001.

## Modes reference
`recon` (GET-only exploration), `dry-run` (default, no Contífico calls), `emit-one`
(`?session_id&confirm=EMIT-ONE`), `emit-dummy` (`?confirm=EMIT-DUMMY` — a $1 test invoice to a
fixed identity, no session touched), `batch` (`?confirm=EMIT-BATCH`).
