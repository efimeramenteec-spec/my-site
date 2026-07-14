// Parser for the weekly Meta Ads report (Marketing module v2).
// Expects the EFIMERAMENTE-SEMANAL template: one row per campaign covering the
// report's date range (weekly grain — see MARKETING-CONSULTORIO-2026.md).
// Dependency-free on purpose. Tolerates BOM, CRLF, quoted fields, and both
// Spanish and English column names.
//
// Conversations can arrive two ways and both are handled:
//   1. An explicit "Conversaciones de mensajería iniciadas" column (preferred —
//      part of the template contract).
//   2. Meta's generic "Resultados" column + "Indicador de resultado" saying
//      `messaging_conversation_started` (what ad-account exports produce).

// Minimal RFC-4180 CSV → array of rows (arrays of strings).
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field); field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.length > 1 || row[0] !== '') rows.push(row)
  return rows
}

const norm = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

// Header → field. Matched by substring on the normalized header so exact Meta
// wording/locale doesn't matter. First match wins per field; matchers are
// ordered so more specific needles claim their column before generic ones
// (e.g. "clics en el enlace" must not be eaten by a generic "clic" matcher).
const HEADER_MATCHERS = [
  ['semana_inicio', ['inicio del informe', 'reporting starts']],
  ['semana_fin', ['fin del informe', 'reporting ends']],
  // Backfill exports break down by week: a "Semana" column per row, which
  // takes precedence over the report-range columns (those hold the FULL
  // export range in every row and would collapse the history to one week).
  ['semana', ['semana', 'week']],
  ['campaign', ['nombre de la campana', 'campaign name']],
  ['spend', ['importe gastado', 'amount spent']],
  ['reach', ['alcance', 'reach']],
  ['frequency', ['frecuencia', 'frequency']],
  ['cpm', ['cpm']],
  ['ctr', ['ctr (porcentaje de clics en el enlace)', 'ctr (link click-through rate)']],
  ['link_clicks', ['clics en el enlace', 'link clicks']],
  ['impressions', ['impresiones', 'impressions']],
  ['conversations', ['conversaciones de mensajeria iniciadas', 'messaging conversations started']],
  ['results', ['resultados', 'results']],
  ['result_indicator', ['indicador de resultado', 'result indicator']],
]

function mapHeaders(headerRow) {
  const map = {} // field -> column index
  headerRow.forEach((h, idx) => {
    const n = norm(h)
    for (const [field, needles] of HEADER_MATCHERS) {
      if (field in map) continue
      if (needles.some((needle) => n.includes(needle))) {
        map[field] = idx
        break
      }
    }
  })
  return map
}

// '2026-07-03' | '03/07/2026' | '7/3/2026'(en-US) → 'YYYY-MM-DD' | null.
// DD/MM vs MM/DD is disambiguated by which side exceeds 12; ambiguous values
// assume DD/MM (es-EC locale).
function toIsoDate(raw) {
  const s = String(raw || '').trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) {
    let [, a, b, y] = m
    let day = Number(a), month = Number(b)
    if (day <= 12 && month > 12) [day, month] = [month, day]
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return null
}

