// scripts/carrusel/colors.mjs: carousel color pairs (#92c, rule #92d by Nicolás 27 Oct)
//
// ONLY the brand manual's colors (p.13–20, BRAND.md), exactly as printed. The one
// allowed adjustment is transparency over cream (`tint`). Never darken, never
// create a color. Each post gets ONE pair: a flat background + one ink for all its
// text, on every slide. No gradients, textures or logos.
//
// Every pair must reach WCAG AA for body text (≥ 4.5:1); the same ink is used for
// titles and body, so this also covers the 3:1 large-title rule. `getPair()` refuses
// a pair whose background isn't a manual color (or a transparency of one) or whose
// ink isn't black / cream / a manual color. Consecutive posts never repeat (`nextPair`).

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
export const CREMA = '#FEF8E9' // the ground transparency sits on (BRAND.md)
export const TINTA = '#000000'
const INKS = new Set([TINTA, CREMA, ...Object.values(MANUAL)])

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const hex = (c) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase()

// A manual color at `alpha` (0–1) over cream. alpha 1 = the manual color itself.
// This is the ONLY adjustment allowed.
export function tint(base, alpha = 1) {
  if (!(base in MANUAL)) throw new Error(`"${base}" no es un color del manual`)
  if (!(alpha > 0 && alpha <= 1)) throw new Error(`transparencia inválida ${alpha}`)
  const [c, g] = [rgb(MANUAL[base]), rgb(CREMA)]
  return hex(c.map((v, i) => v * alpha + g[i] * (1 - alpha)))
}

function luminance(h) {
  const [r, g, b] = rgb(h).map((c) => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100
}

// base = a MANUAL key (alpha 1 unless a transparency is wanted), or 'crema' = the
// plain cream ground (#92, approved by Nicolás). Rotation order alternates warm/cool.
export const PAIRS = [
  { id: 'crema-tinta', nombre: 'crema + negro', base: 'crema', ink: TINTA },
  { id: 'azul-tinta', nombre: 'azul cielo + negro', base: 'azul', ink: TINTA },
  { id: 'rosa-tinta', nombre: 'rosa melón + negro', base: 'rosa', ink: TINTA },
  { id: 'menta-tinta', nombre: 'verde menta + negro', base: 'menta', ink: TINTA },
  { id: 'amarillo-tinta', nombre: 'amarillo bruma + negro', base: 'amarillo', ink: TINTA },
  { id: 'lavanda-tinta', nombre: 'lavanda humo + negro', base: 'lavanda', ink: TINTA },
  { id: 'naranja-tinta', nombre: 'naranja aura + negro', base: 'naranja', ink: TINTA },
  { id: 'violeta-tinta', nombre: 'violeta neblina + negro', base: 'violeta', ink: TINTA },
  { id: 'durazno-tinta', nombre: 'durazno pastel + negro', base: 'durazno', ink: TINTA },
]

export const AA_BODY = 4.5

// Resolves a pair and enforces the #92d rule + contrast. Throws otherwise.
export function getPair(id) {
  const p = PAIRS.find((x) => x.id === id)
  if (!p) throw new Error(`par de color desconocido "${id}" (opciones: ${PAIRS.map((x) => x.id).join(', ')})`)
  const bg = p.base === 'crema' ? CREMA : tint(p.base, p.alpha ?? 1)
  if (!INKS.has(p.ink)) throw new Error(`par ${id}: la tinta ${p.ink} no es negro, crema ni un color del manual`)
  const c = contrast(bg, p.ink)
  if (c < AA_BODY) throw new Error(`par ${id}: contraste ${c}:1 < ${AA_BODY}:1`)
  return { id: p.id, nombre: p.nombre, base: p.base, alpha: p.alpha ?? 1, bg, ink: p.ink, contrast: c }
}

export const checkPairs = () => PAIRS.map((p) => getPair(p.id))

// history = ids of past posts' pairs, oldest first. Returns the pair after the last
// one used; never the same as the previous post.
export function nextPair(history = []) {
  const i = PAIRS.findIndex((p) => p.id === history[history.length - 1])
  return getPair(PAIRS[(i + 1) % PAIRS.length].id)
}

if (process.argv[1]?.endsWith('colors.mjs')) {
  for (const r of checkPairs()) console.log(`${r.contrast.toFixed(2).padStart(6)}:1  ${r.bg} / ${r.ink}  ${r.id}`)
}
