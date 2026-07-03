import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'

import { Card } from '../components/Card/Card.jsx'
import { Button } from '../components/Button/Button.jsx'
import { Badge } from '../components/Badge/Badge.jsx'
import { Toggle } from '../components/Toggle/Toggle.jsx'

import { getTherapistsBooking, updateTherapistBooking } from '../lib/queries.js'
import { fullName } from '../lib/format.js'
import { useAuth } from '../lib/auth.jsx'
import { IconPlus, IconX } from '../layout/icons.jsx'
import { getPushStatus, subscribeToPush, unsubscribeFromPush, isIOS } from '../lib/push.js'

// Availability editor for the public /agendar booking page: per-therapist enable
// toggle + weekly bookable hours (therapists.booking_availability, keys mon..sun,
// each day = array of [start, end] HH:MM ranges in hora de Ecuador).
// Owner sees and edits every therapist; a therapist sees only her own card
// (RLS: therapists_self_update — see supabase/therapist-availability.sql).

const DAYS = [
  ['mon', 'Lunes'],
  ['tue', 'Martes'],
  ['wed', 'Miércoles'],
  ['thu', 'Jueves'],
  ['fri', 'Viernes'],
  ['sat', 'Sábado'],
  ['sun', 'Domingo'],
]

const timeInput =
  'rounded-xl border border-stroke bg-white px-3 py-1.5 font-body text-sm text-content-primary ' +
  'focus:outline-none focus:border-brand-lavender focus:ring-2 focus:ring-brand-lavender/20'

const normalizeAvailability = (raw) => {
  const av = raw && typeof raw === 'object' ? raw : {}
  return Object.fromEntries(DAYS.map(([key]) => [key, Array.isArray(av[key]) ? av[key].map((r) => [...r]) : []]))
}

function CopyLink({ url, label = 'Copiar enlace' }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copia el enlace:', url)
    }
  }
  return (
    <Button variant="secondary" size="sm" onClick={copy}>
      {copied ? '¡Copiado!' : label}
    </Button>
  )
}

// Web Push opt-in for the logged-in therapist (one card per DEVICE — each
// phone/browser subscribes separately). Notifies on: paciente confirma,
// paciente cancela (Twilio quick replies) y nueva llamada agendada (/agendar).
function NotificationsCard({ terapeutaId }) {
  const [status, setStatus] = useState('loading') // loading|unsupported|denied|subscribed|idle
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    getPushStatus().then((s) => { if (alive) setStatus(s) })
    return () => { alive = false }
  }, [])

  const activate = async () => {
    setBusy(true)
    setError('')
    const res = await subscribeToPush(terapeutaId)
    setBusy(false)
    if (res.ok) setStatus('subscribed')
    else {
      setError(res.error)
      setStatus(await getPushStatus())
    }
  }

  const deactivate = async () => {
    setBusy(true)
    setError('')
    const res = await unsubscribeFromPush()
    setBusy(false)
    if (res.ok) setStatus('idle')
    else setError(res.error)
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-lg font-bold text-content-primary">Notificaciones en este dispositivo</h3>
          <p className="mt-1 font-body text-sm text-content-secondary">
            Recibe una notificación cuando un paciente confirme o cancele una sesión por WhatsApp,
            o cuando alguien agende una llamada contigo. Actívalas en cada teléfono o computadora
            donde quieras recibirlas.
          </p>
        </div>
        {status === 'subscribed' && <Badge variant="lavender">Activadas</Badge>}
      </div>

      <div className="mt-4">
        {status === 'loading' && (
          <p className="font-caption text-xs text-content-muted">Comprobando…</p>
        )}
        {status === 'unsupported' && (
          <p className="font-body text-sm text-content-secondary">
            {isIOS
              ? 'En iPhone: abre esta página en Safari, toca Compartir → “Agregar a pantalla de inicio” y vuelve a entrar desde el ícono de Efimeramente. Necesitas iOS 16.4 o más reciente.'
              : 'Este navegador no soporta notificaciones push.'}
          </p>
        )}
        {status === 'denied' && (
          <p className="font-body text-sm text-content-secondary">
            Las notificaciones están bloqueadas para esta app. Actívalas en los ajustes de
            notificaciones de tu teléfono o navegador y recarga la página.
          </p>
        )}
        {status === 'idle' && (
          <Button size="sm" onClick={activate} disabled={busy}>
            {busy ? 'Activando…' : 'Activar notificaciones'}
          </Button>
        )}
        {status === 'subscribed' && (
          <Button variant="secondary" size="sm" onClick={deactivate} disabled={busy}>
            {busy ? 'Desactivando…' : 'Desactivar en este dispositivo'}
          </Button>
        )}
      </div>

      {error && <p className="mt-3 font-caption text-xs text-red-500">{error}</p>}
    </Card>
  )
}

