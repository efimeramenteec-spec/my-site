// scripts/carrusel/fetch-fonts.mjs — downloads the brand fonts into
// assets/brand/fonts/ (gitignored; see assets/brand/BRAND.md → Licencias).
// Source: Drive "Recursos de Marca/ENTREGABLES/TIPOGRAFIA" (link-shared files).
//
//   node scripts/carrusel/fetch-fonts.mjs

import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'brand', 'fonts')
const FILES = {
  'ChettaVissto.otf': '13dAQf0JCieSee9uqelHr9u9WTF4U4_xB',
  'HelveticaNowDisplay-Regular.ttf': '1DmJsFHdT_lnygVbOoJfNpf-FQ1ODWEfa',
  'HelveticaNowDisplay-Medium.ttf': '1IKpf6c0anvK3Gj1kVhwy7kTujA8IdbAn',
  'HelveticaNowDisplay-Bold.ttf': '1Ss5gNZaepa4CInjd-z0wb8m-E7Vn3wr3',
}

mkdirSync(DIR, { recursive: true })
for (const [name, id] of Object.entries(FILES)) {
  const res = await fetch(`https://drive.google.com/uc?export=download&id=${id}&confirm=t`)
  const buf = Buffer.from(await res.arrayBuffer())
  const magic = buf.subarray(0, 4).toString('hex')
  if (!res.ok || !['00010000', '4f54544f'].includes(magic)) throw new Error(`${name}: descarga inválida (${res.status})`)
  writeFileSync(join(DIR, name), buf)
  console.log(`${name} ${buf.length} bytes`)
}
