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

## Carrusel (Instagram): design in force (#92b to #92e, Nicolás 27 Oct)
- **Colors (#92e, Nicolás 27 Oct): ONLY violet and yellow, two schemes, alternating post by post:**
  A) `amarillo-violeta` = yellow background + violet text; B) `violeta-amarillo` = violet background +
  yellow text. Every other pair (pastels with black, cream, etc.) is gone. **No black text anywhere.**
  The colors are the manual's yellow and violet, matched to the ones Nicolás already uses in his feed
  (sampled: yellow about `#FDE689`, violet about `#B586E4`). Never darken or create a color; the only
  allowed adjustment is transparency over cream `#FEF8E9` (`tint(base, alpha)` in
  `scripts/carrusel/colors.mjs`). `getPair()` refuses any other scheme.
- **One scheme per post:** a flat background + ONE ink for all the text, the same on every slide. No
  gradients, orbs or textures. A spec picks it with `"color": "<id>"` (default `amarillo-violeta`).
- **Contrast is low (2.19:1) by decision.** Readability comes from SIZE and WEIGHT, not color: the
  4.5:1 check no longer applies to these two schemes. The ratio is logged in `render.json`, never blocking.
- **Rotation:** `nextPair(history)` alternates A/B (empty history starts with A). #93 keeps the history.

| id | fondo | texto | contraste |
|---|---|---|---|
| amarillo-violeta | `#FFE58A` = amarillo bruma `#FFD84A` p.13 at 60% over cream (the printed hex is far more saturated than the feed; 60% lands about 2 RGB units from the feed's `#FDE689`) | `#B48AE4` violeta neblina p.16, exact (feed `#B586E4`) | 2.19 |
| violeta-amarillo | `#B48AE4` violeta neblina | `#FFE58A` amarillo | 2.19 |

- **Type (#92e):** every word in Helvetica Now Display sans. Titles Bold (700); body Medium (500) with
  `**...**` = Bold; labels Bold. The Chetta serif accent was tried on the #92e test and dropped: its thin
  strokes don't read at 2.19:1, so `**...**` in a title is plain bold and "pensar con luz" is bold sans too.
- **Sizes at 1080 wide:** body never below **40 px** (body-only up to 60, with a title up to 52, closing
  up to 50); titles much bigger (cover 150 to 80, content 104 to 72, closing 112 to 72); labels 34 px.
- **Dense slides are split (#92e):** if a content slide doesn't fit at the minimum size, the renderer
  splits it into consecutive slides at a paragraph break (most balanced break whose first part fits; the
  rest splits again if needed) and renumbers everything (e.g. 01 / 11). **Words are never changed, cut
  or summarized.** The second part has no title (the title is not repeated) and keeps the body size
  range of the first. `render.json` logs `splits`. A single-paragraph slide, cover or closing that
  doesn't fit still fails the render.
- **No logos on any slide** (no isotipo, no logotipo, cover and closing included). The ✦ ornament
  stays (top-right of every slide).
- **Handle `@efimeramente.ec` ONLY on the last slide** (`HANDLE` in `scripts/carrusel/render.mjs`
  is the single source). Optional `credit` line under it (e.g. "Traducido de @drdianahill").
- Canvas 1080×1350 (4:5). Frame margin 96 px left/right, 104 px top/bottom (≈9%, like the
  manual's square pages).
- Templates: `portada` (optional kicker, hook title, "desliza"), `contenido` (NN / NN number +
  ✦; title **pinned to the top**, the same height on every content slide whatever its length; body
  right below; title optional, so a body-only slide starts at that same spot), `cierre` (number,
  takeaway, optional CTA, handle, "pensar con luz").
- Text auto-fits: all type in a slide shrinks together down to its minimum; then the split rule above
  applies (no clipped slides).

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
- **Color:** each post takes the next scheme with `nextPair(history)` (`colors.mjs`), so posts
  alternate violet-on-yellow / yellow-on-violet. **#93 stores the history** (one id per post, in
  posting order).
- **Layout limits (#92e):** body never below 40 px. A slide that doesn't fit is split at a paragraph
  break and renumbered (words untouched); only a slide that can't be split (one paragraph, cover,
  closing) stops the render, and then Nicolás is told which one. Never edit his text to make it fit.
