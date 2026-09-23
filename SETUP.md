# Saarthi — Local Setup Guide

Personal Life OS — one app for the whole life:

- **WEALTH** — accounts, transactions, FDs/RDs, investments (stocks, bonds,
  crypto, real assets), bills, insurance, budgets, net-worth
- **GROWTH** — goals with GitHub-style effort grids, habits & streaks, study
  courses, Strength Coach (plans, sessions, body metrics, plan generator,
  meal-level nutrition), skin care, routines
- **REFLECTION** — journal + learnings, Life Score, monthly Life Report,
  reports hub with per-domain reports and print-to-PDF
- **LIFE-OS modules** — Life Principles & Dincharya, book library with an
  in-app EPUB reader + highlights + quotes vault, skill tracker,
  people/networking CRM, private content library (YouTube/articles in-app),
  Ideas Lab, universal capture (text/voice/receipt)
- **SECURITY** — zero-knowledge password vault with a secure generator

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 ·
Prisma 6 + SQLite · TanStack Query · Vitest.

---

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Bun** (recommended) | 1.1+ | the repo ships `bun.lock`; `bun` is also used by the production `start` script |
| **or Node.js** | ≥ 20.9 (LTS 22 fine) | required by Next.js 16; use `npm`/`npx` instead of `bun` |
| Git | any | optional, for cloning/versioning |

macOS / Linux work out of the box. On **Windows**, use WSL2 or Git Bash
(the dev/start scripts pipe through `tee`, which cmd.exe doesn't have).

## 2. Get the code + install

```bash
unzip saarthi-local.zip          # creates ./saarthi (or clone/copy the folder)
cd saarthi
bun install                      # or: npm install
```

## 3. Configure the environment

```bash
cp .env.example .env   # optional — the zip already ships a ready .env
```

The default `DATABASE_URL="file:../db/custom.db"` resolves (from
`prisma/schema.prisma`) to `<project-root>/db/custom.db`. Edit `.env` only if
you want the DB somewhere else. Nothing else is secret-required: auth is
scrypt + session tokens in-app, and the vault's crypto runs in the browser.

> The zip bundles `db/custom.db` — your existing account(s) and all data,
> including uploaded book EPUB/PDF files, content-library files and exercise
> photos (they are stored **inside** the SQLite file itself — there is no
> separate media folder to carry around). Delete that file before step 4 if
> you want a completely fresh start instead.

## 4. Create the database

```bash
bun run db:generate              # prisma generate → Prisma client
bun run db:push                  # prisma db push → creates SQLite schema
```

Notes:
- This project uses the **`db push` workflow** (there is no `migrations/`
  folder), which is why `db:push` is the standard command.
- There is **no seed step** — default categories are auto-seeded per user at
  registration.

## 5. Run the tests (optional but recommended)

```bash
bun run test                     # vitest run — 42 suites · 726 unit tests
# watch mode: bun run test:watch
```

## 6. Start the dev server

```bash
bun run dev                      # or: npm run dev
```

Open **http://localhost:3000** → sign in with your existing account (it
travels inside `db/custom.db`) or register a new one (email + password, no
email verification) → you land on the Today screen.

- Mic-based voice capture works on `localhost` without HTTPS.
- `dev.log` in the project root captures all requests (handy for debugging).
- Phone on the same Wi-Fi: `http://<your-lan-ip>:3000` (mic will be blocked
  over plain HTTP — that's a browser rule, not a bug).

## 7. Production build (optional)

```bash
bun run build                    # standalone build + copies static/public
bun run start                    # NODE_ENV=production bun .next/standalone/server.js
```

Serves on port 3000. `Caddyfile` is only used by the hosted HTTPS preview —
you don't need it locally.

## 8. Using the password vault (important)

Settings → Password Vault. Your master password:
- is **never sent to the server** — PBKDF2-SHA256 (310k iterations) +
  AES-256-GCM run in your browser via WebCrypto;
- has **no recovery** — there is nothing on the server that can unlock your
  entries, so losing it means losing the vault (reset = delete all entries);
- feeds the built-in generator: length + charset options, `crypto.
  getRandomValues` with rejection sampling, entropy shown in bits.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `PrismaClientInitializationError` on boot | `.env` missing or `DATABASE_URL` path wrong — relative paths resolve from `prisma/`, not project root |
| `tee: command not found` (Windows cmd) | run inside WSL2/Git Bash, or `npx next dev -p 3000` directly |
| Port 3000 busy | `bun run dev -- -p 3001` (or kill the other process) |
| Want to wipe all data | stop the server, delete `db/custom.db`, re-run `bun run db:push` |
| Uploaded book/content files gone | they live inside `db/custom.db` — if you deleted it for a fresh start, re-upload the files |
| Schema changed after a code update | just re-run `bun run db:push` |

## Handy scripts

```
dev / build / start        app lifecycle      (dev pipes logs to dev.log)
lint · format              eslint / prettier
test · test:watch          vitest suites
db:generate · db:push      prisma client + schema sync
```
