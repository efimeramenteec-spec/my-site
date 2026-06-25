import React from 'react'

export function Select({
  label,
  id,
  options = [],
  placeholder = 'Seleccionar…',
  className = '',
  error,
  hint,
  ...props
}) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="font-heading text-sm font-bold text-content-secondary"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={[
            'w-full appearance-none rounded-xl',
            'bg-white/70 backdrop-blur-sm',
            'border px-4 py-3 pr-10',
            'font-body text-content-primary',
            'shadow-soft',
            'transition-all duration-200 ease-out',
            'cursor-pointer',
            'focus:outline-none',
            error
              ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-200'
              : 'border-stroke focus:border-brand-lavender focus:ring-2 focus:ring-brand-lavender/20',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className,
          ].join(' ')}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Chevron */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
        >
          <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
            <path
              d="M1 1L6 7L11 1"
              stroke="#b48ae4"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      {error && (
        <p className="font-caption text-xs text-red-500">{error}</p>
      )}
      {hint && !error && (
        <p className="font-caption text-xs text-content-muted">{hint}</p>
      )}
    </div>
  )
}
