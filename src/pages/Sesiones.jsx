import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Card } from '../components/Card/Card.jsx'
import { Button } from '../components/Button/Button.jsx'
import { Select } from '../components/Select/Select.jsx'
import { getSessionsData, createSession, updateSession } from '../lib/queries.js'
import { WeekView, MonthView, ListView } from '../features/sesiones/views.jsx'
import { SesionDrawer } from '../features/sesiones/SesionDrawer.jsx'
import { formatWeekRange, formatMonthYear, addDays, addMonths, fullName } from '../lib/format.js'
import { CONFIRMACION } from '../lib/constants.js'
import { IconChevronRight, IconPlus } from '../layout/icons.jsx'

const VIEWS = [
  ['semana', 'Semana'],
  ['mes', 'Mes'],
  ['lista', 'Lista'],
]

export default function Sesiones() {
  const ctx = useOutletContext()
  const [data, setData] = useState(null)
  const [view, setView] = useState('semana')
  const [cursor, setCursor] = useState(new Date())
  const [filters, setFilters] = useState({ terapeuta: '', estado: '' })
  const [drawer, setDrawer] = useState({ open: false, mode: 'create', initial: null, defaultDate: null })

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
      (!filters.terapeuta || s.terapeuta_id === filters.terapeuta) &&
      (!filters.estado || s.estado === filters.estado),
  )

  function shift(dir) {
    setCursor((c) => (view === 'mes' ? addMonths(c, dir) : addDays(c, dir * 7)))
  }

  const openCreate = (defaultDate = null) => setDrawer({ open: true, mode: 'create', initial: null, defaultDate })
  const openEdit = (session) => setDrawer({ open: true, mode: 'edit', initial: session, defaultDate: null })
  const closeDrawer = () => setDrawer((d) => ({ ...d, open: false }))

  async function handleSubmit(payload) {
    const res = drawer.mode === 'edit' ? await updateSession(drawer.initial.id, payload) : await createSession(payload)
    if (res.ok) await loadData()
    return res
  }

  async function handleSetEstado(s, estado) {
    const res = await updateSession(s.id, { estado })
    if (res.ok) await loadData()
    else window.alert(res.error || 'No se pudo actualizar la confirmación.')
  }

  async function handleTogglePaid(s, paid) {
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

  return (
    <div className="space-y-5 pt-2">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-pill border border-white/70 bg-white/60 p-1">
            {VIEWS.map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
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

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <Select options={terapeutaOptions} value={filters.terapeuta} onChange={(e) => setFilters((f) => ({ ...f, terapeuta: e.target.value }))} placeholder="" />
          </div>
          <div className="w-40">
            <Select options={estadoOptions} value={filters.estado} onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))} placeholder="" />
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
          <ListView sessions={sessions} onEdit={openEdit} onSetEstado={handleSetEstado} onTogglePaid={handleTogglePaid} />
        )}
      </Card>

      <SesionDrawer
        open={drawer.open}
        mode={drawer.mode}
        initial={drawer.initial}
        defaultDate={drawer.defaultDate}
        patients={data?.patients || []}
        therapists={data?.therapists || []}
        onClose={closeDrawer}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
