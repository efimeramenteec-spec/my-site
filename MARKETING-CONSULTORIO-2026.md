# MARKETING-CONSULTORIO-2026

Protocolo y arquitectura del módulo Marketing v2 (2026-07-13). **Este documento es
autosuficiente** — el contexto general del proyecto vive en `CLAUDE.md` /
`EFIMERAMENTE_STATE.md`, pero para operar o modificar el módulo Marketing basta este archivo.

---

## 1. El embudo y la regla de atribución

```
Meta Ads → conversación de WhatsApp → llamada gratuita (10 min) → paciente
           (métrica de Meta)          (sessions.tipo='llamada')    (1ª sesión real)
```

**Regla de atribución (la clave del rediseño):** corre UNA sola campaña de Meta a la vez.
Por lo tanto, todo paciente nuevo — definido como paciente con su **primera sesión real**
(no llamada, no cancelada) — se atribuye a la campaña **activa el día en que esa primera
sesión fue agendada** (`sessions.created_at`). No hay links con parámetros, no hay marcado
manual: la atribución se calcula por fechas.

- **Válvula de escape para referidos:** un paciente con `fuente = 'referido'` (se marca en
  Pacientes → Configuración → Fuente) queda **excluido** de la atribución de campañas. Es el
  único caso donde hay que tocar algo a mano; el resto es automático.
- Las ventanas (`campaigns.fecha_inicio` / `fecha_fin`) las mantiene `/marketize`
  automáticamente y son **editables en /marketing → Campañas → "Editar fechas"** (necesario
  para resolver mayo 2026, cuando corrieron varias campañas a la vez). Si dos ventanas se
  superponen, gana la campaña de inicio más reciente y el módulo muestra una advertencia.

## 2. El reporte semanal de Meta (template)

Se crea UNA vez en **Ads Reporting** (Administrador de anuncios → Informes / "Ads Reporting",
no la tabla principal) y queda guardado con columnas fijas — así el CSV es idéntico cada semana.

**Configuración del reporte guardado `EFIMERAMENTE-SEMANAL`:**

| Ajuste | Valor |
|---|---|
| Nivel / desglose | **Nombre de la campaña** (sin desglose por edad/género/ubicación) |
| Rango de fechas | **Últimos 7 días** |
| Columnas (en este orden idealmente) | Nombre de la campaña · Importe gastado · Impresiones · Alcance · Frecuencia · Clics en el enlace · CTR (porcentaje de clics en el enlace) · CPM · **Conversaciones de mensajería iniciadas** · Costo por conversación de mensajería iniciada |
| Programación | Enviar por **correo electrónico cada lunes** — llega al buzón de Mariana (**marianavillegaskraemer@gmail.com**), que es el buzón conectado al conector de Gmail |

Notas:
- ⚠️ **Cuenta correcta:** el reporte vive en la cuenta **"Efimeramente 2da Cuenta Ads"**
  (act `2663225010700511`, portfolio comercial "Efimeramente" `1077659662089797`). La sesión
  de Chrome aterriza por defecto en la cuenta personal de Mariana (`2199122680304491`), que
  solo tiene borradores — en Ads Reporting hay que cambiar el portfolio en el selector del
  header antes de tocar nada.
- La columna crítica es **"Conversaciones con mensajes iniciadas"** (Meta la renombró en 2026;
  antes "Conversaciones de mensajería iniciadas" — el parser acepta ambas). Búscala con
  "conversac" en el buscador de columnas. Si Meta la entrega como "Resultados" + "Indicador de
  resultado", el parser también la entiende (solo cuenta filas cuyo indicador sea
  `messaging_conversation_started`).
- **Dónde se programa el correo:** dentro del reporte guardado → botón de la cuenta (icono
  junto al selector de portfolio) → **"Configuración del informe"** → toggle **"Programar
  correo electrónico"** (Entrega: Semanal/lunes + Suscriptores). No está en Compartir ni en
  Exportar. Los suscriptores solo pueden ser **personas con acceso a la cuenta publicitaria**
  — Meta no acepta emails arbitrarios y el correo llega al email del login de Meta de esa
  persona. Suscriptora: **Mariana Villegas Kraemer** → el correo llega a
  **marianavillegaskraemer@gmail.com**, y ese buzón es el que está conectado al conector de
  Gmail de Claude (decisión 2026-07-14; el plan de invitar a efimeramenteec@gmail.com se
  abandonó — ver sección 7).
- El parser (`src/lib/metaCsv.js`) tolera encabezados en español o inglés, números
  localizados, BOM y filas de campañas inactivas en cero (las salta).
- **Grano semanal a propósito:** coincide con la cadencia del lunes y hace que la Frecuencia
  (señal de fatiga creativa) sea directamente interpretable a 7 días.

## 3. El protocolo /marketize (cada lunes)

Nicolas escribe `/marketize` en Claude Code. Claude entonces:

