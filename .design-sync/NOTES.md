# Efimeramente DS — Design Sync Notes

## Repo quirks (re-sync must know)

- **No TypeScript**: project is pure JSX (`.jsx`). No `.d.ts` files exist. Component discovery depends entirely on `componentSrcMap` and prop contracts on `dtsPropsFor`. **If you add a new component, add it to BOTH `componentSrcMap` AND `dtsPropsFor` in config.json.**
- **`[DTS_REACT]` fires on every build** — harmless. `@types/react` is in `.ds-sync/node_modules/` (installed for the converter) but not in the repo's `./node_modules`, so the repo-side scan warns. All props are hand-specified via `dtsPropsFor`, so nothing relies on the React type resolution.
- **CSS build**: `src/lib.js` imports `./index.css` so `npm run build:lib` emits `dist/efimeramente-ds.css`. Do not remove that import.
- **Chetta Vissto font**: `[FONT_DANGLING]` fires on every build — non-blocking. The `@font-face` rule references `/fonts/ChettaVissto.woff2` which doesn't exist in the repo (custom purchased font). Falls back to Playfair Display gracefully. To fix: obtain the woff2 and place at `public/fonts/ChettaVissto.woff2`, then add the font via `cfg.extraFonts`.
- **Button cardMode**: `overrides.Button: {"cardMode": "column"}` is required — the multi-button stories overflowed the grid cell width.
- **Playwright**: render check used playwright 1.61.1 with chromium build 1228 from `~/Library/Caches/ms-playwright/`. On a fresh machine, `npx playwright install chromium` installs it.
- **npm cache permission**: npm's cache may need `--cache /tmp/npm-cache` flag if the default cache is root-owned.

## Known render warns

- `[FONT_DANGLING] "chetta vissto"` — expected, see above. Non-blocking.
- `[FONT_REMOTE]` for Google Fonts families — expected, served via CDN.

## Re-sync risks

- **Adding components**: must add to `componentSrcMap` AND `dtsPropsFor`. The auto-discovery pipeline is disabled (no .d.ts).
- **Renaming source files**: `componentSrcMap` paths will break — update them before rebuilding.
- **Tailwind class additions**: if new brand-token classes are added to the Tailwind config, update the family table in `conventions.md` so the design agent learns the new vocabulary.
- **Preview content**: authored `.tsx` files use static data and rely on specific Tailwind classes being available at render time. If a class is removed from the config, the preview card may render unstyled silently.
- **Chetta Vissto font**: if the font is self-hosted in the future, wire it via `cfg.extraFonts` and remove from Known render warns.

## Re-sync command

```bash
# From repo root, after re-running npm run build:lib:
node .ds-sync/resync.mjs \
  --config .design-sync/config.json \
  --node-modules ./node_modules \
  --entry ./dist/efimeramente-ds.es.js \
  --out ./ds-bundle \
  --remote .design-sync/.cache/remote-sync.json
```

(Fetch the remote anchor first: `DesignSync(get_file, path: "_ds_sync.json")` → save to `.design-sync/.cache/remote-sync.json`.)
