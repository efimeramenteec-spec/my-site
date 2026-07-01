# Efimeramente Dashboard — State File

> **Read `CLAUDE.md` first** — it's the stable architecture/orientation doc (auto-loaded each session).
> This file is the **living backlog + session log** only. As of 2026-07-01 the workflow is simplified to a
> **single clone** (`~/my-site`) worked directly with Claude Code; the "two-clone / Cowork / spawn-Opus"
> protocol in the sections below is **retired** — kept only for historical context.

## Project Overview
- **Stack:** React + Vite frontend, Supabase backend, Netlify serverless functions
- **Live URL:** https://efimeramente-panel.netlify.app (renamed session #9; Supabase Auth site URL updated to match)
- **GitHub repo:** github.com/efimeramenteec-spec/my-site
- **Supabase project ID:** vnityzpuhnkumsyfnskz
- **Netlify function:** `/.netlify/functions/calendar`

## Key Files
- `src/lib/queries.js` — core data layer: `buildCalendarEvent`, `callCalendar`, `createSession`, `updateSession`, `checkFreebusy`
- `netlify/functions/calendar.js` — serverless Google Calendar API bridge (actions: create, update, delete, freebusy)
- `src/lib/conflicts.js` — session conflict detection (Supabase only)
- `src/features/sesiones/SesionDrawer.jsx` — new/edit session drawer; `checkFreebusy` wired in (debounced 350ms, amber warning)

## Google Calendar Sync

### Setup
- Service account: `efimeramente-calendar@efimeramente-dashboard.iam.gserviceaccount.com`
- Key stored in Netlify env var: `GOOGLE_SERVICE_ACCOUNT_KEY` (base64-encoded)
- Each therapist must share their Google Calendar with the service account
- `calendar_email` column on `therapists` table = therapist Gmail = their Calendar ID
- `google_event_id` column on `sessions` table stores the synced Calendar event ID

### Event Title Format
`Sesión — {patient name} · {En línea | Presencial}`

### Conflict Detection
- App checks conflicts against Supabase sessions (via `conflicts.js`)
- `checkFreebusy` checks Google Calendar for external busy periods (wired into SesionDrawer, debounced 350ms, non-blocking, amber inline warning)
- `TZ_OFFSET = '-05:00'` in queries.js (Ecuador, no DST)

### Therapist Calendar Status
| Therapist | calendar_email | Synced |
|---|---|---|
| Camila Maya | camimaya22@gmail.com | ✅ yes |
| Carolina Almeida | carolinnalmeidaa@gmail.com | ✅ yes |
| Daniela Espinosa | daniela.espinosa.psic@gmail.com | ✅ yes |
| Francisco Mena | rfmena1@gmail.com | ✅ yes |
| Maria Gracia Villalba | mariamariavc8@gmail.com | ✅ yes |
| Mariana Villegas | marianavillegaskraemer@gmail.com | ✅ yes |

