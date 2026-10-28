// scripts/carrusel/render.mjs — Instagram carousel renderer (#92, piece 1 of /carrusel)
//
// Turns a carousel spec into numbered 1080×1350 PNGs (Instagram 4:5 portrait),
// following the brand manual (assets/brand/BRAND.md — read that before changing
// any color, font or spacing here).
//
//   node scripts/carrusel/render.mjs <spec.json> <outDir>
//
// Spec:
//   { "slides": [
//       { "type": "portada",   "title": "…", "kicker": "…"? },
//       { "type": "contenido", "title": "…"?, "body": "…" | ["…", "…"] },
//       { "type": "cierre",    "title": "…", "body": "…"?, "credit": "…"? }  // body = CTA
//   ], "color": "<combo id or 1-8>"? }   // colors.mjs PAIRS; default 1 violeta-sobre-crema
//
// Design (#92b to #92f, Nicolás): ONE flat combo per post, one of the 8 violet combos
// (colors.mjs, final rule #92f), one ink for all text. No gradients, NO logos, no
// black text. The combos are low contrast (about 1.8 to 2.6:1), so readability
// comes from size and weight: every word is the bold/medium sans, body never below
// 40 px, titles much bigger. Contrast is logged in render.json, never blocking.
// Content titles are pinned to the top (same height on every slide). The handle
// (HANDLE, @efimeramente.ec) appears ONLY on the closing slide.
//
// Titles (#92g, Nicolás 28 Oct): Chetta Vissto (the manual's display serif) on
// cover, content and closing titles, with Helvetica Now Display as the
// per-character fallback for glyphs Chetta lacks (¿ ¡ — ” … and any other).
// **...** in a title only drops its markers. Body and labels stay Helvetica Now
// (body Medium, **...** = Bold). renderCarousel refuses to render when the brand
// fonts (Chetta included) are missing, unless CARRUSEL_FALLBACK_FONTS=1 (preview).
// No "pensar con luz" on any slide (#92g).
// Text auto-fits: each slide shrinks its type down to the minimum. A content slide
// that still doesn't fit is SPLIT into consecutive slides at a paragraph break
// (#92e): the words are never changed, cut or summarized, and the slides are
// renumbered. A slide that can't be split (one paragraph, cover, closing) FAILS
// rather than ship a clipped slide.
//
// Fonts: the brand fonts are NOT in git (Helvetica Now is Monotype-licensed and
// may not be redistributed; the repo is public). `node scripts/carrusel/fetch-fonts.mjs`
// downloads them from the brand Drive into assets/brand/fonts/ (gitignored).
// Without them the render stops (CARRUSEL_FALLBACK_FONTS=1 previews with Inter Tight).
//
// Also importable: `renderCarousel(spec, outDir)` returns { files, fonts, color, sizes, splits }
// (used by #93); sizes = the final font sizes per rendered slide, in [data-max] order
// (title, then body); splits = which spec slides were split into which output slides.

import { chromium } from 'playwright'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPair } from './colors.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const BRAND = join(HERE, '..', '..', 'assets', 'brand')

export const W = 1080
export const H = 1350

// The ONLY place the Instagram handle lives. Shown on the closing slide only.
export const HANDLE = '@efimeramente.ec'

const SPARK = (size, fill = 'currentColor') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 0 C53 34 66 47 100 50 C66 53 53 66 50 100 C47 66 34 53 0 50 C34 47 47 34 50 0Z" fill="${fill}"/></svg>`

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b class="em">$1</b>').replace(/\n/g, '<br>')
// Titles are all bold, so **...** only drops its markers.
const richTitle = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '$1').replace(/\n/g, '<br>')
const dataUrl = (file, mime) => `data:${mime};base64,${readFileSync(file).toString('base64')}`

function fontSetup() {
  const f = (n) => join(BRAND, 'fonts', n)
  // CARRUSEL_FALLBACK_FONTS=1 previews what a machine without the brand fonts renders.
  const local = process.env.CARRUSEL_FALLBACK_FONTS !== '1' && ['ChettaVissto.otf', 'HelveticaNowDisplay-Regular.ttf', 'HelveticaNowDisplay-Medium.ttf', 'HelveticaNowDisplay-Bold.ttf']
    .every((n) => existsSync(f(n)))
  const google = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;700&display=block">`
  if (!local) return { mode: 'fallback', head: google }
  const face = (fam, file, w, mime, fmt) =>
    `@font-face{font-family:'${fam}';src:url(${dataUrl(f(file), mime)}) format('${fmt}');font-weight:${w};font-display:block}`
  return {
    mode: 'brand',
    // Chetta Vissto has no ¿ ¡ — ” … glyphs; the title stack borrows them from
    // Helvetica Now Display per character (Inter Tight stays as a last resort).
    head: google + `<style>${[
      face('Chetta Vissto', 'ChettaVissto.otf', 400, 'font/otf', 'opentype'),
      face('Helvetica Now Display', 'HelveticaNowDisplay-Regular.ttf', 400, 'font/ttf', 'truetype'),
      face('Helvetica Now Display', 'HelveticaNowDisplay-Medium.ttf', 500, 'font/ttf', 'truetype'),
      face('Helvetica Now Display', 'HelveticaNowDisplay-Bold.ttf', 700, 'font/ttf', 'truetype'),
    ].join('')}</style>`,
  }
}

