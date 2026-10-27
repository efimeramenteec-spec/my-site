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

Colors are never flat fills. They appear as soft blurred orbs/gradients (p.21 "gradientes:
transiciones suaves", p.24 "órbita", p.26–28 variations). The renderer does exactly that.

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
the isotipo's height. The renderer keeps the logo in the 96 px frame margin, with nothing
else within that distance.

**Usos incorrectos (p.30):** no two-color logo; never reorder "mente / efímera" or alter the
isotipo; always scale proportionally (no stretching); no outline-only logo. Logos stay black.

## Lenguaje visual (p.5–6, 21–24)
- Objectives (p.5): guide with warmth, make the inner world visible through color, light and
  gradients, transform with beauty.
- Concept (p.6): ✦ = **luz**, "support from understanding and inner awareness"; overlapping
  circles = **unión** (body and mind).
- Elements (p.21–24): gradients, blurred illustrations, **destellos** (the 4-point star ✦ =
  clarity), **órbita** (soft circle = continuity).
- Tagline **"pensar con luz"** (p.34–35). Handle **@efimera.mente** (p.32).

## Carrusel (Instagram) — spacing used by the renderer
- Canvas 1080×1350 (4:5). Frame margin 96 px left/right, 104 px top/bottom. The manual's
  square pages keep about 9% margins, and 96/1080 ≈ 9%.
- Text auto-fits: all type in a slide shrinks together down to a minimum. If it still
  doesn't fit, the render **fails** (no clipped slides).
- Templates: `portada` (hook + logotipo corto), `contenido` (number NN / NN, title, 1–3
  lines, isotipo + handle), `cierre` (takeaway, CTA, logotipo corto, @efimera.mente,
  "pensar con luz").