## Completed Features
- [x] Sesiones calendar view (week/month/list)
- [x] Create/edit/cancel sessions with Google Calendar sync
- [x] Conflict detection (Supabase) + Google Calendar freebusy check in drawer
- [x] All 6 therapists have calendar_email set in Supabase
- [x] Pacientes module (list, detail, create, expediente)
- [x] Auth (login, RLS, role-gated routes — owner + 6 therapist accounts)
- [x] Dashboard (KPIs, upcoming sessions, weekly chart)
- [x] `SUPABASE_SERVICE_KEY` (legacy service_role JWT) saved in `~/my-site/.env` — Opus agent can do Supabase writes autonomously
- [x] Session `estado` DB default changed to `'programada'` (was `'confirmada'`) — SQL: `ALTER TABLE sessions ALTER COLUMN estado SET DEFAULT 'programada'`
- [x] ListView defaults to upcoming sessions (fecha >= today), "Ver historial" toggle reveals past sessions sorted newest-first — commit 275baf5
- [x] Session cards colored by therapist (was estado) in WeekView/MonthView — commit 71bb26e
- [x] Estado/pagado synced from Google Sheet (session #9) — 42 sessions updated: 26 marked paid, 14 cancelled, 2 confirmed. Guarded: never downgrades confirmada→programada (blank sheet cell = leave as-is) and never un-pays. One-off via `sync-estados.js` (+ `Sesiones_Consultorio.xlsx`), both now gitignored (PII); `xlsx` is a devDependency

- [x] **WhatsApp reminder system deployed + verified end-to-end** (2026-07-01). Root cause of the day's broken deploys found (with Cowork): Netlify functions ran in AWS **Lambda-compat mode**, whose **4KB combined env-var limit** was exceeded (mostly the ~3.2KB `GOOGLE_SERVICE_ACCOUNT_KEY`), so every deploy since ~yesterday failed at the Deploying stage and Netlify kept serving a stale build — which is why `send-reminders` reported "Supabase key missing" despite the key being set. **Fix:** migrated all three functions to the **modern runtime** (`.mjs`, `export default (req)=>Response`), which runs off Lambda and removes the 4KB cap. Shared logic → `netlify/lib/whatsapp.mjs`. `send-reminders` is now cron-only (`export const config`); the `?test_session_id` manual path + health probe moved to `twilio-webhook`. Verified live: test send → real WhatsApp received; **Confirmo → `confirmada`**, **Cancelar → `cancelada`** both confirmed. Remaining to go fully live: set `REMINDERS_LIVE=true` in Netlify.

## Pending / Backlog

### Immediate — next session
- [x] ~~Update calendar function CORS~~ — done session #9 (commit becec56): added `https://efimeramente-panel.netlify.app` to `ALLOWED_ORIGINS` (new domain first). Verify after deploy: create/edit a session on the live site, confirm the Calendar event appears and the amber freebusy warning shows on overlap.
- [ ] **Verify live fixes** — create a test session, confirm it appears in Lista as "Pend." immediately
- [x] ~~Sync session estados from Google Sheet~~ — done session #9 (see Completed Features)

### Next modules (confirm with Nicolas before starting)
- [ ] **Seguimiento** — analytics: retention, sessions/therapist/month, no-show rate, pending payments (recharts)
- [ ] **Finanzas** — facturas ledger, monthly totals, mark-as-paid
- [x] ~~**Twilio webhook**~~ — DONE (commits 8a8f47c, fc84adb). Full WhatsApp reminder flow shipped: hourly `send-reminders.js` (kill-switch `REMINDERS_LIVE`, default OFF/dry-run + `?test_session_id` manual path) + inbound `twilio-webhook.js` (button tap → session estado) + `supabase/add-reminder-sent-at.sql` migration. See CLAUDE.md § Netlify functions.
- [ ] **Trim therapist Sesiones view** — hide pay/confirm toggles and owner-only filters from therapist role

### Known data issue
- Seed sessions imported from the old Google Sheet originally all had `estado = 'confirmada'`. Session #9 ran the guarded sync (`sync-estados.js`): 240 of 316 sessions matched by patient+date, 42 corrected (26 paid, 14 cancelled, 2 confirmed). 76 had no sheet match (left untouched); 14 confirmada→programada downgrades and 1 un-pay were intentionally skipped (blank sheet cell = leave as-is). Re-runnable if the sheet changes.

## Working Protocol

### Agent spawning
- Cowork (Sonnet) = project manager only: reads state, coordinates, writes prompts, updates .md
- **Spawn Opus agents freely** for any code task — Opus is better at heavy lifting
- Cowork can spawn agents at any model (opus, sonnet, haiku) as needed

### Nicolas's role — simple
- Nicolas works exclusively in Cowork chat. Screenshots go here. Decisions happen here.
- The ONLY thing Nicolas does in the Claude Code terminal is paste a single `git push` command when Cowork tells him to. Nothing else.
- Cowork gives Nicolas the exact command to paste. Nicolas does not need to know git.

### Push workflow — TWO CLONES, clear roles
- **`~/my-site`** = the canonical git repo. All pushes happen from here. Claude Code terminal has SSH credentials here.
- **`~/Claude/Projects/New Efimeramente App 3`** = Cowork workspace. Opus agents write code here (sandbox-mounted). No network access from sandbox — cannot push directly.
- **Correct flow:** Cowork Opus writes code to `New Efimeramente App 3` → tell Nicolas to paste in Claude Code terminal: `cd "/Users/nicolasdelatorre/Claude/Projects/New Efimeramente App 3" && git push origin main` — but ONLY after Claude Code agent has ported the change cleanly to `~/my-site` first (see two-clone divergence issue from session #8).
- **Safer flow (avoids divergence):** Have Claude Code agent pull the changed file directly from the `New Efimeramente App 3` path, apply it to `~/my-site`, build, and push — all in one Claude Code prompt.
- If the two clones diverge: port only the changed file(s) into `~/my-site` (do NOT rebase or force-push)
- Build before every push: `vite build --emptyOutDir false` — fix errors before committing
- **Never use GitHub web editor CM6 injection** — no build verification, risk of bad commits

### Supabase writes
- Use `SUPABASE_SERVICE_KEY` from `~/my-site/.env` (legacy service_role JWT, role: service_role)
- Opus agent reads it in-process, never prints it
- Grants already applied: service_role has full access to all public tables

### DB grants (already applied)
```sql
-- anon + authenticated
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
-- service_role
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
```

### ⚠️ Gmail vs App login — never confuse these
- **App login:** `@efimeramente.ec` addresses (e.g. `mariana@efimeramente.ec`)
- **Google Calendar sync:** personal Gmails in `therapists.calendar_email`
- Always confirm Gmail addresses with Nicolas before setting — never infer or guess

## Session Management (Self-Preservation Protocol)

### At the end of every session
1. Update this file with completed items, new pending items, changed technical details
2. Commit updated file to GitHub via Opus agent (`git push` from `~/my-site`)
3. At start of next session, fetch from: https://raw.githubusercontent.com/efimeramenteec-spec/my-site/main/EFIMERAMENTE_STATE.md

### When to compact and start a new session
Suggest compacting when ANY of these apply:
- A full feature/module is completed
- Context is getting long or responses feel slower
- Switching to a different type of task
