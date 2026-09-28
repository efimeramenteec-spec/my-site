// scripts/build-cards.mjs — therapist card renderer (funnel cards v2, #4b)
//
// Builds the WhatsApp therapist cards from a source photo + the copy below, and
// writes them to public/cards/<slug>.jpg. Filenames are load-bearing: they are
// what `therapists.funnel_card_url` points at, so renaming one breaks the bot's
// image cards. Same 989×1280 as v1 so WhatsApp renders them identically.
//
// Layout is phone-first: the photo dominates, then the name, one education line
// and exactly three areas. No approach, no bio (spec #4b).
//
// Framing is normalized, not hand-cropped: `face-detect.swift` (macOS Vision)
// reports each face box and the photo is zoomed/offset so every face lands at
// the same size and position. That's why six photos shot at different distances
// still read as one set.
//
//   node scripts/build-cards.mjs [--out <dir>]
//
// Needs Google Chrome (headless screenshot) + macOS `sips`. Network is used once
// for the webfont; if it's unavailable the render falls back to a system sans.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PHOTOS = join(process.env.HOME, 'Downloads')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const W = 989, H = 1280           // final card size (matches v1)
const SCALE = 2                    // render at 2× for crisp text, downscale after
const FACE_TARGET_W = 0.28         // face width as a fraction of the photo box
const FACE_AT = { x: 0.50, y: 0.44 } // where the face centre sits in the photo box

// The six cards. `photo` is the file as downloaded; `slug` MUST stay stable.
const CARDS = [
  {
    slug: 'francisco', photo: 'Francisco Mena.JPEG',
    nombre: 'Francisco', apellido: 'Mena',
    edu: 'Máster en Psicología Infantil · Universidad Internacional de Valencia',
    items: ['Niños y adolescentes', 'Ansiedad y depresión', 'Trauma y duelo'],
  },
  {
    slug: 'maria-gracia', photo: 'Ma Gracia Villalba.jpg',
    nombre: 'María Gracia', apellido: 'Villalba',
    edu: 'Máster en Problemas de Conducta · Universidad de Valencia',
    items: ['Niños, TDAH y autismo', 'Ansiedad y depresión', 'Rupturas y relaciones de pareja'],
  },
  {
    slug: 'camila', photo: 'Camila Maya.JPEG',
    nombre: 'Camila', apellido: 'Maya',
    edu: 'Máster en Psicología Clínica · ISEP Barcelona',
    items: ['Ansiedad y depresión', 'Rupturas y relaciones de pareja', 'Jóvenes adultos'],
  },
  {
    slug: 'carolina', photo: 'Carolina Almeida.JPG',
    nombre: 'Carolina', apellido: 'Almeida',
    edu: 'MSc Terapia Familiar y de Pareja · Universidad de Salamanca',
    items: ['Terapia de pareja', 'Rupturas y relaciones de pareja', 'Jóvenes adultos y adultos'],
  },
  {
    slug: 'sophia', photo: 'Sophia Vergara.JPG',
    nombre: 'Sophia', apellido: 'Vergara',
    edu: 'Máster en Psicoterapia · Universidad Internacional de Valencia',
    items: ['Trauma y estrés postraumático', 'Ansiedad, depresión y duelo', 'Autoestima y crisis de vida'],
  },
  {
    slug: 'daniela', photo: 'Daniela Espinosa.JPEG',
    nombre: 'Daniela', apellido: 'Espinosa',
    edu: 'Máster en Psicología Clínica · Universidad de Navarra',
    items: ['Rupturas', 'Relaciones de pareja', 'Ansiedad y depresión'],
  },
]

const sips = (args) => execFileSync('sips', args, { encoding: 'utf8' })

function imageSize(path) {
  const out = sips(['-g', 'pixelWidth', '-g', 'pixelHeight', path])
  return {
    w: +out.match(/pixelWidth:\s*(\d+)/)[1],
    h: +out.match(/pixelHeight:\s*(\d+)/)[1],
  }
}

// macOS Vision face boxes, as fractions of the image.
function detectFaces(paths) {
  const swift = join(HERE, 'face-detect.swift')
  const out = execFileSync('swift', [swift, ...paths], { encoding: 'utf8' })
  const map = {}
  for (const line of out.trim().split('\n')) {
    const [path, , cx, cy, fw] = line.split('\t')
    if (!fw) continue
    map[path] = { cx: +cx.split('=')[1] / 100, cy: +cy.split('=')[1] / 100, w: +fw.split('=')[1] / 100 }
  }
  return map
}

// Zoom + offset that put every face at the same size and spot in the photo box.
function framePhoto({ img, face, boxW, boxH }) {
  let scale = (FACE_TARGET_W * boxW) / (face.w * img.w)
  scale = Math.max(scale, boxW / img.w, boxH / img.h) // never smaller than cover
  const W2 = img.w * scale, H2 = img.h * scale
  const clamp = (v, max) => Math.max(0, Math.min(v, max))
  return {
    width: Math.round(W2),
    height: Math.round(H2),
    left: -Math.round(clamp(face.cx * W2 - FACE_AT.x * boxW, W2 - boxW)),
    top: -Math.round(clamp(face.cy * H2 - FACE_AT.y * boxH, H2 - boxH)),
  }
}

