# Efimeramente — Brand Design System

## About the Brand
**Efimeramente** is a psychology practice in Mexico. The name means "ephemeral/fleeting" in Spanish — referring to the transient nature of thoughts and emotions. Led by Psic. Mariana Villegas.

The tone is: warm, professional, soft, sophisticated. Not clinical. Think high-end wellness spa, not a hospital.

---

## Color Palette

| Name     | Hex       | Usage                          |
|----------|-----------|-------------------------------|
| Amarillo | `#ffd84a` | Primary accent, highlights     |
| Naranja  | `#faab55` | Secondary accent, warmth       |
| Rosa     | `#f5a8a0` | Tertiary, soft warmth          |
| Lavanda  | `#b48ae4` | Quaternary, calm/spiritual     |

**Neutrals (infer from brand spirit):**
- Background: near-white `#fafafa` or `#ffffff`
- Surface: `#f5f3f0` (warm off-white)
- Text primary: `#1a1a1a` (near-black)
- Text secondary: `#6b6b6b`
- Border: `#e8e4df`

**Gradient usage:** Colors are always used as soft gradient blends, never flat fills. Typical gradient: `#ffd84a → #faab55 → #f5a8a0 → #b48ae4`. Gradients are radial/mesh, not linear.

---

## Typography

| Role               | Font               | Size | Weight | Notes                        |
|--------------------|--------------------|------|--------|------------------------------|
| H1 / Título        | Chetta Vissto      | 42pt | Bold   | Custom uploaded font         |
| H2 / Subtítulo     | Cormorant Garamond | 36pt | Bold   | Elegant serif                |
| H3 / Título        | Playfair Display   | 31pt | Bold   | Secondary display serif      |
| H4 / Subtítulo     | Lato               | 18pt | Bold   | Clean sans for sub-headings  |
| Section heading    | DM Sans            | 20pt | Bold   | UI labels and section titles |
| Body / Cuerpo      | Arimo              | 12pt | Bold   | Body text                    |
| Quote / Cita       | EB Garamond        | 16pt | Bold   | Pull quotes                  |
| Caption / Leyenda  | Source Sans Pro    | 14pt | Bold   | Captions, metadata           |

**Note:** Chetta Vissto is a custom font — it needs to be self-hosted. For web use, fall back to `Playfair Display` if Chetta Vissto is unavailable. All Google Fonts (Cormorant Garamond, Playfair Display, Lato, DM Sans, Arimo, EB Garamond, Source Sans Pro) are available via CDN.

---

## Logo Assets

Three logo variants (located in `public/logos/`):

| File                      | Usage                                           |
|---------------------------|-------------------------------------------------|
| `LOGOTIPOLARGO (1).png`   | Full horizontal: "efimeramente★ / by Psic. Mariana Villegas" — use in headers, splash |
| `LOGOTIPOCORTO (1).png`   | Stacked short: "★efimera / mente" — use in compact spaces |
| `ISOTIPO (1).png`         | "em★" monogram — use as favicon, app icon, avatar |

All logos are black on transparent background. Minimum clear space: 16px on all sides.

---

## Visual Language & Aesthetics

### Core Motifs
- **Gradient orbs / mesh blobs**: Soft radial gradient spheres blending all 4 brand colors. These float as ambient background decoration. Think iridescent soap bubbles — slightly 3D, feathered edges, no hard borders.
- **Butterflies**: Silhouettes (not literal illustrations), always softly blurred/bokeh. Symbol of transformation — core to the brand identity.
- **Flowers**: Soft-focus floral forms, same bokeh treatment as butterflies.
- **Stars/sparkles**: The 4-pointed star (✦) appears in the logo and as a recurring micro-motif.

### Photography/Imagery Style
- Always soft-focus / bokeh
- Colors treated to match brand palette (blue-lavender, peach, pink)
- White or very light backgrounds
- Nothing harsh, clinical, or sharp

