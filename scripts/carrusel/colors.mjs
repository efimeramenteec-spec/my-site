// scripts/carrusel/colors.mjs — carousel color pairs (#92c, Nicolás 27 Oct)
//
// Each post gets ONE pair: a flat background + one ink for ALL its text, used on
// every slide of that post. Colors come from the manual (p.13–20, BRAND.md);
// a "profundo" shade is the same manual hue made deep (`deep()`, HSL) so a post
// can be a deep color with light text, like an editorial feed.
// No gradients, no textures, no logos.
//
// Every pair must pass WCAG AA for body text (≥ 4.5:1) — the same ink is used
// for titles and body, so 4.5 covers the 3:1 large-title rule too. `checkPairs()`
// fails loudly otherwise. Consecutive posts never repeat a pair (`nextPair`).

export const MANUAL = {
  amarillo: '#FFD84A', // amarillo bruma, p.13
  naranja: '#FAAB55',  // naranja aura, p.14
  rosa: '#F5A8A0',     // rosa melón, p.15
  violeta: '#B48AE4',  // violeta neblina, p.16
  azul: '#A9D8FF',     // azul cielo, p.17
  lavanda: '#C3C4FF',  // lavanda humo, p.18
  menta: '#B7F5D8',    // verde menta, p.19
  durazno: '#FCD1B5',  // durazno pastel, p.20
}
export const CREMA = '#FEF8E9'
export const TINTA = '#000000'

// A manual color made deep: same hue, saturation capped at 80%, lightness set
// to L% (HSL). Mixing with black instead turns every warm hue brown; this keeps
// the color alive (durazno → terracota, azul cielo → editorial blue).
export function deep(hex, L) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l0 = (mx + mn) / 2
  const h = !d ? 0 : mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
  const s = Math.min(d ? d / (1 - Math.abs(2 * l0 - 1)) : 0, 0.8), l = L / 100
  const k = (m) => (m + ((h + 360) % 360) / 30) % 12, a = s * Math.min(l, 1 - l)
  const f = (m) => l - a * Math.max(-1, Math.min(k(m) - 3, Math.min(9 - k(m), 1)))
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100
}

// Rotation order: light and deep alternate so neighbouring posts look different.
export const PAIRS = [
  { id: 'crema-tinta', nombre: 'crema + negro', bg: CREMA, ink: TINTA },
  { id: 'terracota-crema', nombre: 'terracota (durazno pastel profundo) + crema', bg: deep(MANUAL.durazno, 36), ink: CREMA },
  { id: 'rosa-tinta', nombre: 'rosa melón + negro', bg: MANUAL.rosa, ink: TINTA },
  { id: 'azul-profundo-crema', nombre: 'azul cielo profundo + crema', bg: deep(MANUAL.azul, 36), ink: CREMA },
  { id: 'amarillo-tinta', nombre: 'amarillo bruma + negro', bg: MANUAL.amarillo, ink: TINTA },
  { id: 'violeta-profundo-amarillo', nombre: 'violeta neblina profundo + amarillo bruma', bg: deep(MANUAL.violeta, 32), ink: MANUAL.amarillo },
  { id: 'azul-tinta', nombre: 'azul cielo + negro', bg: MANUAL.azul, ink: TINTA },
  { id: 'ladrillo-crema', nombre: 'rosa melón profundo (ladrillo) + crema', bg: deep(MANUAL.rosa, 36), ink: CREMA },
  { id: 'lavanda-tinta', nombre: 'lavanda humo + negro', bg: MANUAL.lavanda, ink: TINTA },
  { id: 'naranja-profundo-crema', nombre: 'naranja aura profundo + crema', bg: deep(MANUAL.naranja, 28), ink: CREMA },
  { id: 'menta-tinta', nombre: 'verde menta + negro', bg: MANUAL.menta, ink: TINTA },
]

export const AA_BODY = 4.5

export function getPair(id) {
  const p = PAIRS.find((x) => x.id === id)
  if (!p) throw new Error(`par de color desconocido "${id}" (opciones: ${PAIRS.map((x) => x.id).join(', ')})`)
  return { ...p, contrast: contrast(p.bg, p.ink) }
}

// Throws if any pair is below AA for body text.
export function checkPairs() {
  const rows = PAIRS.map((p) => ({ ...p, contrast: contrast(p.bg, p.ink) }))
  const bad = rows.filter((r) => r.contrast < AA_BODY)
  if (bad.length) throw new Error(`pares bajo AA ${AA_BODY}:1 → ${bad.map((r) => `${r.id} ${r.contrast}`).join(', ')}`)
  return rows
}

// history = ids of past posts' pairs, oldest first. Next pair in rotation after
// the last one used; never the same as the previous post.
export function nextPair(history = []) {
  const last = history[history.length - 1]
  const i = PAIRS.findIndex((p) => p.id === last)
  return getPair(PAIRS[(i + 1) % PAIRS.length].id)
}

if (process.argv[1]?.endsWith('colors.mjs')) {
  for (const r of checkPairs()) console.log(`${r.contrast.toFixed(2).padStart(6)}:1  ${r.bg} / ${r.ink}  ${r.id}`)
}
