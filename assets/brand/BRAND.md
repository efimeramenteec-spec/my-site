# Efimeramente — manual de marca, en código (#92)

Source: `EFIMERAMENTE-MANUALDEMARCA-BLNK2025.pdf` (blnk estudio, 2025; 36 square pages),
Drive → Recursos de Marca → ENTREGABLES (id `18yRCanXgB_3cjwYGeltuUA2Uub9tGKgn`). Not in git.
"p.N" below = the page number in that PDF. Used by `scripts/carrusel/render.mjs`
(Instagram carousels). The app's UI tokens live in the root `BRAND.md` / `tailwind.config.js`,
which are a separate system.

## Colores (p.13–20, exact HEX printed in the manual)

| Paleta | Nombre (manual) | Palabra | HEX | p. |
|---|---|---|---|---|
| principal | amarillo bruma | claridad | `#FFD84A` | 13 |
| principal | naranja aura | energía | `#FAAB55` | 14 |
| principal | rosa melón | suavidad | `#F5A8A0` | 15 |
| principal | violeta neblina | intuición | `#B48AE4` | 16 |
| secundaria | azul cielo | calma | `#A9D8FF` | 17 |
| secundaria | lavanda humo | pausa | `#C3C4FF` | 18 |
| secundaria | verde menta | brisa | `#B7F5D8` | 19 |
| secundaria | durazno pastel | feminidad | `#FCD1B5` | 20 |

**Not specified in the manual, chosen by us:**
- **Background crema `#FEF8E9`**: sampled from the background of p.26 (logo variation over
  a cream ground). p.27 is a slightly darker `#F2ECE0`; p.13–20 are pure white. Cream was
  chosen because the manual's warmest pages (p.1, 26, 27, 31) use it.
- **Ink `#000000`**: the logo PNGs are pure black (sampled), and the manual's text is black.

