// scripts/carrusel/colors.mjs: carousel colors (#92c to #92e; FINAL rule #92f, Nicolás 27 Oct)
//
// Violet (violeta neblina #B48AE4, manual p.16) is ALWAYS one of the two colors.
// The only 8 combos, one per post, rotating in this order (nextPair):
//   1 violet text on cream #FEF8E9      2 cream text on violet
//   3 violet text on yellow #FFD84A     4 yellow text on violet
//   5 violet text on menta #B7F5D8      6 menta text on violet
//   7 violet text on durazno #FCD1B5    8 violet text on azul cielo #A9D8FF
// Every color is the manual's exact hex (cream = BRAND.md ground). Never black text,
// never darken or invent a color; the ONLY adjustment allowed is transparency over
// cream (`tint`), and no combo uses it today. Contrast is low (about 1.8 to 2.6:1)
// by design: readability comes from size and weight (render.mjs: bold/medium sans,
// body >= 40 px). The contrast is logged in render.json, never blocking.

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
export const CREMA = '#FEF8E9' // the brand ground (BRAND.md); transparency sits on it

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const hex = (c) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase()

// A manual color at `alpha` (0 to 1) over cream. alpha 1 = the manual color itself.
// This is the ONLY adjustment allowed.
export function tint(base, alpha = 1) {
  if (base === 'crema') return CREMA
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

// The carousel's colors, as { base: MANUAL key | 'crema', alpha }.
export const COLORES = {
  violeta: { base: 'violeta', alpha: 1, nombre: 'violeta neblina' },
  crema: { base: 'crema', alpha: 1, nombre: 'crema' },
  amarillo: { base: 'amarillo', alpha: 1, nombre: 'amarillo bruma' },
  menta: { base: 'menta', alpha: 1, nombre: 'verde menta' },
  durazno: { base: 'durazno', alpha: 1, nombre: 'durazno pastel' },
  azul: { base: 'azul', alpha: 1, nombre: 'azul cielo' },
}

// The only 8 combos (#92f). Order = rotation order; n = Nicolás's numbering.
export const PAIRS = [
  { n: 1, id: 'violeta-sobre-crema', nombre: 'violeta sobre crema', bg: 'crema', ink: 'violeta' },
  { n: 2, id: 'crema-sobre-violeta', nombre: 'crema sobre violeta', bg: 'violeta', ink: 'crema' },
  { n: 3, id: 'violeta-sobre-amarillo', nombre: 'violeta sobre amarillo', bg: 'amarillo', ink: 'violeta' },
  { n: 4, id: 'amarillo-sobre-violeta', nombre: 'amarillo sobre violeta', bg: 'violeta', ink: 'amarillo' },
  { n: 5, id: 'violeta-sobre-menta', nombre: 'violeta sobre menta', bg: 'menta', ink: 'violeta' },
  { n: 6, id: 'menta-sobre-violeta', nombre: 'menta sobre violeta', bg: 'violeta', ink: 'menta' },
  { n: 7, id: 'violeta-sobre-durazno', nombre: 'violeta sobre durazno', bg: 'durazno', ink: 'violeta' },
  { n: 8, id: 'violeta-sobre-azul', nombre: 'violeta sobre azul cielo', bg: 'azul', ink: 'violeta' },
]

const resolve = (k) => {
  const c = COLORES[k]
  if (!c) throw new Error(`color "${k}" fuera de la regla #92f`)
  return tint(c.base, c.alpha)
}

// Resolves a combo by id or by number (1 to 8). Throws for anything else, and for
// any combo without violet (guards edits to PAIRS).
export function getPair(id) {
  const p = PAIRS.find((x) => x.id === id || x.n === Number(id))
  if (!p) throw new Error(`combinación de color desconocida "${id}" (opciones: ${PAIRS.map((x) => `${x.n} ${x.id}`).join(', ')})`)
  if (p.bg !== 'violeta' && p.ink !== 'violeta') throw new Error(`${p.id}: el violeta debe ser uno de los dos colores`)
  const bg = resolve(p.bg)
  const ink = resolve(p.ink)
  return { n: p.n, id: p.id, nombre: p.nombre, bg, ink, contrast: contrast(bg, ink) }
}

export const checkPairs = () => PAIRS.map((p) => getPair(p.id))

// history = ids of past posts' combos, oldest first. Cycles 1 to 8 and back to 1,
// so it never repeats the previous post. Empty history (or an unknown last id,
// e.g. a pre-#92f scheme) starts at combo 1.
export function nextPair(history = []) {
  const i = PAIRS.findIndex((p) => p.id === history[history.length - 1])
  return getPair(PAIRS[(i + 1) % PAIRS.length].id)
}

if (process.argv[1]?.endsWith('colors.mjs')) {
  for (const r of checkPairs()) console.log(`${r.n}  ${r.contrast.toFixed(2).padStart(5)}:1  ${r.bg} / ${r.ink}  ${r.id}`)
}
