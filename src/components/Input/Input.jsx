import React from 'react'

export function Input({
  label,
  id,
  className = '',
  error,
  hint,
  ...props
}) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="font-heading text-sm font-bold text-content-secondary"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={[
          'w-full rounded-xl bg-white',
          'border px-4 py-3',
          'font-body text-content-primary',
          'placeholder:text-content-muted',
          'transition-all duration-200 ease-out',
          'focus:outline-none',
          error
            ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-200'
            : 'border-stroke focus:border-brand-lavender focus:ring-2 focus:ring-brand-lavender/20',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-warm',
          className,
        ].join(' ')}
        {...props}
      />
      {error && (
        <p className="font-caption text-xs text-red-500">{error}</p>
      )}
      {hint && !error && (
        <p className="font-caption text-xs text-content-muted">{hint}</p>
      )}
    </div>
  )
}