const toNumber = (raw) => {
  // Meta may localize numbers ("1.234,56" / "1,234.56") — strip currency and
  // treat whichever separator appears LAST as the decimal point.
  const s = String(raw || '').replace(/[^0-9.,-]/g, '')
  if (!s) return 0
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let normalized
  if (lastComma > -1 && lastDot > -1) {
    normalized = lastComma > lastDot
      ? s.replace(/\./g, '').replace(',', '.') // 1.234,56 → 1234.56
      : s.replace(/,/g, '')                    // 1,234.56 → 1234.56
  } else if (lastComma > -1) {
    // Lone comma: decimal when ≤2 digits follow ("12,5"), thousands otherwise ("1,234").
    normalized = s.length - lastComma - 1 <= 2 ? s.replace(/,/g, '.') : s.replace(/,/g, '')
  } else {
    normalized = s
  }
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

/**
 * @returns {{ ok: true,
 *             weeks: [{ campaign, semana_inicio, semana_fin, spend, impressions,
 *                       reach, frequency, link_clicks, ctr, cpm, conversations }],
 *             skipped: number }
 *          | { ok: false, error: string }}
 */
export function parseMetaCsv(text) {
  const rows = parseCsv(text)
  if (rows.length < 2) return { ok: false, error: 'El archivo está vacío o no es un CSV.' }

  const h = mapHeaders(rows[0])
  const missing = []
  if (!('campaign' in h)) missing.push('Nombre de la campaña')
  if (!('semana_inicio' in h) && !('semana' in h)) missing.push('Inicio del informe (o Semana)')
  if (!('spend' in h)) missing.push('Importe gastado')
  if (!('conversations' in h) && !('results' in h)) missing.push('Conversaciones de mensajería iniciadas')
  if (missing.length) {
    return {
      ok: false,
      error: `Faltan columnas del template EFIMERAMENTE-SEMANAL: ${missing.join(', ')}. Revisa el reporte guardado en Meta (ver MARKETING-CONSULTORIO-2026.md).`,
    }
  }

  const val = (r, f) => (f in h ? toNumber(r[h[f]]) : 0)
  const out = []
  let skipped = 0
  const plus6 = (iso) => {
    const d = new Date(`${iso}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 6)
    return d.toISOString().slice(0, 10)
  }
  for (const r of rows.slice(1)) {
    const porSemana = 'semana' in h ? toIsoDate(r[h.semana]) : null
    const semana_inicio = porSemana ||
      ('semana_inicio' in h ? toIsoDate(r[h.semana_inicio]) : null)
    const semana_fin = porSemana
      ? plus6(porSemana)
      : ('semana_fin' in h && toIsoDate(r[h.semana_fin])) || semana_inicio
    const campaign = String(r[h.campaign] || '').trim()
    const spend = val(r, 'spend')
    const impressions = Math.round(val(r, 'impressions'))
    // Meta includes inactive campaigns as all-zero rows — not data, skip them.
    if (!semana_inicio || !campaign || (spend === 0 && impressions === 0)) { skipped++; continue }

    let conversations = 0
    if ('conversations' in h && String(r[h.conversations] || '').trim() !== '') {
      conversations = Math.round(val(r, 'conversations'))
    } else if ('results' in h) {
      const indicator = 'result_indicator' in h ? norm(r[h.result_indicator]) : ''
      // Only trust "Resultados" when the indicator says it counts conversations
      // (or there is no indicator column to check against).
      if (!indicator || indicator.includes('messaging_conversation_started')) {
        conversations = Math.round(val(r, 'results'))
      }
    }

    out.push({
      campaign,
      semana_inicio,
      semana_fin,
      spend,
      impressions,
      reach: Math.round(val(r, 'reach')),
      frequency: val(r, 'frequency'),
      link_clicks: Math.round(val(r, 'link_clicks')),
      ctr: val(r, 'ctr'),
      cpm: val(r, 'cpm'),
      conversations,
    })
  }
  if (!out.length) {
    return { ok: false, error: 'Ninguna fila tenía datos (¿todas las campañas en 0?). No hay nada que importar.' }
  }

  // Same campaign + range duplicates (e.g. an ad-set-level export) collapse
  // into one weekly row. Reach is NOT additive across rows — keep the max and
  // recompute frequency from the summed impressions.
  const byKey = new Map()
  for (const r of out) {
    const key = `${r.campaign}|${r.semana_inicio}`
    const prev = byKey.get(key)
    if (prev) {
      prev.spend += r.spend
      prev.impressions += r.impressions
      prev.link_clicks += r.link_clicks
      prev.conversations += r.conversations
      prev.reach = Math.max(prev.reach, r.reach)
      prev.frequency = prev.reach > 0 ? prev.impressions / prev.reach : 0
      prev.ctr = prev.impressions > 0 ? (100 * prev.link_clicks) / prev.impressions : 0
      prev.cpm = prev.impressions > 0 ? (1000 * prev.spend) / prev.impressions : 0
    } else byKey.set(key, { ...r })
  }
  const weeks = [...byKey.values()].sort(
    (a, b) => a.semana_inicio.localeCompare(b.semana_inicio) || a.campaign.localeCompare(b.campaign),
  )
  return { ok: true, weeks, skipped }
}
