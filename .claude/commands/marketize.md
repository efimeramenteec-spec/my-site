---
description: Monday marketing protocol — import the weekly Meta CSV and deliver the briefing
---

Run the weekly `/marketize` protocol. **Full spec: `MARKETING-CONSULTORIO-2026.md` §3 — read it first.**

1. **Ask Nicolás for this week's CSV** (Meta saved report `EFIMERAMENTE-SEMANAL`, Exportar → CSV).
   Do NOT try to download it yourself (Gmail/Chrome/Downloads) — Meta's email only carries
   login-gated links. Wait for him to attach the file (cloud session) or give the path (Mac).
   A manual export without the report-date column is fine — the importer restores the week
   from the filename (`EFIMERAMENTE-SEMANAL-<Mes>-<D>-<Año>-<Mes>-<D>-<Año>.csv`). If an
   attachment lost that filename, rename the copy to that pattern before importing.
   Never re-import `EFIMERAMENTE-BACKFILL.csv` (see §6).
2. **Run the importer:** `node scripts/marketize-import.mjs <ruta-del-csv>`
   (`--dry-run` first if anything looks off). Needs `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
   from `.env` (Mac) or the cloud environment's variables. Run `npm install` first if
   `node_modules` is missing.
3. **Deliver the briefing** the script prints (funnel, historic KPIs, 🔴🟡🟢 flags, llamadas sin
   seguimiento) with a short interpretation in Spanish. Flag any campaign-window overlap
   warnings and point to /marketing → Campañas → "Editar fechas" if one needs fixing.