const css = (C) => `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:${C.bg};color:${C.ink};-webkit-font-smoothing:antialiased;font-weight:500;
  font-family:'Helvetica Now Display','Inter Tight',Helvetica,Arial,sans-serif}
.em{font-weight:700}
.slide{position:absolute;inset:0;overflow:hidden;background:${C.bg}}
.frame{position:absolute;left:96px;right:96px;top:104px;bottom:104px;display:flex;flex-direction:column}
.top,.bottom{display:flex;align-items:center;justify-content:space-between;flex:none}
.top{margin-bottom:48px}
.bottom{margin-top:48px}
.fit{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;overflow-wrap:normal;word-break:normal;hyphens:manual}
.inner{display:flex;flex-direction:column;flex:none;margin:auto 0}
.fit.top-align .inner{margin:0 0 auto}
.title{line-height:1.04;font-weight:400;letter-spacing:-0.01em;font-family:'Chetta Vissto','Helvetica Now Display','Inter Tight',Helvetica,Arial,sans-serif}
.body p{line-height:1.28;letter-spacing:-0.01em}
.body p+p{margin-top:.7em}
.label{font-size:34px;font-weight:700;letter-spacing:.01em}
.num{font-size:34px;font-weight:700;letter-spacing:.02em}
.num span{font-weight:500}
`

function slideHtml(s, i, n) {
  const lines = Array.isArray(s.body) ? s.body : s.body ? [s.body] : []
  const body = lines.map((l) => `<p>${rich(l)}</p>`).join('')
  const num = `<div class="num">${String(i + 1).padStart(2, '0')}<span> / ${String(n).padStart(2, '0')}</span></div>`
  if (s.type === 'portada') {
    return `<div class="slide"><div class="frame">
      <div class="top"><div class="label">${esc(s.kicker || '')}</div>${SPARK(48)}</div>
      <div class="fit"><div class="inner">
        <h1 class="title" data-max="150" data-min="80">${richTitle(s.title)}</h1>
      </div></div>
      <div class="bottom"><div></div><div class="label">desliza</div></div>
    </div></div>`
  }
  if (s.type === 'cierre') {
    return `<div class="slide"><div class="frame">
      <div class="top">${num}${SPARK(48)}</div>
      <div class="fit"><div class="inner" style="gap:56px">
        <h2 class="title" data-max="112" data-min="72">${richTitle(s.title)}</h2>
        ${body ? `<div class="body" data-max="50" data-min="40">${body}</div>` : ''}
      </div></div>
      <div class="bottom" style="align-items:flex-end">
        <div style="display:flex;flex-direction:column;gap:10px">
          <div class="label">${HANDLE}</div>
          ${s.credit ? `<div class="label" style="font-size:30px;font-weight:500">${esc(s.credit)}</div>` : ''}
        </div>
      </div>
    </div></div>`
  }
  // contenido — anchored to the top so the title sits at the same height on
  // every content slide, whatever its length (#92b). Title is optional: a
  // body-only slide starts at that same spot, a bit larger. The second half of a
  // split slide (s._cont) keeps the first half's body size range.
  const withTitle = s.title || s._cont
  return `<div class="slide"><div class="frame">
    <div class="top">${num}${SPARK(40)}</div>
    <div class="fit top-align"><div class="inner" style="gap:48px">
      ${s.title ? `<h2 class="title" data-max="104" data-min="72">${richTitle(s.title)}</h2>` : ''}
      ${body ? `<div class="body" ${withTitle ? 'data-max="52" data-min="40"' : 'data-max="60" data-min="40"'}>${body}</div>` : ''}
    </div></div>
  </div></div>`
}

// Shrinks every [data-max] in .fit together (same ratio) until the block fits.
// Returns false when it still overflows at the minimum sizes.
function fitInPage() {
  const box = document.querySelector('.fit')
  const els = [...box.querySelectorAll('[data-max]')]
  // Measure the inner block, not box.scrollHeight: a vertically centered block
  // overflows upward too, and scrollHeight never counts that part.
  const inner = box.querySelector('.inner')
  const over = () => inner.getBoundingClientRect().height > box.clientHeight + 1 ||
    els.some((e) => e.scrollWidth > e.clientWidth + 1)
  for (let k = 1; k >= 0.2; k -= 0.01) {
    let floored = true
    for (const e of els) {
      const max = +e.dataset.max, min = +e.dataset.min
      const px = Math.max(min, Math.round(max * k))
      if (px > min) floored = false
      e.style.fontSize = px + 'px'
    }
    if (!over()) return { ok: true, sizes: els.map((e) => e.style.fontSize) }
    if (floored) break
  }
  return { ok: false, sizes: els.map((e) => e.style.fontSize) }
}

