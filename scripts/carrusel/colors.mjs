// scripts/carrusel/colors.mjs: carousel colors (#92c, #92d, rule #92e by Nicolás 27 Oct)
//
// ONLY two schemes, alternating post by post:
//   A) amarillo-violeta: yellow background + violet text
//   B) violeta-amarillo: violet background + yellow text
// Both colors come from the brand manual (BRAND.md p.13/p.16), matched to the ones
// Nicolás already uses in his feed (yellow ≈ #FDE689, violet ≈ #B586E4, sampled
// from his posts). Never darken or create a color; the one allowed adjustment is
// transparency over cream (`tint`):
//   violet = violeta neblina #B48AE4 exactly as printed (feed is ~4 RGB units away)
//   yellow = amarillo bruma #FFD84A at 60% over cream #FEF8E9 = #FFE58A. The printed
//            #FFD84A is much more saturated than the feed (~65 units away); the 60%
//            transparency lands ~2 units from the feed's #FDE689.
// No black text anywhere. The contrast between the two is low (~2.3:1), so
// readability comes from size and weight (render.mjs: bold/medium sans, body
// ≥ 40 px), not color. The contrast is logged, never blocking (#92e).

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

// The two brand colors of the carousel, as { base: MANUAL key, alpha }.
export const COLORES = {
  amarillo: { base: 'amarillo', alpha: 0.6, nombre: 'amarillo bruma al 60% sobre crema' },
  violeta: { base: 'violeta', alpha: 1, nombre: 'violeta neblina' },
}

// The only two schemes. Order = alternation order.
export const PAIRS = [
  { id: 'amarillo-violeta', nombre: 'violeta sobre amarillo', bg: 'amarillo', ink: 'violeta' },
  { id: 'violeta-amarillo', nombre: 'amarillo sobre violeta', bg: 'violeta', ink: 'amarillo' },
]

const resolve = (k) => {
  const c = COLORES[k]
  if (!c) throw new Error(`color "${k}" fuera de la regla #92e (solo amarillo / violeta)`)
  return tint(c.base, c.alpha)
}

// Resolves a scheme. Throws for anything that isn't one of the two.
export function getPair(id) {
  const p = PAIRS.find((x) => x.id === id)
  if (!p) throw new Error(`esquema de color desconocido "${id}" (opciones: ${PAIRS.map((x) => x.id).join(', ')})`)
  const bg = resolve(p.bg)
  const ink = resolve(p.ink)
  return { id: p.id, nombre: p.nombre, bg, ink, contrast: contrast(bg, ink) }
}

export const checkPairs = () => PAIRS.map((p) => getPair(p.id))

// history = ids of past posts' schemes, oldest first. Alternates A/B; never the
// same as the previous post. Empty history starts with A.
export function nextPair(history = []) {
  const i = PAIRS.findIndex((p) => p.id === history[history.length - 1])
  return getPair(PAIRS[(i + 1) % PAIRS.length].id)
}

if (process.argv[1]?.endsWith('colors.mjs')) {
  for (const r of checkPairs()) console.log(`${r.contrast.toFixed(2).padStart(6)}:1  ${r.bg} / ${r.ink}  ${r.id}`)
}
