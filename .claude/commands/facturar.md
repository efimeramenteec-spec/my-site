---
description: Emit Contífico facturas for eligible sessions (last 7 days) via browser automation
---

# /facturar — weekly Contífico invoicing protocol

Emit electronic facturas in Contífico (Siigo) for every session eligible for automatic
invoicing, then mark each `facturada` in the app. Contífico has **no free API**, so this is
**browser automation** driven by Claude-in-Chrome. Work carefully — each emission is a real,
SRI-authorized legal document.

## 0. Setup (once per run)
- Contífico = Siigo. Empresa RUC **1760388700001**, URL **https://1760388700001.contifico.com**,
  login user `MarianaVillegasK`.
- The MCP/automation browser tab does **NOT** share Nicolas's normal Contífico login. Create a
  fresh tab in the MCP group, navigate to the URL, and **ask Nicolas to click "Iniciar sesión"
  himself** (credentials are prefilled; Claude must not submit passwords). Wait for the dashboard.
- Supabase writes/reads use the `mcp__claude_ai_Supabase__*` connector (project
  `vnityzpuhnkumsyfnskz`).

## 1. Find eligible sessions
A session is eligible when ALL are true: `estado='confirmada'` AND `pagado=true` AND
`NOT facturada` AND `tipo <> 'llamada'` AND `fecha` within the **rolling last 7 days**.

```sql
select s.id, s.fecha, s.monto, p.nombre, p.apellido, p.cedula, p.contifico_id,
       p.facturacion_manual
from sessions s join patients p on p.id = s.patient_id
where s.estado='confirmada' and s.pagado=true and coalesce(s.facturada,false)=false
  and s.tipo <> 'llamada'
  and s.fecha >= current_date - interval '7 days' and s.fecha <= current_date
  and coalesce(p.facturacion_manual,false) = false   -- HARD exemption, see §2
order by p.apellido, s.fecha;
```

Split the results:
- **Client-ready** (`contifico_id IS NOT NULL`) → invoice to the patient (real factura).
- **No cédula on file** (`cedula IS NULL`, or only a placeholder email) → **Consumidor Final**
  (legal because every session is under $50). See §4.
- **Has cédula but not yet a Contífico client** (`cedula` set, `contifico_id` null) → the patient
  must be created in Contífico first (Registrar Persona), then invoiced. Confirm with Nicolas
  whether to create-and-invoice or fall back to Consumidor Final.

## 2. ⚠️ NEVER-INVOICE exemptions (insurance-format cases)
These patients need a special insurance-format factura that **Nicolas issues by hand**. The
protocol must NEVER emit a factura for them — not as themselves, not to a relative, not as
Consumidor Final. It is enforced two ways; respect BOTH:
1. **Data flag:** `patients.facturacion_manual = true` — already excluded by the query above.
2. **Named safety net** (do not invoice even if the flag is somehow missing):
   - **Sharian Narvaez**
   - **Raguel Conforme (Vasquez)**
   - **Emilie Conforme**
   - **Laura Vasquez**

To exempt a new patient later: `update patients set facturacion_manual=true where id='…';`

## 3. Emit one factura per session (real factura)
From the dashboard, open **"Crear una factura electrónica"**
(`/sistema/registro/documento/registrar/?de=1`). For each session:
1. **Persona:** click the Persona field and type the patient's `contifico_id` (their cédula).
   **Gotcha:** right after navigating, the first click+type often does NOT register — click the
   field again and re-type, then screenshot and **verify the Persona name is populated** before
   continuing (an empty Persona makes the emit fail with "La persona es obligatoria").
   Select the matching autocomplete row.
2. **Servicios ▸ Agregar detalle** → click the Producto field, type `SESION INDIVIDUAL`, pick the
   **"(SESION INDIVIDUAL) SESION INDIVIDUAL"** option. This product auto-sets **IVA 0%** (correct —
   psychology is exempt).
3. Set **Precio U.** = the session's `monto` (triple-click the field, type the amount).
4. Selecting a product auto-adds a blank second row — **delete it** (row trash icon → "Aceptar").
5. **Descripción** (required): `Sesión del DD/MM/YYYY` using the session's `fecha`.
6. **Formas de Pago:** the default **"Otros con Utilización del Sistema Financiero"** IS the SRI
   code for a bank transfer — leave it (there is no literal "Transferencia" option). Valor
   auto-fills to the total.
7. Click **"Guardar y enviar al SRI"** (the irreversible emission), wait ~3s. Success = the URL
   changes to `/documento/<id>/` and shows "Documento registrado y enviado con éxito."
8. Immediately mark the session invoiced:
   `update sessions set facturada=true where id='<session_id>';`

## 4. Consumidor Final (patients without a cédula)
Same flow as §3, except in the **Persona** field type `9999999999999` and select the built-in
**"9999999999 - Consumidor Final"**. Everything else (product, price, IVA 0%, descripción, forma
de pago, emit, mark facturada) is identical. Anonymous buyer — the patient can't deduct it, but
it's legal under $50.

## 5. Creating a Contífico client (Registrar Persona) — when needed
For a cédula-holder not yet in Contífico: `/sistema/persona/registrar/`, Tipo **Natural**, fill
Cédula (typing it triggers an SRI name lookup + green check), Nombre, Teléfonos,
Dirección **QUITO**, Email (+Enter to add as a tag), check the **Cliente** role (Cuenta Por Cobrar
auto-fills **"Clientes Comerciales"**), **Guardar**. For a 13-digit RUC: put the RUC in the Ruc
field and the 10-digit core in Cédula. Then stamp `patients.contifico_id = <10-digit cédula>`.
(For onboarding many patients at once, the bulk XLS import at
`/sistema/persona/importacion_masiva_personas/` is faster — Cuenta Contable Cliente must be
exactly `Clientes Comerciales`, names as `APELLIDOS NOMBRES`.)

## 6. Finish
- After the batch, re-run the §1 query and confirm the client-ready count is 0.
- Report: each patient, amount, and Contífico document number; list any skipped (no cédula, or
  exempt), and any new sessions that appeared mid-run.
- Keep the DB consistent: every emitted factura MUST have `facturada=true`. If a Supabase write
  fails (transient 5xx), retry it before finishing so nothing is emitted-but-unmarked (which would
  risk a duplicate next run).

## Config reference (confirmed with Nicolas)
Producto **SESION INDIVIDUAL** · IVA **0%** · Descripción **"Sesión del <fecha>"** · Forma de pago
**Otros con Utilización del Sistema Financiero** (= transferencia) · **Emit directly** to the SRI
(no draft/approval step). Address constant **QUITO**.
