import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Card } from '../components/Card/Card.jsx'
import { Button } from '../components/Button/Button.jsx'
import { Input } from '../components/Input/Input.jsx'
import { Logo } from '../layout/Logo.jsx'

// Public, unauthenticated booking page (/agendar) — the Calendly replacement.
// Prospective patients pick a therapist, a free 10-min slot, and register via
// the intake form. ALL data comes from the public-booking Netlify function
// (service key, server-side validation); this page never touches Supabase.
// Deep link: /agendar?terapeuta=<id> preselects a therapist.

const FN = '/.netlify/functions/public-booking'
const HORIZON_DAYS = 14 // keep in sync with public-booking.mjs

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' })
const dayLabelFmt = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil', weekday: 'short', day: 'numeric', month: 'short',
})
const longDateFmt = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil', weekday: 'long', day: 'numeric', month: 'long',
})

const initials = (t) => `${(t.nombre || '')[0] || ''}${(t.apellido || '')[0] || ''}`.toUpperCase()
const fullName = (t) => `${t.nombre} ${t.apellido}`.trim()

function bookableDays() {
  const now = Date.now()
  return Array.from({ length: HORIZON_DAYS }, (_, i) => {
    const d = new Date(now + i * 86400e3)
    return { key: dayKeyFmt.format(d), label: dayLabelFmt.format(d) }
  })
}

function StepHeading({ children }) {
  return <h2 className="font-heading text-lg font-bold text-content-primary">{children}</h2>
}

function BackLink({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start font-caption text-sm font-bold text-brand-lavender transition-colors hover:text-brand-pink"
    >
      ← {children}
    </button>
  )
}

