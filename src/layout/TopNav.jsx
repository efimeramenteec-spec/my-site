import React from 'react'
import { Badge } from '../components/Badge/Badge.jsx'
import { Logo } from './Logo.jsx'
import { formatDateLong, capitalize } from '../lib/format.js'

/** Sticky page header: title, date, data-mode chip. */
export function TopNav({ title, source }) {
  return (
    <>
      {/* Mobile logo: deliberately NOT part of the sticky header — it scrolls
          away so it doesn't stay anchored and eat half the screen on phones.
          Desktop shows the logo in the sidebar instead (this is lg:hidden). */}
      <div className="lg:hidden px-6 pt-6">
        <Logo variant="corto" className="text-base [&>span]:text-base" />
      </div>

      <header className="sticky top-0 z-20 bg-surface-warm/70 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-6 lg:px-10 pt-2 lg:pt-6 pb-4">
        <div className="min-w-0">
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
        </div>
      </div>
      </header>
    </>
  )
}
