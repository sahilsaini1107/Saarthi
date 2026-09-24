# Saarthi — Personal Life OS

**Wealth · Growth · Reflection** — one self-hosted app for money, training, learning and reflection.

Today-first, goal-first, and built so every manual entry takes under ten seconds. Your data lives in your own Postgres database — self-hosted or a free hosted tier — with no bank aggregation and no telemetry.

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
- [Deploying to Vercel](#deploying-to-vercel)
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
| **A Postgres database** | any | a free [Neon](https://neon.tech) or [Supabase](https://supabase.com) project takes under a minute, or run one locally — see [Where is the database?](#where-is-the-database) |

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

`DATABASE_URL` is the only variable the app needs — a standard Postgres connection string:

```
DATABASE_URL="postgresql://user:password@host:5432/saarthi?sslmode=require"
```

Get one in under a minute from [Neon](https://neon.tech) or [Supabase](https://supabase.com) (both have a free tier and hand you a ready-made connection string), or run Postgres yourself:

```bash
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name saarthi-db postgres:16
# then: DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saarthi"
```

Nothing else is required. Authentication is scrypt plus session tokens handled in-app, and the password vault's crypto runs entirely in your browser.

### 3. Create the schema

```bash
bun run db:generate          # prisma generate → Prisma client
bun run db:push              # prisma db push → creates the tables
```

This project uses the **`db push`** workflow — there is no `migrations/` folder. There is also no seed step: the twelve default expense categories are created per user at registration.

### 4. Run it

```bash
bun run dev
```

Open **http://localhost:3000**, register with an email and password (no verification step), and you land on the Today screen.

- Microphone capture works on `localhost` without HTTPS.
- To reach it from your phone on the same Wi-Fi, use `http://<your-lan-ip>:3000`. The mic will be blocked over plain HTTP — that is a browser rule, not a bug.

### 5. Production build *(optional, for self-hosting)*

```bash
bun run build        # standalone build, copies static assets and public/
bun run start         # NODE_ENV=production bun .next/standalone/server.js
```

`Caddyfile` is only used by a hosted HTTPS preview; you do not need it locally. For deploying to Vercel instead of self-hosting, see the next section.

---

## Deploying to Vercel

Vercel's serverless functions have an **ephemeral, read-only filesystem** — they cannot hold a writable SQLite file, which is why the app runs on Postgres rather than the `db/custom.db` file used for local development in earlier versions of this README. If you are seeing

```
Error validating datasource `db`: You must provide a nonempty URL.
```

it means step 2 below has not been done yet — `DATABASE_URL` is not set in the Vercel project.

### 1. Get a Postgres database

Any works: [Neon](https://neon.tech), [Supabase](https://supabase.com) or [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres) all have a free tier built for exactly this. Copy the connection string it gives you.

### 2. Set the environment variable

In the Vercel project → **Settings → Environment Variables**, add:

| Key | Value | Environments |
|---|---|---|
| `DATABASE_URL` | the connection string from step 1 | Production, Preview, and Development |

Redeploy after adding it — Vercel only picks up new env vars on the next build.

### 3. Push the schema once

Vercel's build step regenerates the Prisma **client** automatically (`postinstall` runs `prisma generate`), but it does not create your tables — that only needs to happen once. From your own machine, pointed at the same `DATABASE_URL` you gave Vercel:

```bash
DATABASE_URL="<your Vercel connection string>" bun run db:push
```

After that, redeploy (or trigger the deploy that is already queued) and the app will boot.

### Photo uploads and the request-body cap

Serverless functions on Vercel cap request bodies at roughly **4.5 MB**, and photos travel to the API as base64 inside JSON — which inflates them by a third. A 4 MB phone photo would arrive as ~5.3 MB of request body and be rejected by the platform before the route handler ever ran.

So photos are **resized and re-encoded in your browser before upload** (`src/lib/image-compress.ts`): longest side capped at 1600 px, JPEG quality stepped down until the result is under 2.5 MB, which base64s to ~3.3 MB. A 14 MB source lands at well under 1 MB in practice. The form shows the reduction (“Compressed 13.9 MB → 753 KB”) so nothing happens invisibly.

Two things worth knowing about how this is done:

- **EXIF rotation is applied explicitly.** Canvas `drawImage` ignores a JPEG's EXIF Orientation tag, and browsers disagree on whether `createImageBitmap` honours it — so re-encoding naively would silently rotate photos that every other app shows upright. The tag is parsed and the rotation applied by hand, with `imageOrientation: 'none'` taking the browser out of the decision.
- **The server limits did not move.** The 5 MB and 8 MB service-layer ceilings still stand. Compression is a client-side courtesy, not the security boundary — a hostile client can still post whatever it likes and still gets rejected.

---

## Where is the database?

**A Postgres database** — hosted (Neon, Supabase, Vercel Postgres, your own server) or local, whichever `DATABASE_URL` in your `.env` points at. There is no bundled database file to find; a fresh clone has nothing until you run `bun run db:push` against wherever you have pointed it.

Everything lives in that database, including binary uploads — book EPUBs and PDFs, content-library files, exercise form photos and progress photos are all columns in Postgres tables. **There is no separate media folder or object-storage bucket** to configure.

### `.env` is never committed

`.env*` is listed in `.gitignore` (with `.env.example` explicitly un-ignored, since that is the reference template). Your connection string — and by extension every password hash, transaction, account balance, journal entry, body measurement and progress photo behind it — never reaches GitHub.

### Backing it up

Postgres tooling handles this, not a file copy:

```bash
pg_dump "$DATABASE_URL" > backup-$(date +%F).sql
```

Restore with `psql "$DATABASE_URL" < backup-2026-09-24.sql` against a fresh database.

Neon and Supabase both also offer point-in-time restore and automatic backups from their dashboards — usually the easier path if you are on one of them.

### Starting fresh

```bash
bun run db:reset      # prisma migrate reset — drops and recreates every table
```

Or point `DATABASE_URL` at an entirely new, empty database and run `bun run db:push`.

### Local Postgres instead of a hosted one

```bash
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name saarthi-db postgres:16
```

Then set `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saarthi"` and run `bun run db:push` as usual.

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

**Stack** — Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 · shadcn/ui · Prisma 6 + Postgres · TanStack Query · Recharts · Vitest.

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
| `bun run db:push` | sync the schema into Postgres |
| `bun run db:reset` | drop and recreate — **destroys all data** |

> **After any `db:push`, restart the dev server.** `db push` regenerates the Prisma client, but a running `next dev` keeps the old one in memory and new models read as `undefined`.

---

## Security & privacy

- **No analytics, no telemetry, no bank aggregation.** The only outbound calls Saarthi itself makes are the optional AI capture endpoints, and only when you use them. Your data goes to exactly one place — the Postgres database `DATABASE_URL` points at, which is yours whether that is a laptop, your own server, or a hosted provider you chose.
- **Passwords** are hashed with scrypt. Sessions are database-backed tokens in an httpOnly cookie, with `Authorization: Bearer` as a fallback for iframe and third-party-cookie restrictions. You can list your devices and revoke sessions from Settings.
- **The password vault is zero-knowledge.** PBKDF2-SHA256 (310k iterations) and AES-256-GCM run in your browser via WebCrypto. The server stores ciphertext and a verifier blob and can never decrypt them. **There is no recovery** — losing the master password means losing the vault.
- **Progress photos** are stored inside your own Postgres database, served only to your signed-in session with `Cache-Control: private, no-store`.
- **Rate limiting** on auth and capture endpoints, plus security headers.
- **Every query is user-scoped** at the service layer — the app-level equivalent of row-level security. True Postgres RLS policies can be layered on top of this later; they are not required for correctness, since every query already filters by the signed-in user.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `You must provide a nonempty URL` / `PrismaClientInitializationError` on boot | `.env` is missing, empty, or `DATABASE_URL` isn't set — locally, check `.env`; on Vercel, check Settings → Environment Variables and redeploy after adding it |
| `the URL must start with the protocol file:` (and the error shows `provider = "sqlite"`) | Your host is building an **old commit**. `main` uses `postgresql`; a short-lived commit used `sqlite`. Redeploy from the latest commit — on Vercel, Deployments → the newest one → Redeploy, and check it is building the current `main` SHA |
| `the URL must start with the protocol postgresql://` | `DATABASE_URL` is set but not a Postgres connection string — copy the exact string your provider gave you |
| A new model reads as `undefined` | Restart the dev server after `db:push` — it regenerates the Prisma client, but a running `next dev` keeps the old one in memory |
| `tee: command not found` | You are in `cmd.exe` — use WSL2 or Git Bash, or run `npx next dev -p 3000` |
| Port 3000 is busy | `bun run dev -- -p 3001` |
| A photo still will not upload | Photos are compressed in-browser before upload; if one still fails, it is likely an unsupported format the browser cannot decode (some HEIC files) — re-save it as JPEG |
| Schema changed after pulling | Re-run `bun run db:push` |
| Want to wipe everything | `bun run db:reset`, or point `DATABASE_URL` at a fresh empty database and `bun run db:push` |

---

## Status

All phases complete through **Phase 24**. Full development history, including every design decision and the reasoning behind it, is in [`PROGRESS.md`](PROGRESS.md); the task breakdown is in [`TASKS.md`](TASKS.md).

## License

Personal project — no license granted for redistribution.
