import React from 'react'

/**
 * Glassmorphism card — the core surface in the Efimeramente DS.
 *
 * Props:
 *   withOrbs   — float soft gradient orbs behind the card content (default false)
 *   noPadding  — strip default padding for when the caller needs full control
 *   className  — extra Tailwind classes merged last
 */
export function Card({
  children,
  className = '',
  withOrbs = false,
  noPadding = false,
  ...props
}) {
  return (
    <div
      className={[
        'relative rounded-card overflow-hidden',
        'bg-white/70 backdrop-blur-[12px]',
        'border border-white/80',
        'shadow-card',
        !noPadding && 'p-6',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {withOrbs && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-blob bg-gradient-to-br from-brand-lavender/25 to-brand-pink/15 blur-2xl animate-float" />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-blob bg-gradient-to-br from-brand-yellow/20 to-brand-orange/15 blur-2xl animate-float-slow" />
        </div>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  )
}
