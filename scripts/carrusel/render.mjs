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
//   ] }
//
// Design (#92b, Nicolás): flat cream #FEF8E9 + black, no gradients, NO logos.
// Content titles are pinned to the top (same height on every slide). The handle
// (HANDLE, @efimeramente.ec) appears ONLY on the closing slide.
//
// **double asterisks** switch to the bold sans (titles and body) — the manual's
// own headline pattern ("identidad **de marca**", p.10/25/31). Text auto-fits:
// every slide shrinks its type until nothing overflows; if it still overflows at
// the minimum size the render FAILS rather than ship a clipped slide.
//
// Fonts: the brand fonts are NOT in git (Helvetica Now is Monotype-licensed and
// may not be redistributed; the repo is public). `node scripts/carrusel/fetch-fonts.mjs`
// downloads them from the brand Drive into assets/brand/fonts/ (gitignored).
// Without them the renderer falls back to Google Fonts (Playfair Display /
// Inter Tight) and says so.
//
// Also importable: `renderCarousel(spec, outDir)` → { files, fonts } (used by #93).

import { chromium } from 'playwright'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BRAND = join(HERE, '..', '..', 'assets', 'brand')

export const W = 1080
export const H = 1350

// Manual p.13–20 has the full palette (see BRAND.md); carousels use only the
// flat cream ground + black ink (Nicolás, #92b: no gradients, no logos).
const C = { crema: '#FEF8E9', tinta: '#000000' }

// The ONLY place the Instagram handle lives. Shown on the closing slide only.
export const HANDLE = '@efimeramente.ec'

const SPARK = (size, fill = C.tinta) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 0 C53 34 66 47 100 50 C66 53 53 66 50 100 C47 66 34 53 0 50 C34 47 47 34 50 0Z" fill="${fill}"/></svg>`

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b class="em">$1</b>').replace(/\n/g, '<br>')
const dataUrl = (file, mime) => `data:${mime};base64,${readFileSync(file).toString('base64')}`

function fontSetup() {
  const f = (n) => join(BRAND, 'fonts', n)
  // CARRUSEL_FALLBACK_FONTS=1 previews what a machine without the brand fonts renders.
  const local = process.env.CARRUSEL_FALLBACK_FONTS !== '1' && ['ChettaVissto.otf', 'HelveticaNowDisplay-Regular.ttf', 'HelveticaNowDisplay-Medium.ttf', 'HelveticaNowDisplay-Bold.ttf']
    .every((n) => existsSync(f(n)))
  const google = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;700&family=Playfair+Display:wght@400&display=block">`
  if (!local) return { mode: 'fallback', head: google }
  const face = (fam, file, w, mime, fmt) =>
    `@font-face{font-family:'${fam}';src:url(${dataUrl(f(file), mime)}) format('${fmt}');font-weight:${w};font-display:block}`
  return {
    mode: 'brand',
    // Google fonts stay linked: Chetta Vissto has no ¿ ¡ — ” … glyphs, so the
    // browser borrows them from Playfair per character.
    head: google + `<style>${[
      face('Chetta Vissto', 'ChettaVissto.otf', 400, 'font/otf', 'opentype'),
      face('Helvetica Now Display', 'HelveticaNowDisplay-Regular.ttf', 400, 'font/ttf', 'truetype'),
      face('Helvetica Now Display', 'HelveticaNowDisplay-Medium.ttf', 500, 'font/ttf', 'truetype'),
      face('Helvetica Now Display', 'HelveticaNowDisplay-Bold.ttf', 700, 'font/ttf', 'truetype'),
    ].join('')}</style>`,
  }
}

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:${C.crema};color:${C.tinta};-webkit-font-smoothing:antialiased;
  font-family:'Helvetica Now Display','Inter Tight',Helvetica,Arial,sans-serif}
.serif{font-family:'Chetta Vissto','Playfair Display',Georgia,serif;font-weight:400;
  font-feature-settings:"liga" 1;letter-spacing:-0.01em}
