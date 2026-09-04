import React, { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Card } from '../components/Card/Card.jsx'
import { Button } from '../components/Button/Button.jsx'
import { Select } from '../components/Select/Select.jsx'
import { getSessionsData, createSession, updateSession, deleteSession, createPatient, notifySessionEstado } from '../lib/queries.js'
import { WeekView, MonthView, ListView } from '../features/sesiones/views.jsx'
import { SesionDrawer } from '../features/sesiones/SesionDrawer.jsx'
import { formatWeekRange, formatMonthYear, addDays, addMonths, fullName, patientLabel, formatTime } from '../lib/format.js'
import { CONFIRMACION } from '../lib/constants.js'
import { findConflict, roomsFull, CONSULTORIOS } from '../lib/conflicts.js'
import { groupSessionsByPatient } from '../lib/conversion.js'
import { IconChevronRight, IconPlus, IconDownload } from '../layout/icons.jsx'
import { useAuth } from '../lib/auth.jsx'
import { downloadSessionReport } from '../lib/sessionReport.js'

const VIEWS = [
  ['semana', 'Semana'],
  ['mes', 'Mes'],
  ['lista', 'Lista'],
]

// UI state survives page reloads (e.g. the phone discarding the backgrounded
// PWA) via sessionStorage, so coming back doesn't reset the view/filters.
const UI_KEY = 'sesiones-ui'
function loadUi() {
  try {
    return JSON.parse(sessionStorage.getItem(UI_KEY)) || {}
  } catch {
    return {}
  }
}