export default function PublicBooking() {
  const [searchParams] = useSearchParams()
  const preselectedId = searchParams.get('terapeuta')

  // 'therapist' → 'slot' → 'form' → 'done'
  const [step, setStep] = useState('therapist')
  const [therapists, setTherapists] = useState(null) // null = loading
  const [loadFailed, setLoadFailed] = useState(false)
  const [therapist, setTherapist] = useState(null)
  const [date, setDate] = useState(null)
  const [slots, setSlots] = useState(null) // null = loading
  const [slot, setSlot] = useState(null)
  const [form, setForm] = useState({ nombre: '', apellido: '', telefono: '+593', email: '', motivo: '', website: '' })
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState(null)

  const days = useMemo(bookableDays, [])

  useEffect(() => {
    let alive = true
    fetch(`${FN}?action=therapists`)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return
        const list = data.therapists || []
        setTherapists(list)
        const pre = preselectedId && list.find((t) => t.id === preselectedId)
        if (pre) {
          setTherapist(pre)
          setStep('slot')
        }
      })
      .catch(() => alive && setLoadFailed(true))
    return () => { alive = false }
  }, [preselectedId])

  const fetchSlots = (t, d) => {
    setSlots(null)
    setSlot(null)
    fetch(`${FN}?action=slots&therapist=${encodeURIComponent(t.id)}&date=${d}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots || []))
      .catch(() => setSlots([]))
  }

  const pickTherapist = (t) => {
    setTherapist(t)
    setDate(null)
    setSlots(null)
    setSlot(null)
    setStep('slot')
  }
  const pickDate = (d) => {
    setDate(d)
    fetchSlots(therapist, d)
  }
  const pickSlot = (s) => {
    setSlot(s)
    setNotice('')
    setStep('form')
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!form.nombre.trim()) errs.nombre = 'Ingresa tu nombre'
    if (!form.apellido.trim()) errs.apellido = 'Ingresa tu apellido'
    if (!/^\+?[\d\s\-()]{8,17}$/.test(form.telefono.trim())) errs.telefono = 'Ingresa un teléfono válido'
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Correo inválido'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSubmitting(true)
    setNotice('')
    try {
      const res = await fetch(`${FN}?action=book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          therapist_id: therapist.id,
          date,
          start_time: slot,
          website: form.website, // honeypot — humans leave it empty
          patient: {
            nombre: form.nombre.trim(),
            apellido: form.apellido.trim(),
            telefono: form.telefono.trim(),
            email: form.email.trim(),
            motivo: form.motivo.trim(),
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setConfirmation(data)
        setStep('done')
      } else if (res.status === 409) {
        setNotice('Ese horario acaba de ocuparse. Elige otro, por favor.')
        setStep('slot')
        fetchSlots(therapist, date)
      } else if (res.status === 429) {
        setNotice('Has hecho demasiados intentos. Inténtalo de nuevo más tarde.')
      } else {
        setNotice('No pudimos agendar tu llamada. Inténtalo de nuevo en unos minutos.')
      }
    } catch {
      setNotice('No pudimos agendar tu llamada. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-warm font-body text-content-primary">
      {/* Ambient gradient orbs — same treatment as the internal shell */}
      <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 right-[10%] w-[520px] h-[520px] rounded-blob bg-gradient-to-br from-brand-lavender/20 to-brand-pink/10 blur-3xl animate-float" />
        <div className="absolute bottom-[5%] left-[5%] w-[440px] h-[440px] rounded-blob bg-gradient-to-br from-brand-yellow/18 to-brand-orange/12 blur-3xl animate-float-slow" />
      </div>

      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo variant="largo" className="max-h-14" />
          <div>
            <h1 className="font-display text-3xl font-bold text-content-primary">Agenda tu llamada</h1>
            <p className="mt-1 font-body text-sm text-content-secondary">
              Una llamada gratuita de 10 minutos para conocernos y resolver tus dudas.
            </p>
          </div>
        </div>

        {notice && (
          <div className="rounded-card border border-brand-orange/40 bg-brand-orange/10 px-4 py-3 font-caption text-sm text-orange-700">
            {notice}
          </div>
        )}

        {/* Step 1 — therapist */}
        {step === 'therapist' && (
          <Card className="flex flex-col gap-4">
            <StepHeading>¿Con quién te gustaría hablar?</StepHeading>
            {loadFailed && (
              <p className="font-body text-sm text-content-muted">
                No pudimos cargar el equipo. Recarga la página para intentar de nuevo.
              </p>
            )}
            {!loadFailed && therapists === null && (
              <p className="font-body text-sm text-content-muted">Cargando…</p>
            )}
            {therapists !== null && therapists.length === 0 && (
              <p className="font-body text-sm text-content-muted">
                Por ahora no hay horarios disponibles. Vuelve a intentarlo pronto.
              </p>
            )}
            <div className="flex flex-col gap-3">
              {(therapists || []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTherapist(t)}
                  className="flex items-center gap-4 rounded-card border border-stroke bg-white/80 px-4 py-3 text-left shadow-soft transition-all duration-300 ease-out hover:scale-[1.01] hover:shadow-card"
                >
                  <span
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full font-heading text-sm font-bold text-white"
                    style={{ backgroundColor: t.color || '#b48ae4' }}
                  >
                    {initials(t)}
                  </span>
                  <span className="font-heading font-bold text-content-primary">{fullName(t)}</span>
                  <span className="ml-auto text-brand-lavender">→</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Step 2 — date + time */}
        {step === 'slot' && therapist && (
          <Card className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              {(therapists?.length ?? 0) > 1 && (
                <BackLink onClick={() => { setStep('therapist'); setNotice('') }}>Cambiar terapeuta</BackLink>
              )}
              <StepHeading>Elige un día y una hora con {fullName(therapist)}</StepHeading>
              <p className="font-caption text-xs text-content-muted">Todos los horarios están en hora de Ecuador.</p>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {days.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => pickDate(d.key)}
                  className={[
                    'flex-shrink-0 rounded-pill px-4 py-2 font-caption text-sm font-bold capitalize transition-all duration-200',
                    date === d.key
                      ? 'bg-brand-gradient text-white shadow-soft'
                      : 'border border-stroke bg-white/80 text-content-secondary hover:text-content-primary',
                  ].join(' ')}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {date === null && (
              <p className="font-body text-sm text-content-muted">Selecciona un día para ver los horarios.</p>
            )}
            {date !== null && slots === null && (
              <p className="font-body text-sm text-content-muted">Buscando horarios…</p>
            )}
            {date !== null && slots !== null && slots.length === 0 && (
              <p className="font-body text-sm text-content-muted">
                No hay horarios disponibles ese día. Prueba con otra fecha.
              </p>
            )}
            {date !== null && slots !== null && slots.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => pickSlot(s)}
                    className="rounded-pill border border-brand-lavender/40 bg-white/80 py-2 font-heading text-sm font-bold text-brand-lavender transition-all duration-200 hover:bg-brand-lavender hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Step 3 — intake form */}
        {step === 'form' && therapist && (
          <Card className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <BackLink onClick={() => { setStep('slot'); setNotice('') }}>Cambiar horario</BackLink>
              <StepHeading>Tus datos</StepHeading>
              <p className="font-body text-sm text-content-secondary">
                Llamada con <span className="font-bold">{fullName(therapist)}</span> el{' '}
                <span className="font-bold capitalize">{longDateFmt.format(new Date(`${date}T12:00:00-05:00`))}</span> a las{' '}
                <span className="font-bold">{slot}</span> (hora de Ecuador).
              </p>
            </div>

            <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Nombre" value={form.nombre} error={errors.nombre}
                  onChange={(e) => set('nombre', e.target.value)} autoComplete="given-name" />
                <Input label="Apellido" value={form.apellido} error={errors.apellido}
                  onChange={(e) => set('apellido', e.target.value)} autoComplete="family-name" />
              </div>
              <Input label="Teléfono (WhatsApp)" type="tel" value={form.telefono} error={errors.telefono}
                onChange={(e) => set('telefono', e.target.value)} autoComplete="tel" hint="Con código de país, ej. +593 99 123 4567" />
              <Input label="Email (opcional)" type="email" value={form.email} error={errors.email}
                onChange={(e) => set('email', e.target.value)} autoComplete="email" />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="motivo" className="font-heading text-sm font-bold text-content-secondary">
                  ¿De qué te gustaría hablar? (opcional)
                </label>
                <textarea
                  id="motivo"
                  rows={3}
                  maxLength={500}
                  value={form.motivo}
                  onChange={(e) => set('motivo', e.target.value)}
                  className="w-full rounded-xl border border-stroke bg-white px-4 py-3 font-body text-content-primary placeholder:text-content-muted transition-all duration-200 ease-out focus:border-brand-lavender focus:outline-none focus:ring-2 focus:ring-brand-lavender/20"
                />
              </div>

              {/* Honeypot — hidden from humans, filled by bots */}
              <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input
                  id="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={(e) => set('website', e.target.value)}
                />
              </div>

              <Button type="submit" disabled={submitting} className="mt-1">
                {submitting ? 'Agendando…' : 'Confirmar llamada'}
              </Button>
            </form>
          </Card>
        )}

        {/* Step 4 — confirmation */}
        {step === 'done' && confirmation && (
          <Card withOrbs className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient font-heading text-2xl text-white shadow-glow">
              ✓
            </span>
            <h2 className="font-display text-2xl font-bold text-content-primary">¡Listo!</h2>
            <p className="max-w-sm font-body text-content-secondary">
              Tu llamada con <span className="font-bold">{confirmation.therapist_name}</span> quedó agendada para el{' '}
              <span className="font-bold capitalize">
                {longDateFmt.format(new Date(`${confirmation.date}T12:00:00-05:00`))}
              </span>{' '}
              a las <span className="font-bold">{confirmation.start_time}</span> (hora de Ecuador).
            </p>
            <p className="font-caption text-xs text-content-muted">Nos pondremos en contacto contigo a esa hora.</p>
          </Card>
        )}

        <p className="text-center font-caption text-xs text-content-muted">
          Efimeramente ✦ psicología
        </p>
      </main>
    </div>
  )
}