function TherapistCard({ therapist, onSaved }) {
  const [enabled, setEnabled] = useState(Boolean(therapist.booking_enabled))
  const [avail, setAvail] = useState(() => normalizeAvailability(therapist.booking_availability))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const bookingUrl = `${window.location.origin}/agendar?terapeuta=${therapist.id}`

  const toggleEnabled = async (next) => {
    setEnabled(next) // optimistic; revert on failure
    setError('')
    const res = await updateTherapistBooking(therapist.id, { booking_enabled: next })
    if (!res.ok) {
      setEnabled(!next)
      setError(res.error)
    } else {
      onSaved(res.data)
    }
  }

  const setRange = (day, idx, pos, value) => {
    setAvail((a) => {
      const ranges = a[day].map((r, i) => (i === idx ? (pos === 0 ? [value, r[1]] : [r[0], value]) : r))
      return { ...a, [day]: ranges }
    })
    setDirty(true)
  }
  const addRange = (day) => {
    setAvail((a) => ({ ...a, [day]: [...a[day], ['09:00', '13:00']] }))
    setDirty(true)
  }
  const removeRange = (day, idx) => {
    setAvail((a) => ({ ...a, [day]: a[day].filter((_, i) => i !== idx) }))
    setDirty(true)
  }

  const saveHours = async () => {
    for (const [key, label] of DAYS) {
      for (const [start, end] of avail[key]) {
        if (!start || !end || start >= end) {
          setError(`Revisa los horarios de ${label}: cada rango necesita inicio y fin, con fin posterior al inicio.`)
          return
        }
      }
    }
    setError('')
    setSaving(true)
    // Persist only days that have ranges — keeps the jsonb compact.
    const compact = Object.fromEntries(Object.entries(avail).filter(([, ranges]) => ranges.length > 0))
    const res = await updateTherapistBooking(therapist.id, { booking_availability: compact })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setDirty(false)
    onSaved(res.data)
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: therapist.color || '#9ca3af' }}
        />
        <h3 className="font-heading text-lg font-bold text-content-primary">{fullName(therapist)}</h3>
        {!therapist.activo && <Badge variant="neutral">Inactiva</Badge>}
        <div className="ml-auto flex items-center gap-3">
          <CopyLink url={bookingUrl} label="Copiar su enlace" />
          <Toggle checked={enabled} onChange={toggleEnabled} label={enabled ? 'Visible' : 'Oculta'} />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        {DAYS.map(([key, label]) => (
          <div key={key} className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="w-24 flex-shrink-0 font-heading text-sm font-bold text-content-secondary">
              {label}
            </span>
            {avail[key].length === 0 && (
              <span className="font-caption text-xs text-content-muted">Sin horario</span>
            )}
            {avail[key].map(([start, end], idx) => (
              <span key={idx} className="inline-flex items-center gap-1.5">
                <input
                  type="time"
                  step="1800"
                  value={start}
                  onChange={(e) => setRange(key, idx, 0, e.target.value)}
                  className={timeInput}
                  aria-label={`${label} — inicio`}
                />
                <span className="text-content-muted">–</span>
                <input
                  type="time"
                  step="1800"
                  value={end}
                  onChange={(e) => setRange(key, idx, 1, e.target.value)}
                  className={timeInput}
                  aria-label={`${label} — fin`}
                />
                <button
                  type="button"
                  onClick={() => removeRange(key, idx)}
                  className="rounded-full p-1 text-content-muted transition-colors hover:bg-brand-pink/20 hover:text-rose-600"
                  aria-label={`Quitar rango de ${label}`}
                >
                  <IconX size={14} />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => addRange(key)}
              className="inline-flex items-center gap-1 rounded-pill px-2 py-1 font-caption text-xs font-bold text-brand-lavender transition-colors hover:bg-brand-lavender/10"
            >
              <IconPlus size={12} /> Agregar
            </button>
          </div>
        ))}
      </div>

      {error && <p className="mt-4 font-caption text-xs text-red-500">{error}</p>}

      {dirty && (
        <div className="mt-5 flex justify-end">
          <Button size="sm" onClick={saveHours} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar horarios'}
          </Button>
        </div>
      )}
    </Card>
  )
}

export default function Disponibilidad() {
  const { setDataSource } = useOutletContext()
  const { fullAccess, terapeutaId } = useAuth()
  const [therapists, setTherapists] = useState(null)

  useEffect(() => {
    let alive = true
    getTherapistsBooking().then((res) => {
      if (!alive) return
      setDataSource(res.source)
      setTherapists(res.therapists)
    })
    return () => { alive = false }
  }, [setDataSource])

  const onSaved = (updated) =>
    setTherapists((list) => list.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)))

  // Therapists manage only their own availability; the owner manages everyone's.
  const visible = therapists === null
    ? null
    : fullAccess ? therapists : therapists.filter((t) => t.id === terapeutaId)

  const publicUrl = `${window.location.origin}/agendar`

  return (
    <div className="flex flex-col gap-6">
      <Card withOrbs>
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-bold text-content-primary">Página pública de llamadas</h2>
            <p className="mt-1 font-body text-sm text-content-secondary">
              Las personas interesadas agendan una llamada gratuita de 10 minutos en{' '}
              <a href={publicUrl} target="_blank" rel="noreferrer" className="font-bold text-brand-lavender hover:text-brand-pink">
                {publicUrl}
              </a>
              . Solo aparecen las terapeutas visibles, con sus horarios libres (Google Calendar + sesiones).
              Horarios en hora de Ecuador.
            </p>
          </div>
          <CopyLink url={publicUrl} />
        </div>
      </Card>

      {terapeutaId && <NotificationsCard terapeutaId={terapeutaId} />}

      {visible === null ? (
        <Card>
          <p className="font-body text-sm text-content-muted">Cargando terapeutas…</p>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <p className="font-body text-sm text-content-muted">
            Tu perfil no está vinculado a una terapeuta. Pídele a Nicolas que lo revise.
          </p>
        </Card>
      ) : (
        visible.map((t) => <TherapistCard key={t.id} therapist={t} onSaved={onSaved} />)
      )}
    </div>
  )
}