export default function Sesiones() {
  const ctx = useOutletContext()
  const [data, setData] = useState(null)
  const [view, setView] = useState(() => loadUi().view || 'semana')
  const [cursor, setCursor] = useState(() => {
    const saved = loadUi().cursor && new Date(loadUi().cursor)
    return saved && !isNaN(saved) ? saved : new Date()
  })
  const [filters, setFilters] = useState(() => ({ terapeuta: '', estado: '', pago: '', desde: '', hasta: '', ...loadUi().filters }))

  useEffect(() => {
    try {
      sessionStorage.setItem(UI_KEY, JSON.stringify({ view, filters, cursor: cursor.toISOString() }))
    } catch { /* storage unavailable — non-fatal */ }
  }, [view, filters, cursor])

  const [drawer, setDrawer] = useState({ open: false, mode: 'create', initial: null, defaultDate: null })
  const [search, setSearch] = useState('')
  const { fullAccess, terapeutaId } = useAuth()

  const handleSetView = (v) => { setView(v); setSearch('') }

  async function loadData() {
    const d = await getSessionsData()
    setData(d)
    ctx?.setDataSource?.(d.source)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Conversion for llamadas is derived from the patient's FULL session history
  // (unfiltered), so a later real session still counts even when the Lista
  // filters would hide it.
  const sessionsByPatient = useMemo(
    () => groupSessionsByPatient(data?.sessions || []),
    [data],
  )

  const sessions = (data?.sessions || []).filter(
    (s) =>
      (fullAccess
        ? !filters.terapeuta || s.terapeuta_id === filters.terapeuta
        : s.terapeuta_id === terapeutaId) &&
      (!filters.estado || s.estado === filters.estado) &&
      (!filters.pago || (filters.pago === 'pagada' ? !!s.pagado : !s.pagado)),
  )

  // Lista adds a date range (Desde/Hasta) + name search on top of the shared
  // filters. fecha is 'YYYY-MM-DD', so string compare == date compare.
  const q = search.trim().toLowerCase()
  const visibleSessions =
    view === 'lista'
      ? sessions.filter((s) => {
          if (filters.desde && s.fecha < filters.desde) return false
          if (filters.hasta && s.fecha > filters.hasta) return false
          if (q) {
            const name = `${s.patient?.nombre || ''} ${s.patient?.apellido || ''}`.toLowerCase()
            if (!name.includes(q)) return false
          }
          return true
        })
      : sessions

  function shift(dir) {
    setCursor((c) => (view === 'mes' ? addMonths(c, dir) : addDays(c, dir * 7)))
  }

  async function handleDownloadReport() {
    const terapeutaName = fullAccess
      ? (filters.terapeuta ? fullName((data?.therapists || []).find((t) => t.id === filters.terapeuta)) : null)
      : fullName((data?.therapists || []).find((t) => t.id === terapeutaId))
    const res = await downloadSessionReport({
      sessions: visibleSessions,
      therapists: data?.therapists || [],
      filters,
      terapeutaName,
    })
    if (!res.ok) window.alert(res.error || 'No se pudo generar el reporte.')
  }

  const openCreate = (defaultDate = null) => setDrawer({ open: true, mode: 'create', initial: null, defaultDate })
  const openEdit = (session) => setDrawer({ open: true, mode: 'edit', initial: session, defaultDate: null })
  const closeDrawer = () => setDrawer((d) => ({ ...d, open: false }))

  async function handleSubmit(payload) {
    // Backstop: never allow a double-booking even if the drawer guard was bypassed.
    const excludeId = drawer.mode === 'edit' ? drawer.initial.id : null
    const conflict = findConflict(data?.sessions || [], payload, excludeId)
    if (conflict) {
      return { ok: false, error: `Choca con ${fullName(conflict.patient)} (${formatTime(conflict.hora_inicio)}–${formatTime(conflict.hora_fin)}).` }
    }
    // Only 3 consultorios: block a 4th overlapping presencial session.
    if (roomsFull(data?.sessions || [], payload, excludeId)) {
      return { ok: false, error: `No hay consultorio disponible: ya hay ${CONSULTORIOS} sesiones presenciales en ese horario.` }
    }
    const res = drawer.mode === 'edit' ? await updateSession(drawer.initial.id, payload) : await createSession(payload)
    if (res.ok) {
      // Drawer edits can change estado too — push like the toggle does.
      if (
        drawer.mode === 'edit' &&
        payload.estado !== drawer.initial.estado &&
        (payload.estado === 'confirmada' || payload.estado === 'cancelada')
      ) {
        notifySessionEstado(drawer.initial.id)
      }
      await loadData()
      // The session saved, but the Google Calendar event didn't get created
      // (transient Google API failure, or the therapist hasn't shared their
      // calendar). Surface it instead of failing silently — otherwise the
      // session simply never shows up on the calendar and nobody notices.
      if (res.calendarWarning) {
        window.alert(
          'La sesión se guardó, pero NO se pudo crear el evento en Google Calendar. ' +
            'Verifica el calendario del terapeuta; puede que debas crear el evento manualmente.',
        )
      }
    }
    return res
  }

  async function handleCreatePatient(payload) {
    const res = await createPatient(payload)
    if (res.ok) await loadData()
    return res
  }

  async function handleSetEstado(s, estado) {
    const res = await updateSession(s.id, { estado })
    if (res.ok) {
      if (estado !== s.estado && (estado === 'confirmada' || estado === 'cancelada')) {
        notifySessionEstado(s.id)
      }
      await loadData()
    } else window.alert(res.error || 'No se pudo actualizar la confirmación.')
  }

  async function handleDelete(s) {
    const when = `${s.fecha} ${formatTime(s.hora_inicio)}`
    const ok = window.confirm(
      `¿Eliminar la sesión de ${patientLabel(s.patient)} (${when})?\n\n` +
        'Se borra definitivamente, junto con su evento de Google Calendar. ' +
        'Esta acción no se puede deshacer.',
    )
    if (!ok) return
    const res = await deleteSession(s.id)
    if (res.ok) await loadData()
    else window.alert(res.error || 'No se pudo eliminar la sesión.')
  }

  // Llamada conversion (manual override). Sets sessions.convirtio true/false;
  // NULL (never set) means the app auto-derives it. Available to therapists too.
  async function handleSetConvirtio(s, converted) {
    const res = await updateSession(s.id, { convirtio: converted })
    if (res.ok) await loadData()
    else window.alert(res.error || 'No se pudo actualizar la conversión.')
  }

  async function handleToggleFacturada(s, facturada) {
    // Llamadas gratuitas are free intro calls — never invoiced.
    if (s.tipo === 'llamada') return
    if (facturada && (s.estado === 'cancelada' || s.estado === 'no_show')) {
      window.alert('Una sesión cancelada no se factura.')
      return
    }
    const res = await updateSession(s.id, { facturada })
    if (res.ok) await loadData()
    else window.alert(res.error || 'No se pudo actualizar la facturación.')
  }

  // Pay picker (Lista): metodo is '' → mark unpaid, or one of
  // transferencia/paypal/payphone → mark paid with that method.
  async function handleSetPago(s, metodo) {
    // Llamadas gratuitas are free intro calls — never charged.
    if (s.tipo === 'llamada') return
    const paid = !!metodo
    if (paid && (s.estado === 'cancelada' || s.estado === 'no_show')) {
      window.alert('Una sesión cancelada no se cobra.')
      return
    }
    const patch = paid ? { pagado: true, metodo_pago: metodo } : { pagado: false }
    const res = await updateSession(s.id, patch)
    if (res.ok) await loadData()
    else window.alert(res.error || 'No se pudo actualizar el pago.')
  }

  const navLabel =
    view === 'mes' ? formatMonthYear(cursor) : view === 'semana' ? formatWeekRange(cursor) : 'Todas las sesiones'

  const terapeutaOptions = [
    { value: '', label: 'Todos los terapeutas' },
    ...(data?.therapists || []).map((t) => ({ value: t.id, label: fullName(t) })),
  ]
  const estadoOptions = [
    { value: '', label: 'Todos los estados' },
    ...CONFIRMACION.map((c) => ({ value: c.value, label: c.label })),
  ]
  const pagoOptions = [
    { value: '', label: 'Todos los pagos' },
    { value: 'pagada', label: 'Pagadas' },
    { value: 'sin_pagar', label: 'Sin pagar' },
  ]

  return (
    <div className="space-y-5 pt-2">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-pill border border-white/70 bg-white/60 p-1">
            {VIEWS.map(([v, label]) => (
              <button
                key={v}
                onClick={() => handleSetView(v)}
                className={`rounded-pill px-4 py-1.5 font-heading text-sm font-bold transition-all duration-300 ${
                  view === v ? 'bg-brand-gradient text-white shadow-soft' : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {view !== 'lista' && (
            <div className="flex items-center gap-1">
              <button onClick={() => shift(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/60 text-content-secondary transition-colors hover:text-content-primary" aria-label="Anterior">
                <IconChevronRight size={16} className="rotate-180" />
              </button>
              <span className="min-w-[130px] text-center font-heading text-sm font-bold text-content-primary">{navLabel}</span>
              <button onClick={() => shift(1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/60 text-content-secondary transition-colors hover:text-content-primary" aria-label="Siguiente">
                <IconChevronRight size={16} />
              </button>
              <button onClick={() => setCursor(new Date())} className="ml-1 rounded-pill border border-white/70 bg-white/60 px-3 py-1.5 font-heading text-xs font-bold text-content-secondary transition-colors hover:text-content-primary">
                Hoy
              </button>
            </div>
          )}
        </div>

        {view === 'lista' && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Buscar paciente…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-xl border border-stroke bg-white/70 px-4 py-2 font-body text-sm text-content-primary placeholder:text-content-muted focus:border-brand-lavender focus:outline-none focus:ring-2 focus:ring-brand-lavender/20"
            />
            <label className="flex items-center gap-1.5 font-heading text-xs font-bold text-content-secondary">
              Desde
              <input
                type="date"
                value={filters.desde}
                max={filters.hasta || undefined}
                onChange={(e) => setFilters((f) => ({ ...f, desde: e.target.value }))}
                className="rounded-xl border border-stroke bg-white/70 px-3 py-2 font-body text-sm text-content-primary focus:border-brand-lavender focus:outline-none focus:ring-2 focus:ring-brand-lavender/20"
              />
            </label>
            <label className="flex items-center gap-1.5 font-heading text-xs font-bold text-content-secondary">
              Hasta
              <input
                type="date"
                value={filters.hasta}
                min={filters.desde || undefined}
                onChange={(e) => setFilters((f) => ({ ...f, hasta: e.target.value }))}
                className="rounded-xl border border-stroke bg-white/70 px-3 py-2 font-body text-sm text-content-primary focus:border-brand-lavender focus:outline-none focus:ring-2 focus:ring-brand-lavender/20"
              />
            </label>
            {(filters.desde || filters.hasta) && (
              <button
                onClick={() => setFilters((f) => ({ ...f, desde: '', hasta: '' }))}
                className="font-heading text-xs font-bold text-content-secondary underline-offset-2 hover:text-content-primary hover:underline"
              >
                Limpiar fechas
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <Select options={terapeutaOptions} value={filters.terapeuta} onChange={(e) => setFilters((f) => ({ ...f, terapeuta: e.target.value }))} placeholder="" />
          </div>
          <div className="w-40">
            <Select options={estadoOptions} value={filters.estado} onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))} placeholder="" />
          </div>
          <div className="w-36">
            <Select options={pagoOptions} value={filters.pago} onChange={(e) => setFilters((f) => ({ ...f, pago: e.target.value }))} placeholder="" />
          </div>
          {view === 'lista' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleDownloadReport}
              disabled={!data || visibleSessions.filter((s) => s.tipo !== 'llamada').length === 0}
            >
              <IconDownload size={16} /> Descargar reporte
            </Button>
          )}
          <Button size="sm" onClick={() => openCreate()}>
            <IconPlus size={16} /> Nueva sesión
          </Button>
        </div>
      </div>

      {/* Body */}
      <Card noPadding className="p-4 sm:p-5">
        {!data ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-card bg-white/50" />
            ))}
          </div>
        ) : view === 'semana' ? (
          <WeekView sessions={sessions} cursor={cursor} onEdit={openEdit} onCreateOn={openCreate} />
        ) : view === 'mes' ? (
          <MonthView sessions={sessions} cursor={cursor} onEdit={openEdit} onCreateOn={openCreate} />
        ) : (
          <ListView
            sessions={visibleSessions}
            sessionsByPatient={sessionsByPatient}
            onEdit={openEdit}
            onSetEstado={handleSetEstado}
            onSetConvirtio={handleSetConvirtio}
            onSetPago={handleSetPago}
            onToggleFacturada={handleToggleFacturada}
            onDelete={fullAccess ? handleDelete : undefined}
          />
        )}
      </Card>

      <SesionDrawer
        open={drawer.open}
        mode={drawer.mode}
        initial={drawer.initial}
        defaultDate={drawer.defaultDate}
        patients={
          fullAccess
            ? (data?.patients || [])
            : (data?.patients || []).filter((p) => p.terapeuta_id === terapeutaId)
        }
        therapists={data?.therapists || []}
        sessions={data?.sessions || []}
        fullAccess={fullAccess}
        terapeutaId={terapeutaId}
        onClose={closeDrawer}
        onSubmit={handleSubmit}
        onCreatePatient={handleCreatePatient}
      />
    </div>
  )
}