### UI Texture Principles
- **No hard edges anywhere.** Everything rounded — pill buttons, high border-radius cards.
- **Glassmorphism** is appropriate: frosted glass cards (`backdrop-filter: blur`), semi-transparent white surfaces layered over gradient blobs.
- **Soft shadows only** (`box-shadow: 0 4px 24px rgba(0,0,0,0.06)` — never harsh drop shadows).
- **Whitespace-first**: use space as a separator, not dividers or lines.
- **Gradient fills** on interactive elements (buttons, badges, active states).
- **No flat solid color fills** on decorative elements — always gradient.

### Spacing & Layout
- Generous padding and margins — breathable, spa-like
- Max content width: ~1200px, centered
- Card border radius: 16–24px minimum
- Button border radius: 999px (pill shape)
- Gap between elements: multiples of 8px (8, 16, 24, 32, 48)

### Motion (if applicable)
- Slow, gentle transitions (300–500ms ease-out)
- Floating animation for orb blobs (subtle vertical drift, ~6s loop)
- No aggressive animations — everything should feel calm

---

## Design System Tokens (Tailwind CSS)

```js
// tailwind.config.js additions
colors: {
  brand: {
    yellow:  '#ffd84a',
    orange:  '#faab55',
    pink:    '#f5a8a0',
    lavender:'#b48ae4',
  },
  surface: {
    bg:      '#ffffff',
    warm:    '#f5f3f0',
    card:    'rgba(255,255,255,0.7)',
  },
  text: {
    primary:   '#1a1a1a',
    secondary: '#6b6b6b',
    muted:     '#9ca3af',
  },
  border: {
    DEFAULT: '#e8e4df',
  }
},
fontFamily: {
  display: ['Chetta Vissto', 'Playfair Display', 'Georgia', 'serif'],
  serif:   ['Cormorant Garamond', 'Georgia', 'serif'],
  heading: ['DM Sans', 'system-ui', 'sans-serif'],
  body:    ['Arimo', 'system-ui', 'sans-serif'],
  caption: ['Source Sans Pro', 'system-ui', 'sans-serif'],
},
borderRadius: {
  card: '20px',
  pill: '999px',
  blob: '60% 40% 70% 30% / 50% 60% 40% 50%',
},
boxShadow: {
  soft: '0 4px 24px rgba(0,0,0,0.06)',
  card: '0 8px 40px rgba(0,0,0,0.08)',
  glow: '0 0 40px rgba(180,138,228,0.25)',
},
```

---

## Component Style Guide

### Buttons
- Primary: pill shape, gradient fill `#faab55 → #f5a8a0 → #b48ae4`
- Secondary: pill shape, white background, 1px border `#e8e4df`
- Ghost: no background, no border, text in brand color
- Hover: subtle scale(1.02) + shadow increase

### Cards
- Background: `rgba(255,255,255,0.7)` with `backdrop-filter: blur(12px)`
- Border: `1px solid rgba(255,255,255,0.8)`
- Border radius: 20px
- Shadow: soft (see tokens above)
- No internal dividers — use padding/spacing

### Form Controls
- Inputs: rounded-xl, white bg, soft border, focus ring in lavender
- Toggles: pill-shaped, gradient fill when active
- Dropdowns: match card style
- No plain text inputs where a control can substitute (poka-yoke principle)

### Status Badges
- Use brand colors as gradient backgrounds at 20% opacity
- Pill shaped, small text (Source Sans Pro 12px)

---

## App Context

This design system is for an **internal PWA** called **Efimeramente Panel de Control** — a practice management app for the psychology practice owner (Nicolas). It manages:
- Patient sessions and scheduling
- WhatsApp message tracking (via Twilio webhooks)
- Patient follow-up tracking
- Financial overview

The app replaces: Calendly, Zapier, Google Sheets backend.
Tech stack: React + Vite + Tailwind CSS, deployed on Netlify, backend on Supabase.

The aesthetic must feel premium and on-brand — not like a generic SaaS dashboard.