.em{font-family:'Helvetica Now Display','Inter Tight',Helvetica,Arial,sans-serif;font-weight:700;letter-spacing:-0.035em}
.slide{position:absolute;inset:0;overflow:hidden;background:${C.crema}}
.frame{position:absolute;left:96px;right:96px;top:104px;bottom:104px;display:flex;flex-direction:column}
.top,.bottom{display:flex;align-items:center;justify-content:space-between;flex:none}
.top{margin-bottom:48px}
.bottom{margin-top:48px}
.fit{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;overflow-wrap:normal;word-break:normal;hyphens:manual}
.inner{display:flex;flex-direction:column;flex:none;margin:auto 0}
.fit.top-align .inner{margin:0 0 auto}
.title{line-height:1.02}
.body p{line-height:1.32;font-weight:400}
.body p+p{margin-top:.7em}
.label{font-size:30px;font-weight:500;letter-spacing:.01em}
.num{font-size:30px;font-weight:700;letter-spacing:.02em}
.num span{font-weight:400;opacity:.5}
`

function slideHtml(s, i, n) {
  const lines = Array.isArray(s.body) ? s.body : s.body ? [s.body] : []
  const body = lines.map((l) => `<p>${rich(l)}</p>`).join('')
  const num = `<div class="num">${String(i + 1).padStart(2, '0')}<span> / ${String(n).padStart(2, '0')}</span></div>`
  if (s.type === 'portada') {
    return `<div class="slide"><div class="frame">
      <div class="top"><div class="label serif" style="font-size:34px">${esc(s.kicker || '')}</div>${SPARK(44)}</div>
      <div class="fit"><div class="inner">
        <h1 class="title serif" data-max="150" data-min="60">${rich(s.title)}</h1>
      </div></div>
      <div class="bottom"><div></div><div class="label">desliza →</div></div>
    </div></div>`
  }
  if (s.type === 'cierre') {
    return `<div class="slide"><div class="frame">
      <div class="top">${num}${SPARK(44)}</div>
      <div class="fit"><div class="inner" style="gap:56px">
        <h2 class="title serif" data-max="112" data-min="52">${rich(s.title)}</h2>
        ${body ? `<div class="body" data-max="44" data-min="28" style="font-weight:500">${body}</div>` : ''}
      </div></div>
      <div class="bottom" style="align-items:flex-end">
        <div style="display:flex;flex-direction:column;gap:10px">
          <div class="label" style="font-weight:700">${HANDLE}</div>
          ${s.credit ? `<div class="label" style="font-size:24px;font-weight:400;opacity:.6">${esc(s.credit)}</div>` : ''}
        </div>
        <div class="label serif" style="font-size:34px">pensar con luz</div>
      </div>
    </div></div>`
  }
  // contenido — anchored to the top so the title sits at the same height on
  // every content slide, whatever its length (#92b). Title is optional: a
  // body-only slide starts at that same spot, a bit larger.
  return `<div class="slide"><div class="frame">
    <div class="top">${num}${SPARK(36)}</div>
    <div class="fit top-align"><div class="inner" style="gap:48px">
      ${s.title ? `<h2 class="title serif" data-max="96" data-min="50">${rich(s.title)}</h2>` : ''}
      ${body ? `<div class="body" ${s.title ? 'data-max="46" data-min="30"' : 'data-max="56" data-min="32"'}>${body}</div>` : ''}
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
  mkdirSync(outDir, { recursive: true })
  const fonts = fontSetup()
  const browser = await chromium.launch()
  const files = []
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
    for (const [i, s] of slides.entries()) {
      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">${fonts.head}<style>${CSS}</style></head><body>${slideHtml(s, i, slides.length)}</body></html>`
      await page.setContent(html, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      const fit = await page.evaluate(fitInPage)
      if (!fit.ok) throw new Error(`slide ${i + 1}: el texto no cabe ni al tamaño mínimo (${fit.sizes.join(', ')}) — acórtalo`)
      const file = join(outDir, `${String(i + 1).padStart(2, '0')}.png`)
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: W, height: H } })
      const { w, h } = pngSize(file)
      if (w !== W || h !== H) throw new Error(`${file}: ${w}×${h}, se esperaba ${W}×${H}`)
      files.push(file)
    }
  } finally {
    await browser.close()
  }
  return { files, fonts: fonts.mode }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [specPath, outDir] = process.argv.slice(2)
  if (!specPath || !outDir) {
    console.error('uso: node scripts/carrusel/render.mjs <spec.json> <outDir>')
    process.exit(1)
  }
  const spec = JSON.parse(readFileSync(specPath, 'utf8'))
  const { files, fonts } = await renderCarousel(spec, outDir)
  if (fonts !== 'brand') console.warn('⚠ fuentes de marca ausentes → Playfair Display / Inter Tight (corre fetch-fonts.mjs)')
  writeFileSync(join(outDir, 'render.json'), JSON.stringify({ fonts, slides: files.length }, null, 2))
  console.log(`${files.length} PNG ${W}×${H} → ${outDir} (fuentes: ${fonts})`)
}
