import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button/Button.jsx'
import { Badge } from '../components/Badge/Badge.jsx'
import { Logo } from './Logo.jsx'
import { IconPlus } from './icons.jsx'
import { formatDateLong, capitalize } from '../lib/format.js'

/** Sticky page header: title, date, data-mode chip, primary CTA. */
export function TopNav({ title, source }) {
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-20 bg-surface-warm/70 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-6 lg:px-10 pt-6 pb-4">
        <div className="min-w-0">
          {/* Compact logo on mobile where the sidebar is hidden */}
          <div className="lg:hidden mb-2">
            <Logo variant="corto" className="text-base [&>span]:text-base" />
          </div>
          <h1 className="font-serif text-2xl lg:text-3xl font-bold text-content-primary truncate">
            {title}
          </h1>
          <p className="font-caption text-sm text-content-muted">
            {capitalize(formatDateLong(new Date()))}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {source === 'demo' && (
            <Badge variant="orange" className="hidden sm:inline-flex">
              Datos de ejemplo
            </Badge>
          )}
          {source === 'live' && (
            <Badge variant="lavender" className="hidden sm:inline-flex">
              En vivo
            </Badge>
          )}
          <Button size="sm" onClick={() => navigate('/sesiones')}>
            <IconPlus size={16} />
            <span className="hidden sm:inline">Nueva sesión</span>
            <span className="sm:hidden">Nueva</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
