// Therapist session report (PDF). Generated from the Lista view's currently
// filtered set — "what you see is what you export." Used to send each therapist
// a verifiable list of their sessions in a period so they can confirm their pay.
//
// Rules (Nicolas, 2026-08): llamadas (free intro calls) are EXCLUDED — they're
// never paid. "Monto a pagar" = per-session provision_rate (therapists.provision_rate,
// $24 for everyone except Mariana = $0), the same figure Finanzas uses.
//
// jsPDF + autotable are imported dynamically so they only load when the user
// actually downloads a report (keeps them out of the main bundle).
import { ESTADO_SESION, TIPO_SESION } from './constants.js'
import { formatCurrency, formatTime, fullName } from './format.js'

const LOCALE = 'es-EC'
const BRAND = [180, 138, 228] // #B48AE4 lavender — table header fill
const DEFAULT_RATE = 24

// Plural label for the totals line, driven by the estado filter.
const ESTADO_PLURAL = {
  confirmada: 'CONFIRMADAS',
  programada: 'PENDIENTES',
  cancelada: 'CANCELADAS',
}

const PAGO_LABEL = { pagada: 'Pagadas', sin_pagar: 'Sin pagar' }

function fmtDay(fecha) {
  return new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(`${fecha}T00:00:00`))
}

function slug(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'todos'
}

// Best-effort logo load → { dataUrl, w, h } or null (never blocks the report).
async function loadLogo() {
  try {
    const res = await fetch(encodeURI('/logos/LOGOTIPOLARGO (1).png'))
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = reject
      r.readAsDataURL(blob)
    })
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = dataUrl
    })
    return { dataUrl, w: img.naturalWidth, h: img.naturalHeight }
  } catch {
    return null
  }
}

/**
 * Build + download the session report PDF.
 * @param sessions  the already-filtered Lista rows (WYSIWYG)
 * @param therapists  therapists array (needs provision_rate) for the pay calc
 * @param filters  { terapeuta, estado, pago, desde, hasta }
 * @param terapeutaName  display name when a single therapist is filtered, else null
 * @returns { ok, error }
 */
export async function downloadSessionReport({ sessions = [], therapists = [], filters = {}, terapeutaName = null }) {
  // Payroll report: free intro calls never count.
  const rows = sessions
    .filter((s) => s.tipo !== 'llamada')
    .slice()
    .sort((a, b) => (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio))

  if (rows.length === 0) return { ok: false, error: 'No hay sesiones (sin llamadas) para el reporte con los filtros actuales.' }

  const rateById = new Map(therapists.map((t) => [t.id, Number(t.provision_rate ?? DEFAULT_RATE)]))
  const rateOf = (s) => (rateById.has(s.terapeuta_id) ? rateById.get(s.terapeuta_id) : DEFAULT_RATE)
  const montoTotal = rows.reduce((sum, s) => sum + Number(s.monto || 0), 0)

  // Pay counts ONLY sessions that actually happened (confirmada / legacy
  // completada) — a pending or cancelled session is never paid. So the figure
  // is correct even if the report isn't filtered to Confirmada.
  const payRows = rows.filter((s) => s.estado === 'confirmada' || s.estado === 'completada')
  const pay = payRows.reduce((sum, s) => sum + rateOf(s), 0)
  const rates = [...new Set(payRows.map(rateOf))]
  const uniformRate = rates.length === 1 ? rates[0] : null

  // Period text: explicit range if set, else derived from the data.
  const desde = filters.desde || rows[0].fecha
  const hasta = filters.hasta || rows[rows.length - 1].fecha
  const periodoTxt = `${fmtDay(desde)} — ${fmtDay(hasta)}`

  const estadoWord = ESTADO_PLURAL[filters.estado] || ''
  const totalLine = estadoWord
    ? `TOTAL DE SESIONES ${estadoWord}: ${rows.length}`
    : `TOTAL DE SESIONES: ${rows.length}`
  const payLine = uniformRate != null
    ? `MONTO A PAGAR (${payRows.length} confirmadas × ${formatCurrency(uniformRate)}): ${formatCurrency(pay)}`
    : `MONTO A PAGAR (${payRows.length} confirmadas): ${formatCurrency(pay)}`

  // Scope line pieces.
  const scope = [
    `Terapeuta: ${terapeutaName || 'Todos'}`,
    `Estado: ${filters.estado ? ESTADO_SESION[filters.estado]?.label || filters.estado : 'Todos'}`,
    `Pagos: ${filters.pago ? PAGO_LABEL[filters.pago] || filters.pago : 'Todos'}`,
    `Periodo: ${periodoTxt}`,
  ].join('   ·   ')

  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ unit: 'mm', format: 'a4' }) // portrait
  const pageW = doc.internal.pageSize.getWidth()
  const marginX = 14
  const generado = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long', timeStyle: 'short' }).format(new Date())

  const logo = await loadLogo()
  let y = 14
  if (logo) {
    const w = 46
    const h = w * (logo.h / logo.w)
    doc.addImage(logo.dataUrl, 'PNG', marginX, y, w, h)
    y += h + 4
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(40)
    doc.text('Efimeramente', marginX, y + 4)
    y += 10
  }

  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(30)
  doc.text('Reporte de sesiones', marginX, y + 2)
  y += 8

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110)
  doc.text(scope, marginX, y)
  y += 6

  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Hora', 'Paciente', 'Tipo', 'Estado', 'Pagado', 'Monto']],
    body: rows.map((s) => [
      fmtDay(s.fecha),
      formatTime(s.hora_inicio),
      fullName(s.patient),
      TIPO_SESION[s.tipo] || s.tipo || '—',
      ESTADO_SESION[s.estado]?.label || s.estado || '—',
      s.pagado ? 'Sí' : 'No',
      formatCurrency(s.monto),
    ]),
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: 40 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 244, 251] },
    columnStyles: {
      5: { halign: 'center' },
      6: { halign: 'right' },
    },
    margin: { left: marginX, right: marginX },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight()
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(150)
      doc.text(`Generado el ${generado}`, marginX, h - 8)
      const page = doc.internal.getNumberOfPages()
      doc.text(`Página ${page}`, pageW - marginX, h - 8, { align: 'right' })
    },
  })

  // Totals block under the table.
  let ty = doc.lastAutoTable.finalY + 8
  const pageH = doc.internal.pageSize.getHeight()
  if (ty > pageH - 30) { doc.addPage(); ty = 20 }

  doc.setDrawColor(...BRAND).setLineWidth(0.4)
  doc.line(marginX, ty, pageW - marginX, ty)
  ty += 8

  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(30)
  doc.text(totalLine, marginX, ty)
  ty += 8
  doc.setTextColor(...BRAND)
  doc.text(payLine, marginX, ty)

  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(120)
  ty += 7
  doc.text(`Monto total de las sesiones: ${formatCurrency(montoTotal)}`, marginX, ty)

  const fname = `Efimeramente-Sesiones-${slug(terapeutaName || 'Todos')}-${slug(desde)}_a_${slug(hasta)}.pdf`
  doc.save(fname)
  return { ok: true }
}
