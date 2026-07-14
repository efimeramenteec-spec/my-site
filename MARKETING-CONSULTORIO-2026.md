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
| Programación | Enviar por **correo electrónico cada lunes** (formato CSV) a nicolasdltz97@gmail.com |

Notas:
- La columna crítica es **"Conversaciones de mensajería iniciadas"** — agrégala explícitamente
  (buscador de columnas → "mensajería"). Si Meta la entrega como "Resultados" + "Indicador de
  resultado", el parser también la entiende (solo cuenta filas cuyo indicador sea
  `messaging_conversation_started`).
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

## 6. Backfill histórico (una sola vez — primer pendiente)

Datos de sesiones existen desde mayo; los ads corren desde mayo.

1. En Ads Reporting: reporte con las **mismas columnas** del template + desglose temporal
   **por semana** ("Semana"), rango **1 mayo 2026 → hoy**, nivel campaña. Exportar CSV.
   (El parser detecta la columna "Semana" y calcula cada rango semanal.)
2. `node scripts/marketize-import.mjs <backfill.csv>` — poblará todas las semanas y creará
   las campañas históricas.
3. **Resolver mayo a mano:** en mayo corrieron 4 campañas a la vez (Campaña Mayo 2026 EM,
   Campaña_Nueva_Mayo, Campaña-Leads-Mayo, FINAL-FINAL-Mayo2026 — la dominante por gasto).
   En `/marketing` → Campañas → Editar fechas, ajustar las ventanas para que cada fecha
   tenga UNA campaña (o aceptar la advertencia de superposición: gana la de inicio más
   reciente).

## 7. Setup pendiente (una sola vez — LO HACE CLAUDE en la próxima sesión, vía Chrome)

- [x] Activar el **conector de Gmail** en Claude Code — hecho por Nicolas 2026-07-13.
- [ ] Con Claude in Chrome (sesión logueada de Nicolas): crear el reporte guardado
      `EFIMERAMENTE-SEMANAL` en Ads Reporting según la sección 2.
- [ ] Programar su envío semanal por correo (lunes, CSV, a nicolasdltz97@gmail.com).
- [ ] Exportar el CSV de backfill (sección 6) y correr el importador; luego resolver las
      ventanas superpuestas de mayo en `/marketing`.
- [ ] Verificar si el correo de Meta trae el CSV **adjunto** o solo un **link**; si es link,
      el protocolo usa el fallback de Chrome (paso 1.3). Si el primer correo programado aún
      no llegó, esta verificación queda para el primer `/marketize` real.

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
