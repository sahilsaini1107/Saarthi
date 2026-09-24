# Saarthi — Personal Life OS

**Wealth · Growth · Reflection** — one self-hosted app for money, training, learning and reflection.

Today-first, goal-first, and built so every manual entry takes under ten seconds. Your data lives in **one SQLite file on your own machine** — no third-party database, no bank aggregation, no telemetry.

> **सारथी** *(saarthi)* — the charioteer. Not the one who runs the race, the one who keeps you pointed the right way.

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js 16">
  <img src="https://img.shields.io/badge/React-19-61dafb" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6" alt="TypeScript strict">
  <img src="https://img.shields.io/badge/Prisma-6-2d3748" alt="Prisma 6">
  <img src="https://img.shields.io/badge/tests-836%20passing-brightgreen" alt="836 tests">
</p>

---

## Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Hosting it](#hosting-it)
- [Where is the database?](#where-is-the-database)
- [Screens](#screens)
- [How it is built](#how-it-is-built)
- [Testing](#testing)
- [Scripts](#scripts)
- [Security & privacy](#security--privacy)
- [Troubleshooting](#troubleshooting)

---

## What it does

### 💰 Wealth

| Feature | What you get |
|---|---|
| **Accounts** | Savings, cash and credit cards with limits, statement/due days and automatic utilisation |
| **Transactions** | Day-grouped ledger, filters by account/category/month/type, running balance |
| **Quick-Add** | Global FAB with a big amount pad and recent-first category chips — two taps to save |
| **Fixed & recurring deposits** | Simple and compound maturity maths, month-end clamping, a 30/15/7/1 reminder ladder, maturity timeline |
| **Investments** | Stocks, bonds, crypto, mutual funds, ETFs, gold, REITs, PPF, NPS — weighted-average cost, realised P&L, price history with sparklines |
| **Assets** | Real estate, vehicles, jewellery and the rest, stored as 64-bit paise so crore-scale values stay exact |
| **Bills & subscriptions** | Monthly/quarterly/annual/custom recurrence that never drifts across month lengths, mark-as-paid creates exactly one linked transaction |
| **Insurance** | Term, health, life, vehicle and asset policies with premium recurrence and a renewal ladder |
| **Budgets** | Monthly cap per category with calendar-pace bands, month-end projection and a safe-per-day figure |
| **Net worth** | Daily snapshots, forward-filled trend, 7-day and 30-day deltas |
| **Portfolio planner** | *Every rupee has a job* — six job buckets with guideline ranges, drift alerts, rebalancing moves, a coupon calendar, DICGC ₹5L exposure and credit-rating guidance |
| **Travel** | Trips with date-derived phase, optional budget and trip-attributed expenses |
| **Capture** | Paste a message, speak it, or photograph a receipt — a deterministic parser runs first and an LLM only fills the gaps. CSV import with per-row errors and duplicate detection |

### 📈 Growth

| Feature | What you get |
|---|---|
| **Habits** | Weekday schedules as a 7-char bitstring, streaks with a grace rule, 66-day building bar, heatmap |
| **Routines** | Chain steps into a guided flow with a play mode |
| **Goals** | Goal → milestone → task with rolled-up progress, target-date health chips, drag-and-drop milestones, GitHub-style effort grids and a per-milestone journal |
| **Study** | Courses with bulk syllabus import, a pacing engine (expected vs actual, projected finish) and a `[3,7,14,30,90]` revision ladder |
| **Strength coach** | Training plans with rotation, a set-by-set session logger with last-set prefill, estimated-1RM progression charts, and six presets (Foundation A/B, Full Body 3×, Upper/Lower, Push/Pull/Legs, core flow, mobility) |
| **Food library & thali builder** | Configure a food once per 100 g / 100 ml / piece, then compose a plate and get exact calories, protein, carbs, fat and fibre — with each ingredient's share of the total |
| **Body composition** | The full smart-scale panel — body fat, muscle mass and rate, skeletal muscle, body water, bone mass, visceral and subcutaneous fat, BMR, metabolic age and more — plus BMI, lean mass and BMR derived for you |
| **Daily check-in** | The questions a coach asks each day, reading weight, protein and training from the screens that already own them and asking only for the gaps. Produces a training-readiness verdict |
| **Progress photos** | Dated, by pose, with a before/after compare that snapshots your weight at the time |
| **Skin** | AM/PM check-ins with an either-or streak, plus a product shelf with a PAO expiry ladder |
| **Library** | EPUB/PDF reader in-app with highlights, bookmarks, notes and reading sessions |
| **Skills · People · Content · Ideas** | XP-per-practice-minute skill levels; a reconnect engine for people with cadence tracking; a private content library for YouTube and articles; an ICE-ranked ideas lab |

### 🧘 Reflection

| Feature | What you get |
|---|---|
| **Journal** | Templates, search, filters and mood tracking |
| **Life Principles** | Your personal constitution with a daily kept/broken/n-a review, trigger notes and adherence maths |
| **Life Score** | A three-pillar composite from measured components — missing data is skipped, never punished |
| **Insights** | A deterministic rule engine: budget overruns, category jumps, streak milestones, savings rate, at-risk courses, maturities |
| **Reports** | Per-domain reports over any window, plus a monthly Life Report, printable to PDF |
| **Gamification** | XP derived from real activity, a level curve, and deterministic badges |

---

## Quick start

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Bun** *(recommended)* | 1.1+ | the repo ships `bun.lock`, and the production `start` script uses Bun |
| **or Node.js** | ≥ 20.9 (LTS 22 is fine) | required by Next.js 16 — use `npm` / `npx` in place of `bun` |
| *(no database to install)* | — | SQLite is a file; `db:push` creates it. See [Where is the database?](#where-is-the-database) |

macOS and Linux work as-is. On **Windows**, use WSL2 or Git Bash: the `dev` and `start` scripts pipe through `tee`, which `cmd.exe` does not have. (Or run `npx next dev -p 3000` directly.)

### 1. Clone and install

```bash
git clone https://github.com/sahilsaini1107/Saarthi.git
cd Saarthi
bun install          # or: npm install
```

### 2. Configure the environment

```bash
cp .env.example .env
```

`DATABASE_URL` is the only variable the app needs, and the default is already right:

```
DATABASE_URL="file:../db/custom.db"
```

> The path is relative to **`prisma/schema.prisma`**, not the project root. That is why it starts with `../`.

There is no database server to install, no connection string to fetch, and no account to create. SQLite is a file, and `db:push` makes it in the next step.

Nothing else is required. Authentication is scrypt plus session tokens handled in-app, and the password vault's crypto runs entirely in your browser.

### 3. Create the schema

```bash
bun run db:generate          # prisma generate → Prisma client
bun run db:push              # prisma db push → creates db/custom.db
```

This project uses the **`db push`** workflow — there is no `migrations/` folder. There is also no seed step: the twelve default expense categories are created per user at registration.

### 4. Run it

```bash
bun run dev
```

Open **http://localhost:3000**, register with an email and password (no verification step), and you land on the Today screen.

- Microphone capture works on `localhost` without HTTPS.
- To reach it from your phone on the same Wi-Fi, use `http://<your-lan-ip>:3000`. The mic will be blocked over plain HTTP — that is a browser rule, not a bug.

That is the whole setup. When you are ready to run it somewhere permanent rather than on your laptop, see [Hosting it](#hosting-it) — there is no cloud account to create and no database to provision.

---

## Hosting it

**Serverless hosts cannot run this app.** Vercel, Netlify Functions and friends give each request an ephemeral, read-only filesystem, so a writable SQLite file has nowhere to live — writes vanish between requests, and concurrent instances would each see a different database. That is a deliberate trade: the app keeps a single file you own instead of renting a database from someone.

Host it on anything with a **real disk** instead.

| Option | Notes |
|---|---|
| **A box at home** (mini PC, Pi, spare laptop) | Truly local. Reach it from your phone over [Tailscale](https://tailscale.com) or a Cloudflare Tunnel — no public exposure, no cloud. |
| **A small VPS** (Hetzner, DigitalOcean — ~$5/mo) | Always on, public HTTPS. The included `Caddyfile` handles certificates. |
| **Railway / Render / Fly.io** | Easiest managed option, but you **must** attach a persistent volume and point `DATABASE_URL` at a path on it, or the file is wiped on every deploy. |

### Running the production build

```bash
bun run build        # standalone build, copies static assets and public/
bun run start        # NODE_ENV=production bun .next/standalone/server.js
```

That serves on port 3000. Put Caddy or nginx in front for HTTPS; the bundled `Caddyfile` is a working starting point.

### If you ever want to go serverless anyway

The schema is 1:1 portable to Postgres. Change `provider` in `prisma/schema.prisma` to `postgresql`, add `mode: 'insensitive'` to the two `contains` filters in `services/fitness.ts` and `services/food.ts` (SQLite's `LIKE` is case-insensitive by default; Postgres's is not), point `DATABASE_URL` at any Postgres, and run `db:push`. Every service already scopes queries by user, which is the hard part of that move.

Note that photo uploads travel as base64 inside JSON, and serverless platforms cap request bodies (~4.5 MB on Vercel). Photos are already compressed in the browser to land well under that — see `src/lib/image-compress.ts`.

## Where is the database?

**One file: `db/custom.db`** at the project root, created by `bun run db:push`.

```
Saarthi/
├── db/
│   └── custom.db        ← everything lives here
├── prisma/
│   └── schema.prisma    ← the shape of it
└── src/
```

Everything is inside that single file, including binary uploads — book EPUBs and PDFs, content-library files, exercise form photos and progress photos. **There is no separate media folder** and no object storage to configure.

### It is deliberately not in this repository

`db/` is listed in `.gitignore`. A database file would otherwise publish password hashes, every transaction, account balances, journal entries, body measurements and progress photos to GitHub the moment you pushed.

So a fresh clone has **no** `db/custom.db` — `bun run db:push` creates an empty one, and you register a new account.

### Backing it up

Stop the server and copy the file:

```bash
cp db/custom.db ~/backups/saarthi-$(date +%F).db
```

Restoring is the same copy in reverse. Moving to a new machine means carrying that one file. It is worth putting that copy on a schedule — it is the only thing standing between you and losing everything.

### Starting fresh

```bash
# stop the dev server first
rm db/custom.db
bun run db:push
```

### Moving it elsewhere

Point `DATABASE_URL` at any path you like, remembering that a relative path resolves from `prisma/`:

```
DATABASE_URL="file:/absolute/path/to/saarthi.db"
```

Useful when the file should live on a mounted volume — which is exactly what Railway/Render/Fly need (see [Hosting it](#hosting-it)).

## Screens

The app is a **hash-routed SPA** — one Next.js page with client-side routing — so every screen is deep-linkable.

| Area | Routes |
|---|---|
| **Today** | `#/today` |
| **Money** | `#/money` · `/overview` · `/transactions` · `/accounts` · `/fds` · `/invest` · `/bills` · `/budgets` · `/insurance` · `/planner` · `/travel` · `/capture` · `/import` |
| **Growth** | `#/growth` · `/habits` · `/routines` · `/goals` · `/study` · `/skills` · `/people` · `/content` · `/ideas` · `/library` · `/quotes` · `/principles` · `/skin` |
| **Fitness** | `#/growth/fitness` · `/food` · `/session/:id` |
| **Body** | `#/growth/body` · `/photos` |
| **Check-in** | `#/growth/checkin` |
| **Reflection** | `#/journal` · `#/reports` |
| **Other** | `#/settings` · `#/styleguide` *(design system gallery, no login needed)* |

---

## How it is built

```
src/
├── app/api/          thin route handlers — zod validation, nothing else
├── services/         all database access, user-scoped on every query
├── lib/              pure functions: maths, no clock, no DB, heavily tested
├── components/
│   ├── screens/      one file per screen
│   ├── ui/           design system primitives
│   └── fitness · body · food · money · …
└── hooks/queries.ts  TanStack Query hooks and cache keys
```

**Stack** — Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 · shadcn/ui · Prisma 6 + SQLite · TanStack Query · Recharts · Vitest.

### Conventions worth knowing

These are the rules that keep the numbers trustworthy:

- **Money is integer paise.** Aggregates are computed in JS, which is exact far beyond any realistic amount. Large tables (assets, investments) use 64-bit paise so crore-scale values do not overflow.
- **Measurements are integer milli-units.** 72.5 kg is `72500`; 20.5 g of protein is `20500`. No float ever reaches the database, and half portions stay exact.
- **Dates are UTC midnight**, representing the user's calendar day. "Today" derives from the user's timezone setting.
- **Pure maths lives in `lib/`** with an injectable clock. Nothing there reads `Date.now()`, which is why the date-sensitive logic is testable.
- **A missing value is never zero.** Averages skip unanswered days rather than dragging themselves down; a metric with no defensible reference range shows no verdict at all rather than an invented "normal".
- **Derived values never overwrite logged ones.** BMI, lean mass and BMR fill only the cells you have not measured, and are labelled `calculated`.
- **A logged meal is a snapshot.** Recipe totals recompute from their ingredients forever, but editing a food never rewrites what you ate last Tuesday.

---

## Testing

```bash
bun run test          # vitest run — 46 suites, 836 unit tests
bun run test:watch
```

The suites cover the pure `lib/` modules: money and deposit maths, recurrence across month lengths and leap years, habit streaks, budget pace bands, portfolio drift and coupon calendars, 1RM and progression, nutrition merging, food scaling, body composition and health bands, coach target tables, check-in readiness, plate composition, plate maths, rest timers and workout history.

```bash
bun run lint          # eslint
npx tsc --noEmit      # typecheck
bun run format        # prettier
```

---

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | dev server on :3000, logs to `dev.log` |
| `bun run build` | standalone production build |
| `bun run start` | serve the production build |
| `bun run lint` · `format` | eslint · prettier |
| `bun run test` · `test:watch` | vitest |
| `bun run db:generate` | regenerate the Prisma client |
| `bun run db:push` | sync the schema into `db/custom.db` |
| `bun run db:reset` | drop and recreate — **destroys all data** |

> **After any `db:push`, restart the dev server.** `db push` regenerates the Prisma client, but a running `next dev` keeps the old one in memory and new models read as `undefined`.

---

## Security & privacy

- **No analytics, no telemetry, no bank aggregation.** The only outbound calls Saarthi itself makes are the optional AI capture endpoints, and only when you use them. Your data goes to exactly one place: a file on a disk you control.
- **Passwords** are hashed with scrypt. Sessions are database-backed tokens in an httpOnly cookie, with `Authorization: Bearer` as a fallback for iframe and third-party-cookie restrictions. You can list your devices and revoke sessions from Settings.
- **The password vault is zero-knowledge.** PBKDF2-SHA256 (310k iterations) and AES-256-GCM run in your browser via WebCrypto. The server stores ciphertext and a verifier blob and can never decrypt them. **There is no recovery** — losing the master password means losing the vault.
- **Progress photos** are stored inside your own SQLite file, served only to your signed-in session with `Cache-Control: private, no-store`.
- **Rate limiting** on auth and capture endpoints, plus security headers.
- **Every query is user-scoped** at the service layer — the app-level equivalent of row-level security. True Postgres RLS policies can be layered on top of this later; they are not required for correctness, since every query already filters by the signed-in user.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `You must provide a nonempty URL` / `PrismaClientInitializationError` on boot | `.env` is missing or empty — `cp .env.example .env` |
| Data vanishes after every deploy | The host has an ephemeral filesystem. Attach a persistent volume and point `DATABASE_URL` at it, or move off serverless — see [Hosting it](#hosting-it) |
| A new model reads as `undefined` | Restart the dev server after `db:push` — it regenerates the Prisma client, but a running `next dev` keeps the old one in memory |
| `tee: command not found` | You are in `cmd.exe` — use WSL2 or Git Bash, or run `npx next dev -p 3000` |
| Port 3000 is busy | `bun run dev -- -p 3001` |
| A photo still will not upload | Photos are compressed in-browser before upload; if one still fails, it is likely an unsupported format the browser cannot decode (some HEIC files) — re-save it as JPEG |
| Uploaded books or photos vanished | They live inside `db/custom.db` — if you deleted it for a fresh start, they went with it |
| Schema changed after pulling | Re-run `bun run db:push` |
| Want to wipe everything | `bun run db:reset`, or point `DATABASE_URL` at a fresh empty database and `bun run db:push` |

---

## Status

All phases complete through **Phase 24**. Full development history, including every design decision and the reasoning behind it, is in [`PROGRESS.md`](PROGRESS.md); the task breakdown is in [`TASKS.md`](TASKS.md).

## License

Personal project — no license granted for redistribution.
