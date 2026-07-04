import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Card } from '../components/Card/Card.jsx'
import { Button } from '../components/Button/Button.jsx'
import { Select } from '../components/Select/Select.jsx'
import { getSessionsData, createSession, updateSession, deleteSession, createPatient, notifySessionEstado } from '../lib/queries.js'
import { WeekView, MonthView, ListView } from '../features/sesiones/views.jsx'
import { SesionDrawer } from '../features/sesiones/SesionDrawer.jsx'
import { formatWeekRange, formatMonthYear, addDays, addMonths, fullName, formatTime } from '../lib/format.js'
import { CONFIRMACION } from '../lib/constants.js'
import { findConflict } from '../lib/conflicts.js'
import { IconChevronRight, IconPlus } from '../layout/icons.jsx'
import { useAuth } from '../lib/auth.jsx'

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
  const [filters, setFilters] = useState(() => ({ terapeuta: '', estado: '', pago: '', ...loadUi().filters }))

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

  const sessions = (data?.sessions || []).filter(
    (s) =>
      (fullAccess
        ? !filters.terapeuta || s.terapeuta_id === filters.terapeuta
        : s.terapeuta_id === terapeutaId) &&
      (!filters.estado || s.estado === filters.estado) &&
      (!filters.pago || (filters.pago === 'pagada' ? !!s.pagado : !s.pagado)),
  )

  const visibleSessions =
    view === 'lista' && search.trim()
      ? sessions.filter((s) => {
          const name = `${s.patient?.nombre || ''} ${s.patient?.apellido || ''}`.toLowerCase()
          return name.includes(search.trim().toLowerCase())
        })
      : sessions

  function shift(dir) {
    setCursor((c) => (view === 'mes' ? addMonths(c, dir) : addDays(c, dir * 7)))
  }

  const openCreate = (defaultDate = null) => setDrawer({ open: true, mode: 'create', initial: null, defaultDate })
  const openEdit = (session) => setDrawer({ open: true, mode: 'edit', initial: session, defaultDate: null })
  const closeDrawer = () => setDrawer((d) => ({ ...d, open: false }))

  async function handleSubmit(payload) {
    // Backstop: never allow a double-booking even if the drawer guard was bypassed.
    const conflict = findConflict(data?.sessions || [], payload, drawer.mode === 'edit' ? drawer.initial.id : null)
    if (conflict) {
      return { ok: false, error: `Choca con ${fullName(conflict.patient)} (${formatTime(conflict.hora_inicio)}–${formatTime(conflict.hora_fin)}).` }
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
      `¿Eliminar la sesión de ${fullName(s.patient)} (${when})?\n\n` +
        'Se borra definitivamente, junto con su evento de Google Calendar. ' +
        'Esta acción no se puede deshacer.',
    )
    if (!ok) return
    const res = await deleteSession(s.id)
    if (res.ok) await loadData()
    else window.alert(res.error || 'No se pudo eliminar la sesión.')
  }

  async function handleToggleFacturada(s, facturada) {
    if (facturada && (s.estado === 'cancelada' || s.estado === 'no_show')) {
      window.alert('Una sesión cancelada no se factura.')
      return
    }
    const res = await updateSession(s.id, { facturada })
    if (res.ok) await loadData()
    else window.alert(res.error || 'No se pudo actualizar la facturación.')
  }

  async function handleTogglePaid(s, paid) {
    if (paid && (s.estado === 'cancelada' || s.estado === 'no_show')) {
      window.alert('Una sesión cancelada no se cobra.')
      return
    }
    const res = await updateSession(s.id, { pagado: paid })
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
          <input
            type="text"
            placeholder="Buscar paciente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl border border-stroke bg-white/70 px-4 py-2 font-body text-sm text-content-primary placeholder:text-content-muted focus:border-brand-lavender focus:outline-none focus:ring-2 focus:ring-brand-lavender/20"
          />
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
            onEdit={openEdit}
            onSetEstado={handleSetEstado}
            onTogglePaid={handleTogglePaid}
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