In the manual, colors appear as soft blurred orbs/gradients (p.21 "gradientes: transiciones
suaves", p.24 "órbita", p.26–28 variations). Carousels don't use that: they use flat pairs of the
manual's exact colors (see below).

## Tipografía (p.11–12)

| Rol | Fuente | Pesos | p. |
|---|---|---|---|
| principal ("efímera") | **Chetta Vissto** (high-contrast display serif) | Regular | 11 |
| secundaria ("mente") | **Helvetica Now Display** | Regular, Medium, Bold | 12 |

The manual's own headline pattern mixes the two: light Chetta words + bold Helvetica words
("intro**ducción**", "identidad **de marca**", "marca **en acción**", p.4/10/25/31). In a
carousel spec you get this with `**bold part**`. Body text = Helvetica Now (p.12: "orden y
legibilidad… comunicación clara en textos informativos").

### Licencias (⚠ read before redistributing)
- **Helvetica Now Display**: the font files say "property of Monotype… You may not copy or
  distribute this software". **Not committed** (the GitHub repo is public). Fallback = **Inter
  Tight** (Google Fonts).
- **Chetta Vissto**: built with Fontself Maker; no license or copyright text in the file.
  It's unclear whether it can be redistributed, so **not committed** either. Fallback =
  **Playfair Display** (Google Fonts). It also has no `¿ ¡ — “ ” …` glyphs, so those
  characters always come from Playfair.
- To render with the real fonts: `node scripts/carrusel/fetch-fonts.mjs` (pulls them from
  Drive TIPOGRAFIA into `assets/brand/fonts/`, which is gitignored). Rendering a PNG with
  them doesn't distribute the font. Ask blnk estudio to confirm the license before any
  web/app embedding.

## Logo (p.7–9, 26–30)

Files in `logos/` are trimmed (no padding), black on transparent, from Drive PNGS/LOGOTIPOS:
- `isotipo.png`: "em✦" monogram (p.7, 28)
- `logotipo-corto.png`: "✦efímera / mente" stacked (p.8, 27)
- `logotipo-largo.png`: "efímeramente✦ / by Psic. Mariana Villegas" (p.9, 26)

**Área de respeto (p.29):** a minimum margin of one "x" on every side. Measured on the page,
x ≈ the x-height of "efímera", i.e. about 20% of the stacked logo's height and about 30% of
the isotipo's height. Applies wherever a logo is used (carousels use none since #92b).

**Usos incorrectos (p.30):** no two-color logo; never reorder "mente / efímera" or alter the
isotipo; always scale proportionally (no stretching); no outline-only logo. Logos stay black.

## Lenguaje visual (p.5–6, 21–24)
- Objectives (p.5): guide with warmth, make the inner world visible through color, light and
  gradients, transform with beauty.
- Concept (p.6): ✦ = **luz**, "support from understanding and inner awareness"; overlapping
  circles = **unión** (body and mind).
- Elements (p.21–24): gradients, blurred illustrations, **destellos** (the 4-point star ✦ =
  clarity), **órbita** (soft circle = continuity).
- Tagline **"pensar con luz"** (p.34–35). Instagram handle **@efimeramente.ec**. The handle on the manual's p.32 business-card mockup is outdated: don't copy it.

## Carrusel (Instagram): design in force (#92b + #92c + #92d, Nicolás 27 Oct)
- **Only the manual's colors (#92d, Nicolás 27 Oct): "Only the manual's colors. Adjustment = transparency
  over cream only. Never darken or create colors."** Backgrounds are the p.13–20 hexes exactly as printed,
  or one of them with transparency over cream `#FEF8E9` (`tint(base, alpha)` in `scripts/carrusel/colors.mjs`),
  or plain cream. Text is black, cream or a manual color. `getPair()` refuses anything else, so the renderer
  can't use it. (The deep shades tried in #92c, terracota, deep blue and so on, were removed.)
- **One color pair per post (#92c):** a flat background + ONE ink for all the text, the same on every slide
  of that post. No gradients, orbs, textures or anything else in the background. A spec picks its pair with
  `"color": "<id>"` (default `crema-tinta`).
- **Contrast:** every pair must reach WCAG AA for body text, **≥ 4.5:1** (one ink for titles and body, so
  this also covers 3:1 for large titles). `node scripts/carrusel/colors.mjs` prints the table; the renderer
  refuses a pair below 4.5 and logs the ratio in `render.json`. No manual color reaches 4.5:1 as text on
  another manual color, so every pair uses black text today. Secondary text is drawn at full ink; only the
  "/ NN" in the page number is at 60%.
- **Rotation:** `nextPair(history)` returns the pair after the last one used (real pairs only), so
  consecutive posts never repeat. #93 keeps the history.

| id | fondo (manual, exacto) | tinta | contraste |
|---|---|---|---|
| crema-tinta | `#FEF8E9` crema | `#000000` | 19.82 |
| azul-tinta | `#A9D8FF` azul cielo, p.17 | `#000000` | 13.95 |
| rosa-tinta | `#F5A8A0` rosa melón, p.15 | `#000000` | 10.99 |
| menta-tinta | `#B7F5D8` verde menta, p.19 | `#000000` | 17.07 |
| amarillo-tinta | `#FFD84A` amarillo bruma, p.13 | `#000000` | 15.17 |
| lavanda-tinta | `#C3C4FF` lavanda humo, p.18 | `#000000` | 12.66 |
| naranja-tinta | `#FAAB55` naranja aura, p.14 | `#000000` | 11.02 |
| violeta-tinta | `#B48AE4` violeta neblina, p.16 | `#000000` | 7.70 |
| durazno-tinta | `#FCD1B5` durazno pastel, p.20 | `#000000` | 14.93 |
- **No logos on any slide** (no isotipo, no logotipo, cover and closing included). The ✦ ornament
  stays (top-right of every slide).
- **Handle `@efimeramente.ec` ONLY on the last slide** (`HANDLE` in `scripts/carrusel/render.mjs`
  is the single source). Optional `credit` line under it (e.g. "Traducido de @drdianahill").
- Canvas 1080×1350 (4:5). Frame margin 96 px left/right, 104 px top/bottom (≈9%, like the
  manual's square pages).
- Templates: `portada` (optional kicker, hook title, "desliza →"), `contenido` (NN / NN number +
  ✦; title **pinned to the top**, the same height on every content slide whatever its length; body
  right below; title optional, so a body-only slide starts at that same spot), `cierre` (number,
  takeaway, optional CTA, handle, "pensar con luz").
- Titles mix serif (Chetta) and bold sans (`**…**`). Body text supports `**bold**` too.
- Text auto-fits: all type in a slide shrinks together down to a minimum. If it still doesn't
  fit, the render **fails** (no clipped slides).

## /carrusel flow (#93, decided by Nicolás 27 Oct, #92c)
1. **Mon / Wed / Fri:** the morning brief gives Nicolás the **full translated copy** (every slide
   plus the caption with its hashtags).
2. Nicolás **corrects the text**. Slides are rendered **only after** he corrects it, never before.
3. The rendered slides go to Nicolás as a preview. **Posting happens only after his "sí", at
   19:00 GYE.** Only Nicolás approves.
- **Default = exact translation** (the #92b/#92c test settled this: no rewrite). Keep the
  original's order, claims and data.
- **Caption:** a translation of the original caption, **minus any first-person claim by the
  original author** (their experience, their courses, "in my practice…"). No added CTA.
- **Hashtags: exactly 5 per post**, Spanish and on topic: 2–3 broad, 1–2 medium, 1 niche.
  Example (#92c): `#saludmental #psicologia #terapiapsicologica #psicologosquito
  #flexibilidadpsicologica`. They go in the copy Nicolás corrects.
- **Color:** each post picks its pair with `nextPair(history)` (`colors.mjs`). **#93 stores the
  history** of used pairs (one id per post, in posting order) so consecutive posts never repeat.
- **Layout limits:** body text never below the sizes of #92b/#92c (body-only slides 56 px,
  with a title 46 px, closing 43 px; the renderer's floors are lower, 30–32 px). If a slide
  doesn't fit, **stop and tell Nicolás which one**; never split a slide or edit his text to
  make it fit.
