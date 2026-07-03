// Parser for Meta Ads Manager CSV exports (Marketing module).
// Dependency-free on purpose. Tolerates BOM, CRLF, quoted fields, and both
// English and Spanish column names. The report must include a daily breakdown
// ("Day"/"Día") — rows without a parseable date (e.g. Meta's summary row) are
// skipped silently.

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

// Header → funnel field. Matched by substring on the normalized header so the
// exact Meta wording/locale doesn't matter. First match wins per field.
const HEADER_MATCHERS = [
  ['fecha', ['day', 'dia', 'reporting starts', 'inicio del informe', 'fecha']],
  ['spend', ['amount spent', 'importe gastado', 'gasto']],
  ['impressions', ['impression', 'impresiones']],
  ['clicks', ['link click', 'clics en el enlace', 'click', 'clics']],
  ['conversations', ['conversation', 'conversacion']],
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
 * @returns {{ ok: true, rows: [{fecha,spend,impressions,clicks,conversations}], skipped: number }
 *          | { ok: false, error: string }}
 */
export function parseMetaCsv(text) {
  const rows = parseCsv(text)
  if (rows.length < 2) return { ok: false, error: 'El archivo está vacío o no es un CSV.' }

  const headers = mapHeaders(rows[0])
  if (!('fecha' in headers)) {
    return { ok: false, error: 'No encontré la columna de fecha ("Day"/"Día"). Exporta el reporte con desglose por día.' }
  }
  if (!('spend' in headers) && !('impressions' in headers)) {
    return { ok: false, error: 'No encontré columnas de métricas ("Amount spent"/"Impressions"…). Revisa las columnas del reporte.' }
  }

  const out = []
  let skipped = 0
  for (const r of rows.slice(1)) {
    const fecha = toIsoDate(r[headers.fecha])
    if (!fecha) { skipped++; continue }
    const val = (f) => (f in headers ? toNumber(r[headers[f]]) : 0)
    out.push({
      fecha,
      spend: val('spend'),
      impressions: Math.round(val('impressions')),
      clicks: Math.round(val('clicks')),
      conversations: Math.round(val('conversations')),
    })
  }
  if (!out.length) return { ok: false, error: 'Ninguna fila tenía una fecha válida — ¿el reporte tiene desglose por día?' }

  // Same-day duplicates (e.g. per-ad breakdown) collapse into one daily row.
  const byDate = new Map()
  for (const r of out) {
    const prev = byDate.get(r.fecha)
    if (prev) {
      prev.spend += r.spend
      prev.impressions += r.impressions
      prev.clicks += r.clicks
      prev.conversations += r.conversations
    } else byDate.set(r.fecha, { ...r })
  }
  return { ok: true, rows: [...byDate.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)), skipped }
}
