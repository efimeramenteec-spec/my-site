import React from 'react'

const variantClasses = {
  yellow:   'bg-brand-yellow/20 text-amber-700',
  orange:   'bg-brand-orange/20 text-orange-700',
  pink:     'bg-brand-pink/20 text-rose-700',
  lavender: 'bg-brand-lavender/20 text-purple-700',
  neutral:  'bg-surface-warm text-content-secondary',
}

export function Badge({ variant = 'lavender', className = '', children, ...props }) {
  return (
    <span
      className={[
        'inline-flex items-center px-3 py-1',
        'rounded-pill',
        'font-caption text-xs font-bold',
        'select-none whitespace-nowrap',
        variantClasses[variant],
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </span>
  )
}