const dataUri = (p) => {
  const ext = p.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'
  return `data:image/${ext};base64,${readFileSync(p).toString('base64')}`
}

function html(card, frame, uri) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const items = card.items.map((t) => `<li>${esc(t)}</li>`).join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${W}px;height:${H}px;overflow:hidden;
    font-family:'DM Sans',-apple-system,'Helvetica Neue',sans-serif;
    /* Brand gradient: amarillo → naranja → rosa → lavanda, as soft mesh blooms. */
    background:
      radial-gradient(60% 45% at 12% 8%,  #ffd84a 0%, rgba(255,216,74,0) 70%),
      radial-gradient(55% 40% at 92% 14%, #faab55 0%, rgba(250,171,85,0) 72%),
      radial-gradient(65% 50% at 88% 90%, #b48ae4 0%, rgba(180,138,228,0) 72%),
      radial-gradient(60% 45% at 8% 92%,  #f5a8a0 0%, rgba(245,168,160,0) 72%),
      #f3eff3;
    padding:30px;display:flex}

  .card{flex:1;background:#fff;border:3px solid #111;border-radius:34px;
    box-shadow:14px 14px 0 #111;display:flex;flex-direction:column;overflow:hidden}

  /* Browser chrome — carried over from the v1 cards so the set stays recognisable. */
  .chrome{height:52px;flex:none;border-bottom:3px solid #111;display:flex;
    align-items:center;gap:11px;padding:0 24px}
  .dot{width:15px;height:15px;border-radius:50%}

  .photo{position:relative;margin:22px 22px 0;height:670px;flex:none;
    border:3px solid #111;border-radius:24px;overflow:hidden;background:#eae6e1}
  .photo img{position:absolute;display:block}

  .name{padding:26px 34px 0;font-size:55px;font-weight:700;line-height:1.02;
    letter-spacing:-.022em;color:#111}
  .name span{font-weight:400;color:#444}
  .rule{margin:15px 34px 0;width:78px;height:7px;background:#ffd84a;border-radius:4px}
  .edu{padding:13px 34px 0;font-size:22px;font-weight:500;line-height:1.32;color:#5c5c5c}

  ul{list-style:none;margin:auto 22px 22px;display:flex;flex-direction:column;gap:11px}
  li{border:3px solid #111;border-radius:16px;padding:19px 24px;
    font-size:27px;font-weight:700;color:#111;text-align:center;letter-spacing:-.008em}
</style></head><body>
  <div class="card">
    <div class="chrome">
      <i class="dot" style="background:#e5544b"></i>
      <i class="dot" style="background:#f0a33c"></i>
      <i class="dot" style="background:#5ac05a"></i>
    </div>
    <div class="photo">
      <img src="${uri}" style="width:${frame.width}px;height:${frame.height}px;left:${frame.left}px;top:${frame.top}px">
    </div>
    <div class="name">${esc(card.nombre)} <span>${esc(card.apellido)}</span></div>
    <div class="rule"></div>
    <div class="edu">${esc(card.edu)}</div>
    <ul>${items}</ul>
  </div>
</body></html>`
}

// ── build ────────────────────────────────────────────────────────────────────
const outArg = process.argv.indexOf('--out')
const OUT = outArg > -1 ? process.argv[outArg + 1] : join(REPO, 'public', 'cards')
const TMP = join(process.env.TMPDIR || '/tmp', `cards-${process.pid}`)
mkdirSync(TMP, { recursive: true })
mkdirSync(OUT, { recursive: true })

const paths = CARDS.map((c) => join(PHOTOS, c.photo))
const faces = detectFaces(paths)

for (const card of CARDS) {
  const src = join(PHOTOS, card.photo)
  const face = faces[src]
  if (!face) throw new Error(`No face detected in ${card.photo} — check the photo.`)

  const frame = framePhoto({ img: imageSize(src), face, boxW: 889 - 6, boxH: 670 - 6 })
  const page = join(TMP, `${card.slug}.html`)
  writeFileSync(page, html(card, frame, dataUri(src)))

  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--screenshot=${join(TMP, card.slug + '.png')}`,
    `--window-size=${W},${H}`, `--force-device-scale-factor=${SCALE}`,
    '--virtual-time-budget=6000', `file://${page}`,
  ], { stdio: 'ignore' })

  // Downscale the 2× render to the final size and convert to JPEG.
  const png = join(TMP, `${card.slug}.png`)
  sips(['-z', String(H), String(W), png, '--out', png])
  sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', '86', png, '--out', join(OUT, `${card.slug}.jpg`)])
  console.log(`✓ ${card.slug}.jpg  (face ${(face.w * 100).toFixed(0)}% → ${(FACE_TARGET_W * 100)}%)`)
}

rmSync(TMP, { recursive: true, force: true })
console.log(`\n${CARDS.length} cards → ${OUT}`)
