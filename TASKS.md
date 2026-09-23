# Saarthi — TASKS.md

Status legend: `[x]` done · `[~]` in progress · `[ ]` pending

## Phase 0 — Foundation & App Shell
- [x] 0.1 Project setup: Next.js 16 + TypeScript strict, ESLint, Prettier, Vitest,
      folder structure (`src/app`, `src/components`, `src/lib`, `src/hooks`,
      `src/services`, `prisma/`, `db/`, `tests/`). Smoke test green.
      *Deviation:* sandbox exposes a single user-visible route `/` → app is a
      hash-routed SPA (`#/today`, `#/money/fds`, …) with API route handlers.
      AC: `bun run dev` + `bun run lint` + `bun run test` all pass.
- [x] 0.2 Auth: email+password (scrypt), server sessions in DB, httpOnly cookie,
      sessions persist across reloads. App-layer user-scoping on EVERY query
      (RLS-equivalent; true Postgres RLS arrives with the Supabase migration).
- [x] 0.3 Design system: Card, Button, Input, Chip, ProgressBar, DatePicker,
      AmountInput, FAB, EmptyState, SectionHeader, StreakCalendar + light/dark
      theme. Gallery at `#/styleguide` (accessible without login).
- [x] 0.4 App shell: bottom tabs Today | Money | Growth | Journal | Settings,
      per-screen empty states, deep links via hash routes (`#/money/fds` etc.).
- [x] 0.5 PROGRESS.md + TASKS.md exist and are kept up to date.

## Phase 1 — Money Core
- [x] 1.1 Accounts CRUD (savings/cash/credit_card; limit, statement & due day,
      auto utilization %, color-coded).
- [x] 1.2 Quick-Add FAB: global sheet, big amount pad, recent-first category
      chips, account memory, date=today. Amount → saved in 2 taps.
- [x] 1.3 Transaction list: day-grouped, filters (account/category/month/type),
      edit/delete, running balance on account view.
- [x] 1.4 Categories: 12 system defaults seeded on register + custom CRUD.
- [x] 1.5 FD tracker: CRUD, simple+compound maturity math (unit-tested),
      maturity date incl. month-end clamping, 30/15/7/1 reminder ladder with
      injectable clock, maturity timeline (ladder) view.
- [x] 1.6 Bills & subscriptions: monthly/quarterly/annual/custom recurrence
      (drift-free across month lengths, unit-tested), month calendar view,
      mark-as-paid → linked transaction exactly once (DB-unique),
      upcoming widget on Today.
- [x] 1.7 Expense overview: month total, by-category donut, MoM comparison,
      charts computed from the same query as the sums.

## Phase 2 — Habits, Routines, Journal  `[x]` ✅
- [x] 2.1 Habits CRUD + daily check-in
- [x] 2.2 Streak logic + stats (unit-tested edge cases)
- [x] 2.3 Routine builder + play mode
- [x] 2.4 Journal editor, templates, search, filters
- [x] 2.5 Smart reminders (local notifications)
- [x] 2.6 Today screen v2 (habits checklist + money merge)

## Phase 3 — Goals, Study, Body, Skin  `[x]` ✅
- [x] 3.1 Goals: goal → milestones → tasks, roll-up progress (unit-tested),
      target-date health chips, mark-achieved lifecycle.
- [x] 3.2 Study: courses + bulk syllabus, pacing engine (expected vs actual,
      health bands, projected finish), revision ladder [3,7,14,30,90] with
      Revised/Forgot, session log with weekly minutes.
- [x] 3.3 Body: workout log (type/minutes/intensity), week+month stats,
      weight trend chart with 7-pt moving average + deltas, measurements
      with same-day upsert (milli-unit storage).
- [x] 3.4 Skin: AM/PM daily check-in with either-or streak + calendar,
      product shelf with PAO expiry ladder (expired/soon/expiring).
