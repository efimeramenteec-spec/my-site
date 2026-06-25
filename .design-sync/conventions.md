# Efimeramente DS — Conventions for the Design Agent

## Setup — no provider wrapper required

Components render standalone. No `ThemeProvider` or context wrapper is needed.
Load order: `styles.css` first (Google Fonts + Tailwind tokens + component CSS), then the bundle.

```html
<link rel="stylesheet" href="_ds_bundle/styles.css" />
<script src="_ds_bundle/_ds_bundle.js"></script>
```

In JSX, import from `'efimeramente-ds'`:
```jsx
import { Button, Card, Badge, Input, Toggle, Select } from 'efimeramente-ds'
```

## Styling idiom — Tailwind utility classes with brand tokens

This is a **Tailwind CSS** design system. Use utility classes for all layout and spacing glue.
Never invent class names — only the families below exist in the built CSS.

| Family | Example classes | Purpose |
|---|---|---|
| Background | `bg-surface-warm`, `bg-white/70` | Page and card surfaces |
| Brand colors | `bg-brand-gradient`, `text-brand-lavender`, `bg-brand-lavender/20` | Accent fills and tints |
| Content | `text-content-primary`, `text-content-secondary`, `text-content-muted` | Body text hierarchy |
| Radius | `rounded-card` (20px), `rounded-pill` (999px), `rounded-xl` | Shapes — never `rounded-lg` or `rounded-md` |
| Shadow | `shadow-soft`, `shadow-card`, `shadow-glow` | Elevation — always soft |
| Font | `font-display`, `font-serif`, `font-heading`, `font-body`, `font-caption` | Typography scale |
| Spacing | `p-6`, `gap-4`, `gap-6`, `gap-8` (multiples of 8px) | Generous, spa-like gaps |

**Background rule**: page backgrounds use `bg-surface-warm` (`#f5f3f0`). Cards use `bg-white/70 backdrop-blur-[12px]` (provided by the `Card` component itself — don't re-apply).

**No hard edges**: always use `rounded-card` for cards, `rounded-pill` for buttons and badges, `rounded-xl` for inputs.

## Where to find the truth

- **`styles.css`** → imports Google Fonts + all Tailwind-compiled token classes + `_ds_bundle.css`
- **`_ds_bundle.css`** → compiled Tailwind output; all class names above come from here
- **`components/general/<Name>/<Name>.prompt.md`** → each component's API and usage notes

## Idiomatic snippet

```jsx
import { Button, Card, Badge } from 'efimeramente-ds'

function SessionCard({ patient, status, time }) {
  return (
    // Page background
    <div className="min-h-screen bg-surface-warm font-body p-8">
      {/* Glassmorphism card — withOrbs adds ambient gradient blobs */}
      <Card withOrbs className="max-w-sm">
        <p className="font-heading font-bold text-sm text-content-secondary mb-1">
          Próxima sesión
        </p>
        <p className="font-serif text-xl font-bold text-content-primary">
          {time}
        </p>
        <p className="font-body text-sm text-content-secondary mt-1 mb-4">
          {patient}
        </p>
        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm">Ver detalles</Button>
          <Badge variant="lavender">{status}</Badge>
        </div>
      </Card>
    </div>
  )
}
```
