import React, { useState } from 'react'

/**
 * Brand logo. Attempts the real PNG (drop the files into public/logos/)
 * and gracefully falls back to an on-brand text wordmark when absent —
 * so the UI looks finished today and auto-upgrades the moment assets land.
 */
export function Logo({ variant = 'corto', className = '' }) {
  const [imgFailed, setImgFailed] = useState(false)

  const src =
    variant === 'largo'
      ? '/logos/LOGOTIPOLARGO (1).png'
      : '/logos/LOGOTIPOCORTO (1).png'

  if (!imgFailed) {
    return (
      <img
        src={encodeURI(src)}
        alt="Efimeramente"
        onError={() => setImgFailed(true)}
        className={['select-none', className].join(' ')}
        draggable="false"
      />
    )
  }

  // Wordmark fallback
  if (variant === 'largo') {
    return (
      <span className={['font-display font-bold text-content-primary leading-none', className].join(' ')}>
        efimeramente<span className="text-brand-lavender">✦</span>
      </span>
    )
  }

  return (
    <span className={['inline-block font-display font-bold text-content-primary leading-[0.88]', className].join(' ')}>
      <span className="block text-2xl">
        efimera<span className="text-brand-lavender">✦</span>
      </span>
      <span className="block text-2xl tracking-[0.42em]">mente</span>
    </span>
  )
}