1. **Consigue el CSV de la semana**, en este orden de preferencia:
   1. **Gmail (conector):** buscar el correo del reporte de Meta de los últimos 7 días
      (remitente Meta/Facebook, asunto con "EFIMERAMENTE-SEMANAL") y descargar el CSV
      adjunto al scratchpad. *(Si el correo trae solo un link de descarga y no un adjunto,
      pasar al paso 2 o 3.)*
   2. **Descargas:** el CSV más reciente en `~/Downloads` que matchee el reporte (≤7 días).
   3. **Chrome (Claude in Chrome):** abrir Ads Reporting → reporte guardado
      `EFIMERAMENTE-SEMANAL` → Exportar CSV.
2. **Ejecuta el importador:** `node scripts/marketize-import.mjs <ruta-del-csv>`
   - Upsert de filas semanales en `campaign_weeks` por `(campaign_id, semana_inicio)` —
     re-importar el mismo archivo nunca duplica.
   - Crea campañas nuevas automáticamente (nombre exacto de Meta) y mantiene las ventanas:
     en un reporte "actual" (semana terminada hace ≤10 días), lo que aparece está corriendo
     y lo que desapareció se cierra en su última semana conocida. Los backfills históricos
     solo agrandan ventanas, nunca cierran/reabren.
3. **Entrega el briefing** que imprime el script (embudo de la semana, KPIs históricos,
   señales 🔴🟡🟢, llamadas sin seguimiento) con una interpretación corta. La misma
   información queda visible permanentemente en `/marketing` (misma matemática:
   `src/lib/marketing.js` es compartido).

`--dry-run` muestra qué haría sin escribir nada.

## 4. Señales (banderas) y umbrales

Calculadas sobre la última semana de la campaña activa vs la anterior (WoW) o vs el promedio
de la campaña. Pocas a propósito; cada una implica una acción. Con guardas de volumen para
no gritar con muestras chicas.

| # | Señal | Umbral | Significa |
|---|---|---|---|
| 1 | Costo por conversación | 🔴 +30% WoW · 🟢 −20% | Salud del anuncio/audiencia (necesita ≥5 conversaciones/semana) |
| 2 | Frecuencia | 🟡 ≥2.5 · 🔴 ≥3.5 | Fatiga creativa — rotar creativos |
| 3 | CTR | 🟡 −25% WoW (≥1000 impresiones) | Indicador ADELANTADO de fatiga (se mueve antes que el costo) |
| 4 | Conversación → llamada | 🟡 −30% WoW (≥5 conv. ambas semanas) | La fuga que Meta no ve: el WhatsApp no está cerrando llamadas |
| 5 | Llamada → paciente | 🟡 últimas 4 sem. < ½ del histórico (≥8 llamadas, ≥4 recientes) | El problema es la llamada gratuita, no los anuncios |
| 6 | CPA (costo por paciente) | 🔴 +30% vs promedio campaña · 🟢 −25% | La métrica reina |
| 7 | LTV:CAC | 🔴 <1x · 🟡 <3x · 🟢 ≥3x (≥3 pacientes atribuidos) | Economía sostenible. El LTV es "a la fecha" y sigue madurando |

## 5. El módulo /marketing (página, owner-only)

- **Selectores:** período (como Finanzas) + campaña específica.
- **Señales:** el mismo panel de banderas del briefing.
- **KPIs:** Costo por paciente (la métrica hero) · Costo por conversación · LTV a la fecha ·
  LTV:CAC (meta ≥3x).
- **Embudo:** Conversaciones → Llamadas → Pacientes con % en cada salto (impresiones/gasto
  son contexto, no etapas).
- **Evolución semanal:** gráfico de barras (gasto) + línea con métrica seleccionable
  (costo/conversación, CPA, conversaciones, llamadas, pacientes, frecuencia, CTR, CPM).
- **Campañas:** economía de por vida por campaña — gasto, pacientes, CPA, LTV, ingreso y
  **payback** (% del gasto ya recuperado) + editor de ventanas de atribución.
- **LTV por cohorte:** pacientes agrupados por mes de llegada (¿cada cohorte paga más con
  el tiempo?).
- **Llamadas sin sesión:** hicieron la llamada gratuita y no agendaron — lista de
  seguimiento de leads tibios.
- **Import manual (CSV):** botón de respaldo que hace lo mismo que `/marketize` paso 2.

## 6. Backfill histórico — ✅ HECHO 2026-07-13

Ejecutado por Claude vía Chrome + `marketize-import.mjs`: 15 semanas (2026-05-01 →
2026-07-13), 6 campañas creadas, $1,940.33 de gasto total importado. El CSV quedó en
`~/Downloads/EFIMERAMENTE-BACKFILL.csv`. **No re-importar ese CSV**: el importador lo
trataría como reporte "actual" y reabriría las ventanas ya cerradas (además de empujar
las `fecha_inicio` de vuelta a las fechas de gasto).

**Ventanas resueltas** (partición sin superposiciones — cada fecha tiene UNA campaña;
editable en `/marketing` → Campañas → Editar fechas):

