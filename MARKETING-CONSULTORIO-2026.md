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
- **Semana de transición Prospecting → Julio_2026 (13–19 jul 2026):** `Julio_2026` arrancó el
  13 jul mientras `2026-06_Prospecting_Script1-vs-Script6` todavía tenía gasto residual
  (~$66) esa misma semana, así que Meta reporta ambas y sus ventanas se superponen. Decisión
  (Nicolas, 2026-07-22): los pacientes nuevos de esa semana son de `Julio_2026` — que ya es el
  resultado del desempate "inicio más reciente" — y se **cerró `Prospecting` en 2026-07-12**
  (fecha_fin) para eliminar el solape. ⚠️ Re-importar el CSV de esa semana **reabre**
  Prospecting (aparece con gasto en un reporte ≤10 días → el importador la asume activa); el
  cierre se vuelve permanente solo, cuando la semana pasa a ser backfill (>10 días, ~29 jul).
  Si se reabre antes, re-cerrar a mano en "Editar fechas".

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
- **Columna de la semana (`Inicio del informe` / `Reporting starts`):** el parser la
  necesita para saber a qué semana pertenece cada fila. El correo programado de Meta la
  incluye, pero un **Exportar manual** desde el pivote en Chrome la **omite**. Esto ya
  **no requiere intervención**: `marketize-import.mjs` detecta la ausencia y **repone la
  semana desde el nombre del archivo** (`EFIMERAMENTE-SEMANAL-<Mes>-<D>-<Año>-<Mes>-<D>-<Año>.csv`),
  imprimiendo `ℹ Export manual sin columna de semana …`. Solo aborta si el nombre del
  archivo perdió su rango de fechas estilo Meta, o si falta una columna **distinta** (eso
  sí es un cambio real de template). (Antes esto era un loop manual cada semana; se
  automatizó 2026-08-06. Origen del comportamiento: 2026-07-22, reporte del 13–19 jul.)
- **Grano semanal a propósito:** coincide con la cadencia del lunes y hace que la Frecuencia
  (señal de fatiga creativa) sea directamente interpretable a 7 días.

## 3. El protocolo /marketize (cada lunes)

Nicolas escribe `/marketize` en Claude Code. Claude entonces:

1. **Pídele el CSV de la semana a Nicolas.** Claude **no** intenta bajarlo solo (ni
   Gmail, ni Descargas, ni Chrome): el correo programado de Meta solo trae *links* de
   descarga detrás del login de Facebook, así que todo intento automático termina con
   Nicolas descargándolo a mano igual. Por eso, directo: pídele la ruta del archivo (o
   que lo adjunte) y espérala. La automatización del download queda **pendiente a
   propósito** — se cablea otro día; mientras tanto el hand-off manual **es** el
   protocolo, no un fallback.
   - El CSV de Nicolas normalmente es un **Exportar manual** del pivote de Meta, que
     **omite la columna de fecha del informe** (`Inicio del informe` / `Reporting starts`).
     No pasa nada y **no hay que pedir que se agregue nada**: el importador detecta la
     ausencia y **repone la semana desde el nombre del archivo** (imprime
     `ℹ Export manual sin columna de semana …`). Por eso el archivo debe conservar el
     nombre estilo Meta `EFIMERAMENTE-SEMANAL-<Mes>-<D>-<Año>-<Mes>-<D>-<Año>.csv`
     (p. ej. `…-Jul-27-2026-Aug-2-2026.csv`) — de ahí sale la semana. Esto no es inventar
     datos: nombre de archivo, selector de fechas y asunto del correo coinciden.
   - Para exportar a mano en Chrome (referencia, Nicolas ya lo hace): Ads Reporting →
     portfolio **Efimeramente** (cuenta `2663225010700511`) → reporte guardado
     `EFIMERAMENTE-SEMANAL` → rango = la semana (lun–dom) → **Exportar → CSV**.
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
- ⚠️ **Dos "costo por paciente" que NO coinciden — es correcto, miden cosas distintas.**
  El briefing del lunes reporta el **costo por paciente de la semana** (gasto de la campaña esa
  semana ÷ pacientes atribuidos esa semana; apples-to-apples). La página, con el selector de
  campaña, muestra el **costo por paciente acumulado de la campaña** (todo el gasto cargado ÷
  todos los pacientes atribuidos a la fecha). A media campaña el número de la página **está
  sesgado hacia abajo**: los pacientes se atribuyen por fecha de reserva hasta *hoy*, pero el
  gasto solo llega hasta el último domingo importado — el denominador crece días antes que el
  numerador. Sube al importar la semana siguiente. Para juzgar eficiencia usa el número
  **semanal completo**; trata el acumulado de media campaña como **piso optimista**, no verdad
  final. (Origen del análisis: sesión 2026-07-22 — ver §9.)
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

## 9. Bitácora de sesiones (insights + qué vigilar)

### 2026-07-22 — primer reporte de `Julio_2026` (semana 13–19 jul)

**Qué pasó / qué se hizo:**
- Primer `/marketize` de la campaña `Julio_2026` (creada en el import, arrancó 2026-07-13).
- El correo de Meta traía solo link (sin adjunto) → se exportó por Chrome. **El export manual
  no trae la columna de fecha del informe** → se agregó `Reporting starts`/`Reporting ends` a
  mano (ver §2 y §3.iii). Codificado para que no vuelva a bloquear.
- **Ventanas:** `Prospecting` y `Julio_2026` se solapaban (Prospecting tenía gasto residual
  ~$66 la semana 13–19). Se cerró `Prospecting` en **2026-07-12** (ver §1). La atribución de
  esos pacientes ya era de `Julio_2026` por el desempate "inicio más reciente".
- **Bug de datos limpiado:** una fila stale de `campaign_weeks` del import de prueba
  `MARKETIZE-TEST` (Prospecting, semana 2026-07-10→07-16, $134.52/26 conv) **se solapaba** con
  la semana real y duplicaba gasto/conversaciones → inflaba el embudo del período ($328/59 en
  vez de $193.54/33). **Borrada.** Verificado que no quedan más solapes de semanas por campaña.

**Lectura de la campaña (con el número correcto):**
- Costo por paciente **semana 13–19 = $31.83** ($127.32 ÷ 4). Costo por paciente **acumulado
  = $14.15** ($127.32 ÷ 9) — más bajo por el sesgo de spend-lag (ver §5). Ambos correctos.
- **Velocidad acelerando:** 4 pacientes en 13–19, **5 más en 20–22** (3 días). No parecía
  flopping; la señal 🔴 de la semana 1 era ruido de muestra chica + LTV inmaduro.

**Qué vigilar en el próximo `/marketize` (lunes 2026-07-27, semana 20–26 jul):**
1. **Costo por paciente acumulado de `Julio_2026` debería SUBIR** al cargar el gasto de 20–26
   (el denominador ya tiene los 9 pacientes; entra el numerador que faltaba). Si se estabiliza
   cerca del CPA histórico (~$13.68) → campaña sana. Si se dispara muy por encima → revisar.
2. **¿Sigue la aceleración de pacientes?** 9 en los primeros 10 días fue buen ritmo; confirmar
   que la semana 20–26 lo sostiene.
3. **Fuga conversación→llamada (15.3% en la semana 1):** ver si persiste. Si sí, el problema
   es el cierre por WhatsApp, no el anuncio (señal #4).
4. **`Prospecting` puede reabrirse** si se re-importa el CSV del 13–19 antes de que esa semana
   supere los 10 días (~29 jul); después queda cerrada sola. Si aparece reabierta, re-cerrar en
   2026-07-12.
