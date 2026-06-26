import React, { useEffect, useRef, useState } from 'react'
import { fullName, initials } from '../../lib/format.js'

/** Searchable patient combobox styled to match the DS glass inputs. */
export function PatientSelect({ patients = [], value, onChange, error }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  const selected = patients.find((p) => p.id === value)

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = query
    ? patients.filter((p) => fullName(p).toLowerCase().includes(query.toLowerCase()))
    : patients

  return (
    <div className="flex flex-col gap-1.5" ref={ref}>
      <label className="font-heading text-sm font-bold text-content-secondary">Paciente</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={[
            'flex w-full items-center justify-between rounded-xl bg-white/70 backdrop-blur-sm',
            'border px-4 py-3 text-left font-body shadow-soft transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-brand-lavender/20',
            error ? 'border-red-300' : 'border-stroke focus:border-brand-lavender',
          ].join(' ')}
        >
          {selected ? (
            <span className="flex items-center gap-2.5 text-content-primary">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-lavender/15 font-caption text-[10px] font-bold text-purple-600">
                {initials(selected)}
              </span>
              {fullName(selected)}
            </span>
          ) : (
            <span className="text-content-muted">Seleccionar paciente…</span>
          )}
          <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true">
            <path d="M1 1L6 7L11 1" stroke="#b48ae4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/80 bg-white/95 shadow-card backdrop-blur-md">
            <div className="p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar paciente…"
                className="w-full rounded-xl border border-stroke bg-white px-3 py-2 font-body text-sm text-content-primary placeholder:text-content-muted focus:border-brand-lavender focus:outline-none focus:ring-2 focus:ring-brand-lavender/20"
              />
            </div>
            <ul className="max-h-56 overflow-auto py-1">
              {filtered.length === 0 && (
                <li className="px-4 py-3 font-caption text-sm text-content-muted">Sin resultados</li>
              )}
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(p.id)
                      setOpen(false)
                      setQuery('')
                    }}
                    className={[
                      'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-brand-lavender/10',
                      p.id === value ? 'bg-brand-lavender/10' : '',
                    ].join(' ')}
                  >
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-gradient font-caption text-[10px] font-bold text-white">
                      {initials(p)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-body text-sm text-content-primary">{fullName(p)}</span>
                      {p.telefono && (
                        <span className="block truncate font-caption text-xs text-content-muted">{p.telefono}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {error && <p className="font-caption text-xs text-red-500">{error}</p>}
    </div>
  )
}