| Campaña | Ventana de atribución |
|---|---|
| Campaña Mayo 2026 EM | 2026-05-01 → 2026-05-07 |
| Campaña_Nueva_Mayo | 2026-05-08 (1 día simbólico) |
| Campaña-Leads-Mayo | 2026-05-09 (1 día simbólico) |
| FINAL-FINAL-Mayo2026 (dominante) | 2026-05-10 → 2026-06-11 |
| Estaba_Harta_Junio_2026 | 2026-06-12 → 2026-06-18 |
| 2026-06_Prospecting_Script1-vs-Script6 | 2026-06-19 → activa |

En la semana 8–14 mayo corrieron 4 campañas a la vez; FINAL-FINAL fue la dominante y se
queda con la ventana desde el 10 de mayo. Las dos menores conservan 1 día simbólico para
no perder su historial de gasto en la tabla de campañas.

## 7. Setup pendiente (una sola vez — LO HACE CLAUDE en la próxima sesión, vía Chrome)

- [x] Activar el **conector de Gmail** en Claude Code — hecho por Nicolas 2026-07-13.
- [x] Crear el reporte guardado `EFIMERAMENTE-SEMANAL` en Ads Reporting — hecho 2026-07-13
      (report id `120253784913050119`, cuenta "Efimeramente 2da Cuenta Ads"
      `act=2663225010700511`). ⚠️ Se creó primero por error en la cuenta personal de Mariana
      (`2199122680304491`, la default de la sesión) — ese duplicado y su schedule ya fueron
      eliminados.
- [x] Programar su envío semanal por correo — hecho 2026-07-13 vía Configuración del informe
      → "Programar correo electrónico": **Semanal (lunes)**, suscriptor provisional Mariana
      Villegas Kraemer (Meta no acepta emails arbitrarios, solo gente con acceso a la cuenta).
- [x] Backfill exportado e importado + ventanas de mayo resueltas — ver sección 6.
- [x] **Buzón del correo semanal: marianavillegaskraemer@gmail.com** (decisión 2026-07-14).
      El plan original (invitar a efimeramenteec@gmail.com al portfolio) se **abandonó**:
      Meta exige que el suscriptor sea una persona activa del negocio, y aceptar la
      invitación requería crear una cuenta de Facebook real para ese email (Meta bloqueó
      todos los atajos). En su lugar, el conector de Gmail quedó autorizado contra el buzón
      de Mariana, que es adonde llega el reporte por ser ella la suscriptora.
      ⚠️ Limpieza pendiente (Nicolas): en Personas del portfolio quedó una invitación
      PENDIENTE para efimeramenteec@gmail.com con **acceso total + finanzas** — cancelarla
      (o degradarla) para que nadie pueda aceptarla con ese nivel de acceso.
- [x] **Conector de Gmail autorizado** (2026-07-14, buzón marianavillegaskraemer@gmail.com).
      Ojo: las herramientas del conector aparecen recién en la SIGUIENTE sesión de Claude
      Code (la lista de tools se fija al inicio de sesión — mismo comportamiento que el
      conector de Netlify, ver CLAUDE.md).
- [ ] Verificar si el correo de Meta trae el CSV **adjunto** o solo un **link**; si es link,
      el protocolo usa el fallback de Chrome (paso 1.3). El primer correo programado llega el
      lunes 2026-07-20 al buzón de Mariana → esta verificación queda para el primer
      `/marketize` real.

## 8. Arquitectura (archivos)

| Archivo | Rol |
|---|---|
| `src/lib/marketing.js` | **Toda la matemática** (pura, sin imports) — compartida página + briefing |
| `src/lib/metaCsv.js` | Parser del CSV de Meta (template semanal + backfill por "Semana") |
| `scripts/marketize-import.mjs` | Importador + briefing de terminal (usa los dos anteriores) |
| `src/pages/Marketing.jsx` | La página `/marketing` |
| `src/lib/queries.js` § Marketing v2 | Lecturas/escrituras Supabase de la página |
| `supabase/marketing-v2.sql` | Schema: `campaigns` + `campaign_weeks` (espejo de la migración) |
| `~/.claude/commands/marketize.md` | El comando `/marketize` |

**Schema:** `campaigns` (nombre único = nombre exacto en Meta, ventana de atribución) y
`campaign_weeks` (una fila por campaña por semana de reporte; upsert por
`(campaign_id, semana_inicio)`). RLS owner-only; el importador escribe con el service key.

**Decisiones de investigación (2026-07-13):** los reportes guardados de Ads Reporting
mantienen columnas idénticas y se pueden programar por correo — por eso el CSV es confiable
como contrato. El "MCP oficial de Meta" que circula en blogs (mcp.meta.com, @meta/ads-cli)
**no existe** (npm 404, DNS no resuelve — spam SEO generado por IA). La alternativa real es
el MCP de Pipeboard (Meta Business Partner, github.com/pipeboard-co/meta-ads-mcp) — plan C
si el flujo Gmail/Chrome molesta, a costa de meter un tercero entre la cuenta de ads y
nosotros.
