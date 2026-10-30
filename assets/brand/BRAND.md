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

## Carrusel (Instagram): design in force (#92b to #92f, Nicolás 27 Oct)
- **Colors (#92f, FINAL, Nicolás 27 Oct): violet `#B48AE4` (violeta neblina, p.16) is ALWAYS one of
  the two colors.** Only these 8 combos exist, one per post, rotating in this order:

| n | id | fondo | texto | contraste |
|---|---|---|---|---|
| 1 | violeta-sobre-crema | crema `#FEF8E9` | violeta `#B48AE4` | 2.57 |
| 2 | crema-sobre-violeta | violeta `#B48AE4` | crema `#FEF8E9` | 2.57 |
| 3 | violeta-sobre-amarillo | amarillo bruma `#FFD84A` p.13 | violeta | 1.97 |
| 4 | amarillo-sobre-violeta | violeta | amarillo bruma `#FFD84A` | 1.97 |
| 5 | violeta-sobre-menta | verde menta `#B7F5D8` p.19 | violeta | 2.22 |
| 6 | menta-sobre-violeta | violeta | verde menta `#B7F5D8` | 2.22 |
| 7 | violeta-sobre-durazno | durazno pastel `#FCD1B5` p.20 | violeta | 1.94 |
| 8 | violeta-sobre-azul | azul cielo `#A9D8FF` p.17 | violeta | 1.81 |

- **Never black text. Never darken or invent a color.** Every combo uses the manual's exact hex; the
  only allowed adjustment is transparency over cream (`tint(base, alpha)` in `scripts/carrusel/colors.mjs`),
  and no combo uses it today. `getPair()` refuses anything outside the 8 (and any combo without violet).
  The #92e yellow at 60% is gone: yellow is the printed `#FFD84A`.
- **One combo per post:** a flat background + ONE ink for all the text, the same on every slide. No
  gradients, orbs or textures. A spec picks it with `"color": "<id>"` or its number 1 to 8 (default 1).
- **Contrast is low (1.8 to 2.6:1) by design.** Readability comes from SIZE and WEIGHT, not color: the
  4.5:1 check doesn't apply. The ratio is logged in `render.json`, never blocking.
- **Rotation:** `nextPair(history)` cycles 1, 2, ... 8, 1 (never the same as the previous post; empty
  history or a pre-#92f id starts at 1). #93 keeps the history. POST-01 used combo 1.

- **Type (#92g, decided by Nicolás 28 Oct):** titles (cover, content and closing) in **Chetta Vissto**
  Regular, with Helvetica Now Display as the per-character fallback for glyphs Chetta lacks (¿ ¡ — ” …
  and any other); `**...**` in a title only drops its markers. Body Medium (500) and labels Bold in
  Helvetica Now Display; `**...**` in body = Bold. The render stops if the brand fonts are missing or
  Chetta doesn't load on a titled slide (`CARRUSEL_FALLBACK_FONTS=1` = preview only).
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
  takeaway, optional CTA, handle). **"pensar con luz" appears on no slide** (#92g, Nicolás 28 Oct).
- Text auto-fits: all type in a slide shrinks together down to its minimum; then the split rule above
  applies (no clipped slides).

## /carrusel flow (#93, decided by Nicolás 27 Oct, #92c)
1. **Mon / Wed / Fri:** Nicolás gets the **full translated copy** (every slide plus the caption with
   its hashtags) **on the computer**: in the Mac terminal (Claude Code) or the director chat.
2. Nicolás **corrects the text there, on the computer — never on WhatsApp** (standing rule, #93,
   29 Oct). His corrected text is saved to the post spec exactly as he writes it. Slides are rendered
   **only after** he corrects it, never before.
3. The rendered slides go to Nicolás on WhatsApp as `document` messages (owner outbox, uncompressed).
   **WhatsApp only ever receives the finished slides** — no drafts, no copy for review. **Posting happens only after his "sí", at
   19:00 GYE.** Only Nicolás approves.
- **Default = exact translation** (the #92b/#92c test settled this: no rewrite). Keep the
  original's order, claims and data.
- **Caption:** a translation of the original caption, **minus any first-person claim by the
  original author** (their experience, their courses, "in my practice…"). No added CTA.
- **Hashtags: exactly 5 per post**, Spanish and on topic: 2–3 broad, 1–2 medium, 1 niche.
  Example (#92c): `#saludmental #psicologia #terapiapsicologica #psicologosquito
  #flexibilidadpsicologica`. They go in the copy Nicolás corrects.
- **Color:** each post takes the next of the 8 violet combos with `nextPair(history)` (`colors.mjs`,
  #92f). The history lives in Supabase **`carrusel_posts`** (#93: one row per source link; `numero`,
  `estado`, `color_id`, `publicado_at`; discarded links stay as `descartado`). POST-01 = `violeta-sobre-crema`.
  Specs: `scripts/carrusel/posts/POST-NN-<slug>.json`.
- **Layout limits (#92e):** body never below 40 px. A slide that doesn't fit is split at a paragraph
  break and renumbered (words untouched); only a slide that can't be split (one paragraph, cover,
  closing) stops the render, and then Nicolás is told which one. Never edit his text to make it fit.
