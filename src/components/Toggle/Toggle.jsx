import React from 'react'

export function Toggle({
  checked = false,
  onChange,
  label,
  disabled = false,
  id,
  ...props
}) {
  const toggleId = id || (label ? `toggle-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined)

  return (
    <div className="inline-flex items-center gap-3">
      <button
        id={toggleId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange?.(!checked)}
        className={[
          'relative inline-flex h-7 w-12 flex-shrink-0 rounded-pill',
          'transition-all duration-300 ease-out',
          'focus:outline-none focus-visible:ring-2',
          'focus-visible:ring-brand-lavender focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          checked
            ? 'bg-brand-gradient shadow-glow'
            : 'bg-gray-200',
        ].join(' ')}
        {...props}
      >
        <span
          className={[
            'absolute top-1 h-5 w-5 rounded-full bg-white shadow-soft',
            'transition-all duration-300 ease-out',
            checked ? 'left-6' : 'left-1',
          ].join(' ')}
          aria-hidden="true"
        />
      </button>
      {label && (
        <label
          htmlFor={toggleId}
          className="font-body text-sm text-content-primary cursor-pointer select-none"
        >
          {label}
        </label>
      )}
    </div>
  )
}