- [x] 3.5 Growth hub → 6 deep-linked modules (#/growth/<module>).
- [x] 3.6 Today v3: goal tasks due, revisions due, skincare card.
## Phase 4 — Investments & Net Worth  `[x]` ✅
- [x] 4.1 Price history: every price update auto-captured as a dated point
      (one per day, same-day upsert); sparkline per holding row, full chart
      in the investment sheet, ▲/▼ delta vs previous recorded price.
- [x] 4.2 Portfolio allocation: by-type donut + pct bars from open positions
      (largest first, empty-safe).
- [x] 4.3 Net-worth trend: lazy daily snapshots (upserted on every Today /
      trend read), forward-filled per-day series (carry-forward flagged,
      pre-history never invented), chart + last-snapshot / 7d / 30d deltas
      on the Overview screen.
- [x] 4.4 Net-worth delta labels on the Money hub card and the Today tile
      (vs last stored snapshot).
## Phase 5 — Intelligence Layer (budgets, travel, Life Score, insights)  `[x]` ✅
- [x] 5.1 Budgets: recurring monthly cap per expense category, calendar-pace
      bands (over / watch / on-track, unit-tested boundaries), month-end
      projection, safe-per-day figure, Budgets screen + Money hub card +
      Today card.
- [x] 5.2 Travel: trips with date-derived phase (planned/ongoing/past),
      optional budget, quick-add trip chips with last-trip memory,
      trip-attributed expense flow (SetNull detach, ledger-safe delete),
      trip detail with daily spend bars + category split + Today widget.
- [x] 5.3 Life Score: 3-pillar composite (Wealth/Growth/Reflection) from 9
      measured components — missing data skipped, never punished; Today ring
      card + full breakdown on the Journal (Reflection) tab.
- [x] 5.4 Insights: deterministic rule engine (budget overruns, category MoM
      jumps, trip overspends, streak milestones, savings rate, at-risk
      courses, maturities, journal nudge) ranked warning→positive→info,
      capped; Today insights section with deep links.
## Phase 6 — Advanced Capture (CSV, voice, OCR, WhatsApp)  `[x]` ✅
- [x] 6.1 Deterministic capture parser: amounts (₹/Rs/grouping/k-lakh-cr
      suffixes), relative dates (injectable clock, DD/MM convention),
      direction keyword vote, note extraction, category guesser.
- [x] 6.2 AI capture: /api/capture/text (rules → LLM fallback, zod-checked),
      /api/capture/voice (ASR → same pipeline, transcript returned),
      /api/capture/receipt (vision reader; photo never stored).
- [x] 6.3 CSV import: RFC4180 parser, header/content column detection,
      debit-credit + signed shapes, per-row errors, duplicate skip (ledger
      + in-file), one-transaction bulk create with exact balance math,
      source='csv'; Import tab with preview + account picker.
- [x] 6.4 Voice capture UI: in-browser 16 kHz WAV recorder, tap-to-record,
      transcript card, review-then-save (source='voice').
- [x] 6.5 Message + Receipt capture UIs: paste/SMS examples, receipt photo
      input with preview, draft cards with engine badge + confidence,
      Quick-Add review with preset (source preserved: whatsapp/ocr).
- [x] 6.6 Capture hub screen + Money hub cards + hooks/types wiring.
## Phase 7 — Gamification, Polish, Security Hardening  `[x]` ✅
- [x] 7.1 Insurance tracker: policies (term/health/life/vehicle/asset/other),
      premium recurrence (monthly→annual, drift-free advance), sum assured,
      renewal ladder (30/15/7/1, unit-tested), mark-premium-paid with optional
      linked expense, Insurance screen + Money hub card + Today widget.
- [x] 7.2 Gamification: XP from real activity (habits, routines, journal,
      workouts, study, skin, bills, tasks — derived, idempotent), level curve,
      deterministic badges (streaks, counts, money milestones), Settings
      profile card with badge grid, celebration confetti on new badges.
- [x] 7.3 Security hardening: rate limiting on auth + capture (sliding window,
      injectable clock, 429 + Retry-After), security headers, session
      management (list devices, revoke one / revoke others), password max
      length guard.
- [x] 7.4 Polish: offline banner + auto-resume queries, idempotent Quick-Add
      (clientKey dedupe + offline write-queue retry), JSON data export,
      PWA manifest + install meta.
- [x] 7.5 Verification: full test suite (307/307), lint, tsc, curl matrix,
      browser golden path; PROGRESS.md + worklog.md updated.


## Phase 8 — Portfolio Planner: "Every Rupee Has a Job"  `[x]` ✅
      (user directive: the app must let people *plan* the framework — see all
      investments across every area, manage returns, and decide with full
      knowledge: job buckets, rebalancing, income machine, DICGC, ratings)
- [x] 8.1 Schema: `job` tag on Account/FD/RD/Investment/Asset; bond fields on
      Investment (ratePct, creditRating, maturityDate, couponFrequency);
      PortfolioTarget table (unique user+job). db push + regenerate.
- [x] 8.2 lib/planner.ts (pure): 6-job taxonomy with guideline ranges
      (Liquidity 5–10 · Safety 15–30 · Income 10–25 · Growth 35–50 ·
      Protection 10–15 · Speculation 0–5), suggestion engine per entity kind,
      buildJobPlan (allocation/drift/moves/health), 3 presets summing to 100,
      DICGC ₹5L exposure aggregation, income machine (maturity-anchored coupon
      calendar + FD accrual + trailing-12m distributions), horizon map,
      14 knowledge cards, credit-rating metadata.
- [x] 8.3 31 new unit tests → suite 340/340 (allocation, drift bands, coupon
      calendar incl. month-end clamps, DICGC aggregation boundary, presets).
- [x] 8.4 services/planner.ts (user-scoped overview + replace-all targets) +
      job/bond persistence through accounts/fds/rds/investments/assets.
- [x] 8.5 API: GET+PUT /api/planner; zod extensions for job, rating, coupon
      fields across the five wealth routes.
- [x] 8.6 Today: plannerToday (drift alerts, DICGC flag, monthly income).
- [x] 8.7 hooks: usePlanner + useSaveTargets; qk.planner wired into every
      wealth-family invalidation.
- [x] 8.8 UI: PlannerScreen (#/money/planner) — six-job allocation vs targets,
      balance moves, income machine, DICGC exposure, knowledge accordion,
      horizon table, preset targets editor; Money hub planner card; JobPicker
      in account/FD/RD/investment/asset sheets; bond details block with
      rating guidance; Today drift nudge.
- [x] 8.9 Verified: 340/340 tests, lint+tsc clean, curl matrix (hand-verified
      drift/moves/DICGC/coupons/yield), browser golden path (account → planner
      → preset plan → drift moves; bond form; knowledge cards; Today nudge;
      dark mode; deep links), zero 500s, screenshots in download/.
- [x] 8.10 PROGRESS.md decisions #39–#42 + worklog.md entry.