function pngSize(file) {
  const b = readFileSync(file)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

export async function renderCarousel(spec, outDir) {
  const slides = spec?.slides
  if (!Array.isArray(slides) || !slides.length) throw new Error('spec.slides vacío')
  for (const [i, s] of slides.entries()) {
    if (!['portada', 'contenido', 'cierre'].includes(s.type)) throw new Error(`slide ${i + 1}: type inválido "${s.type}"`)
    if (!s.title && !(s.type === 'contenido' && s.body)) throw new Error(`slide ${i + 1}: falta title`)
  }
  const pair = getPair(spec.color || 'violeta-sobre-crema')
  mkdirSync(outDir, { recursive: true })
  const fonts = fontSetup()
  if (fonts.mode !== 'brand' && process.env.CARRUSEL_FALLBACK_FONTS !== '1') {
    throw new Error('fuentes de marca ausentes (Chetta Vissto / Helvetica Now): corre node scripts/carrusel/fetch-fonts.mjs')
  }
  const CSS = css(pair)
  const doc = (s, i, n) => `<!doctype html><html lang="es"><head><meta charset="utf-8">${fonts.head}<style>${CSS}</style></head><body>${slideHtml(s, i, n)}</body></html>`
  const browser = await chromium.launch()
  const files = []
  const sizes = []
  const splits = []
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
    const fits = async (s) => {
      await page.setContent(doc(s, 98, 99), { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      return (await page.evaluate(fitInPage)).ok
    }
    // A content slide that doesn't fit at the minimum size is split at a paragraph
    // break (#92e): the first part takes the most balanced break that fits, the
    // rest is split again if needed. Words are never touched.
    const split = async (s, label) => {
      if (await fits(s)) return [s]
      const ps = Array.isArray(s.body) ? s.body : s.body ? [s.body] : []
      if (s.type !== 'contenido' || ps.length < 2) {
        throw new Error(`${label}: el texto no cabe ni al tamaño mínimo y no se puede partir (un solo párrafo o no es de contenido)`)
      }
      const len = ps.map((p) => p.length)
      const total = len.reduce((x, y) => x + y, 0)
      const ks = [...ps.keys()].slice(1)
        .sort((x, y) => Math.abs(len.slice(0, x).reduce((p, q) => p + q, 0) - total / 2) - Math.abs(len.slice(0, y).reduce((p, q) => p + q, 0) - total / 2))
      for (const k of ks) {
        const first = { ...s, body: ps.slice(0, k) }
        if (await fits(first)) return [first, ...(await split({ type: 'contenido', body: ps.slice(k), _cont: true }, label))]
      }
      throw new Error(`${label}: ningún corte entre párrafos hace que la primera parte quepa`)
    }
    const out = []
    for (const [i, s] of slides.entries()) {
      const parts = await split(s, `slide ${i + 1}`)
      if (parts.length > 1) splits.push({ slide: i + 1, en: parts.map((_, j) => out.length + j + 1) })
      out.push(...parts)
    }
    for (const [i, s] of out.entries()) {
      await page.setContent(doc(s, i, out.length), { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      if (fonts.mode === 'brand' && !(await page.evaluate(async () => !document.querySelector('.title') || (await document.fonts.load("100px 'Chetta Vissto'")).length > 0))) {
        throw new Error(`slide ${i + 1}: Chetta Vissto no cargó`)
      }
      const fit = await page.evaluate(fitInPage)
      if (!fit.ok) throw new Error(`slide ${i + 1}: el texto no cabe ni al tamaño mínimo (${fit.sizes.join(', ')})`)
      const file = join(outDir, `${String(i + 1).padStart(2, '0')}.png`)
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: W, height: H } })
      const { w, h } = pngSize(file)
      if (w !== W || h !== H) throw new Error(`${file}: ${w}×${h}, se esperaba ${W}×${H}`)
      files.push(file)
      sizes.push(fit.sizes)
    }
  } finally {
    await browser.close()
  }
  return { files, fonts: fonts.mode, color: pair, sizes, splits }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [specPath, outDir] = process.argv.slice(2)
  if (!specPath || !outDir) {
    console.error('uso: node scripts/carrusel/render.mjs <spec.json> <outDir>')
    process.exit(1)
  }
  const spec = JSON.parse(readFileSync(specPath, 'utf8'))
  const { files, fonts, color, sizes, splits } = await renderCarousel(spec, outDir)
  if (fonts !== 'brand') console.warn('vista previa con fuentes de respaldo (Inter Tight), no apta para publicar')
  writeFileSync(join(outDir, 'render.json'), JSON.stringify({ fonts, slides: files.length, color, sizes, splits }, null, 2))
  const parts = splits.map((x) => `slide ${x.slide} partida en ${x.en.join('+')}`).join('; ')
  console.log(`${files.length} PNG ${W}×${H} en ${outDir} (fuentes: ${fonts}; color ${color.id} ${color.bg}/${color.ink}, contraste ${color.contrast}:1${parts ? '; ' + parts : ''})`)
}
