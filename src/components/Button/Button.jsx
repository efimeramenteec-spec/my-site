import React from 'react'

const variantClasses = {
  primary:
    'bg-brand-gradient text-white shadow-soft hover:shadow-glow hover:scale-[1.02] active:scale-[0.99]',
  secondary:
    'bg-white/70 backdrop-blur-sm border border-stroke text-content-primary shadow-soft hover:shadow-card hover:scale-[1.02] active:scale-[0.99]',
  ghost:
    'bg-transparent text-brand-lavender hover:text-brand-pink active:text-brand-orange',
}

const sizeClasses = {
  sm: 'px-4 py-2 text-sm gap-1.5',
  md: 'px-6 py-3 text-base gap-2',
  lg: 'px-8 py-4 text-lg gap-2.5',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  children,
  ...props
}) {
  return (
    <button
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center rounded-pill',
        'font-heading font-bold',
        'transition-all duration-300 ease-out',
        'cursor-pointer select-none',
        'focus:outline-none focus-visible:ring-2',
        'focus-visible:ring-brand-lavender focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'disabled:hover:scale-100 disabled:hover:shadow-soft',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}
