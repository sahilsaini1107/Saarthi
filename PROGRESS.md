# Saarthi — PROGRESS.md

Personal Life OS — Wealth · Growth · Reflection.
Today-first, goal-first, every manual entry under 10 seconds.

**Current status: ALL PHASES COMPLETE ✅ — Phase 0 · 1 · 1.5 · 2 · 3 · 4 · 5 · 6 · 7 (gamification, insurance, security hardening, polish) · 8 (portfolio planner: every rupee has a job) · 9 (goal contributions & effort grid) · 10 (planner ↔ goals link · grids on habits & study · weekly/monthly roll-ups) · 11 (goal journal: milestone daily logs — hours · done · learned · key takeaway) · 12 (key-learnings digest · drag-and-drop milestones · goal effort in the Life Score) · 13 (Strength Coach: plans, session logger, progression, nutrition fuel) · 14–15 (vault, principles & dincharya) · 16 (Book library & reader) · 17 (Skills & People) · 18 (Content Library & Ideas Lab — Life-OS Phase D) · 19 (Exercise media · plan generator · meal log — Life-OS Phase E) · 20 (Reports hub + Life Score extension — Life-OS Phase F) · 21 (nutrition truth-fix · food library · thali builder) · 22 (body composition panel · coach target tables) · 23 (daily coach check-in · training readiness) · 24 (plan presets · exercise media · progress photos)**

---

## Decisions & Deviations (Golden Rule 5 log)

1. **Runtime adaptation (approved scope):** The execution sandbox serves a single
   web preview and has no mobile emulator or external Supabase project. Saarthi is
   therefore built as a **mobile-first Next.js 16 + TypeScript web app** with the
   exact UX shell the brief specifies (bottom tabs, FAB, 8px grid, 12–16px radii,
   light/dark). The sandbox also exposes only one user-visible page route, so the
   app is a **hash-routed SPA** — deep links work as `#/money/fds`,
   `#/money/bills`, etc.
2. **Data layer:** Prisma + SQLite locally, wrapped by `src/services/*` which
   enforce **user-scoping on every query** (RLS-equivalent at the app layer).
   The Prisma schema is 1:1 portable to Supabase Postgres; migrating = swapping
   the services layer for supabase-js + enabling RLS policies. No bank
   aggregation, exactly per brief.
3. **Money representation:** all amounts are **integer paise** (2-decimal safe,
   half-up rounding). Aggregate math runs in JS (safe far beyond 2^31). Single
   stored values therefore cap at ~₹2.14 crore (Prisma Int32) — plenty for the
   personal-finance scale the brief targets; revisit with BigInt if needed.
4. **Dates:** stored as UTC-midnight instants representing the user's calendar
   date; "today" is derived from the user's timezone setting
   (`users.timezone`, default `Asia/Kolkata`). Recurring logic is anchor-day
   based and drift-free across month lengths and leap years (unit-tested).
5. **Offline-first (adaptation):** TanStack Query caches reads for instant
   opens; a full write-queue + service worker lands in the Phase 7 polish pass
   (browser SW caching fights dev HMR in this sandbox).
6. **Auth:** email+password with scrypt hashes and DB-backed sessions in an
   httpOnly cookie instead of NextAuth — fewer moving parts, sessions persist
   30 days, and the session→user binding keeps the RLS-equivalent scoping
   explicit and auditable.
7. **Migrations:** `prisma db push` in this environment (sandbox convention)
   instead of SQL migration files; schema history lives in git via
   `prisma/schema.prisma`. Revisit `prisma migrate` when on Supabase.
8. **Notifications:** reminder *computation* (FD 30/15/7/1, bill remind-days)
   is implemented and unit-tested with an injectable clock; actual push delivery
   (Web Notifications / expo-notifications) lands with Phase 2.5.
9. **Session transport (bugfix, 2026-09-06):** the preview runs the app in a
   cross-site iframe, where `SameSite=Lax` cookies are silently withheld —
   login returned 200 but every follow-up `/api/auth/me` was 401 (confirmed:
   5 orphaned session rows for the user, zero Session SELECTs reaching the DB).
   Fix is two-layered: (a) behind HTTPS the cookie is now
   `SameSite=None; Secure; Partitioned` (CHIPS, iframe-compatible); (b) the
   auth response body also returns the session token, the client keeps it in
   localStorage and sends `Authorization: Bearer` on every call — pure JS
   state, immune to any third-party-cookie policy (Safari ITP included).
   Server resolves Bearer first, cookie as fallback; logout clears both.
10. **Investment & asset scale (Phase 1.5):** the new money tables
   (`RecurringDeposit`, `Investment`, `InvestmentTxn`, `Asset`) store paise as
   **BigInt** (SQLite 64-bit) because real assets (real estate!) routinely
   exceed the Int32 cap (~₹2.14 crore) documented in Decision #3. The DTO
   boundary converts BigInt → Number, which is exact for any realistic
   magnitude (safe far below 2^53). Existing tables stay Int32.
11. **RD math (Indian-bank convention):** N monthly installments; installment
   k (1-indexed) is deposited at the START of month k and earns
   r = N − k + 1 months until maturity (= start + N months). Quarterly
   compounding: complete quarters at rate/4, leftover months simple pro-rata
   (rate/4 × months/3) — matches bank RD calculators; monthly/annual/simple
   variants implemented. Unit-tested against hand math (₹5,000 × 24 @ 7.5%
   quarterly = ₹1,29,779.56).
12. **Investment accounting:** weighted-average cost. Buys blend avg cost;
   sells realize P&L vs avg and leave avg unchanged; dividends/interest are
   pure income. Quantity is a float (fractional units, 8-dp rounding) — all
   cash amounts stay integer paise. Prices are user-maintained (no market
   API in this environment).
13. **Habit schedules:** weekday schedules are a 7-char Mon..Sun bitstring
   ("1111100" = weekdays). All schedule/streak math runs on UTC-midnight
   calendar dates with an injectable "today" (same pattern as the FD
   reminder ladder, Decision #8). Unscheduled days never break a streak;
   an un-done *today* also doesn't (grace rule — the day isn't over).
14. **Check-ins are exactly-once:** unique (habitId, date) at the DB level,
   mirroring bill payments. Toggling = create/delete of one entry row, so a
   double-tap or a race can never double-count a day.
15. **Journal tags:** stored comma-separated in one column. User input is
   sanitised (separators replaced, whitespace collapsed, deduped
   case-insensitively, capped 8 tags × 24 chars). A separate tag table was
   deliberately skipped at personal scale.
16. **Journal search/filter in JS:** over a bounded recent window (500
   entries). SQLite's `contains` is only ASCII-case-insensitive; JS
   lowercasing keeps Devanagari and other scripts searchable, and counts
   are trivial at personal scale. Moods/tags filter in the same pass.
17. **Reminders are local-only (Phase 2):** the browser Notification API
   driven client-side (30s tick + per-day fired-key localStorage so a
   reload never re-spams). "HH:MM" reminder times are interpreted on the
   device clock — correct for the dominant single-device, same-timezone
   user. The journal nudge time is device-local by the same logic as the
   permission itself (per-browser). Server push (web-push + service
   worker) is the Phase 7 upgrade path; bill due-dates already surface in
   the Today widget server-side.

---

18. **Goal roll-up:** a milestone WITH tasks is done exactly when all its
    tasks are done (progress = done-tasks ratio — the manual flag can't fake
    it); a task-less milestone toggles manually. Goal progress = the mean
    over every milestone's progress + every direct (no-milestone) task's 0/1,
    so both decomposition styles mix cleanly. Goal `status` (achieved /
    archived) stays manual — the UI offers a "Mark achieved 🎉" action when
    progress hits 100% but never flips it silently.
19. **Study pacing:** expected progress = elapsed days / planned days
    (start day counts as day 1, clamped to [0,1]); actual = done topics /
    total. Health bands on delta (actual − expected, in pp): ≥+10 ahead ·
    ≤−25 at_risk · ≤−10 behind · else on_track; past the deadline with units
    left is always at_risk. Projected finish extrapolates observed pace
    (done/day), ceil to whole days. Delta is rounded to 6dp so exact
    boundaries survive floating point (caught by unit tests).
20. **Revision ladder:** fixed spaced gaps [3, 7, 14, 30, 90] days.
    Marking a topic learned starts stage 0 → revision in 3 days; each
    success advances one rung; "forgot" restarts at the shortest gap; after
    the last rung the topic graduates (no more scheduling). Revising is
    rejected (422) unless the topic is actually due, so the ladder can't be
    gamed out of order.
21. **Body metrics in milli-units:** weight/measurement values are integer
    milli (72.5 kg = 72500) — no floats in the DB, exact 3-decimal input,
    formatted at the edge. One measurement per (kind, day) via DB-unique
    constraint; same-day re-entry upserts (a re-weigh replaces, never
    duplicates). Deltas compare against the newest entry on/before the
    cutoff (7d/30d) — null when history doesn't reach back that far, no gap
    padding invented.
22. **PAO expiry:** product expiry = openedDate + paoMonths calendar months
    (month-end clamped, same drift-free rule as FD dates: Jan 31 + 1M →
    Feb 28/29). Warning ladder: expired → ≤7d soon → ≤30d expiring → ok;
    products without open date/PAO never warn. The shelf sorts expiring
    products to the top so the warning is structural, not just colored text.
23. **Skin AM/PM checklists:** one row per day with two flags (amDone,
    pmDone) — the daily checklist IS the two toggles; a personalized
    multi-step sequence is what Routines already does, so it wasn't
    duplicated (Golden Rule 5). Streak counts days with EITHER flag done,
    habit-style grace for an unfinished today.
24. **Net worth = lazy daily snapshots (Phase 4):** reconstructing
    point-in-time net worth from ledgers (balances, holdings, asset
    revaluations) is error-prone and unverifiable, so history is SNAPSHOTTED
    instead: every Today / trend read upserts today's `NetWorthSnapshot`
    row (unique per user+day, same-day recompute wins) — the trend
    accumulates with zero user effort. The trend chart forward-fills gap
    days (carry-forward, flagged in the payload) and NEVER invents days
    before the first snapshot; 7d/30d deltas return null until history
    reaches back that far. All net-worth math lives in ONE reducer
    (`reduceNetWorthParts`) shared by Today and the snapshots, so the live
    numbers and the stored history cannot drift. Price history follows the
    same lazy convention: every price create/change upserts a dated
    `InvestmentPricePoint` (one per day, Decision #21 style) — sparklines
    for free, no extra taps.

25. **Budgets recur monthly, pace is linear (Phase 5.1):** a budget is a
    single per-category cap that applies to EVERY month — no per-month
    overrides (personal-scale simplicity; revisit if the user asks).
    Pace compares spent% against the calendar day fraction (day D of N →
    D/N expected), and today counts as a full elapsed day. Bands with
    exact unit-tested boundaries: `over` strictly >100% of the cap,
    `watch` when spent% − expected% ≥ 10pp, else `on_track`. Budgets apply
    to EXPENSE categories only (income is not capped). The month-end
    projection is straight-line (spent ÷ elapsed fraction, null on day 0)
    and `safePerDay` floors the remaining budget over remaining days,
    never spreading an overshoot forward.
26. **Trip phase is derived, attribution is manual (Phase 5.2):**
    planned/ongoing/past is computed from dates on every read (start day
    counts as ongoing; open-ended trips never go past) — a stored status
    flag would go stale the moment dates are edited. Expenses are attached
    via a trip chip in Quick-Add (ongoing trips only; last trip remembered
    like the last account; "Add expense" from a trip screen pre-attaches).
    Trip spend = sum of linked out-transactions — LEDGER TRUTH, unwidowed;
    the daily bar series is a visualisation over [start, min(end, today)]
    (zero-filled inside, never invents future days). Deleting a trip keeps
    its expenses (Transaction.tripId SetNull); trip budgets are Int paise
    (trip scale, Decision #3 cap is plenty).
27. **Life Score skips missing data (Phase 5.3):** each pillar (Wealth /
    Growth / Reflection) is the mean of its measured components (0–100);
    a feature never touched is null and EXCLUDED — it neither rewards nor
    punishes. Overall = round(mean of present pillars); all-null → null
    ("not enough data"). Component targets: savings rate 30% = 100
    (linear, negative clamps to 0), budgets on-track ratio ×100, net-worth
    direction 0/100, habits mean rate30 ×100, workouts 150 min/7d,
    study 120 min/7d, journal 20 entries/30d, mood great→bad = 100→0,
    skincare streak 21 days = 100. Computed on READ, nothing stored —
    scores can never go stale, and the “feature was used but is idle”
    signal stays honest (used-but-idle scores low; never-used is skipped).
28. **Insights are deterministic rules (Phase 5.4):** no LLM — a pure
    builder over measured aggregates, so every card is explainable and
    unit-tested. Ranking: warnings → positives → infos, within severity by
    magnitude desc, capped (default 6). Silence is a feature: rules only
    fire past real thresholds (budget over/watch, trip over budget,
    category MoM jump ≥ +30% AND ≥ ₹500, at-risk course, negative savings
    rate; streaks ≥ 7d / 66-day built, savings ≥ 20%, net worth ≥ +0.5%,
    journal streak ≥ 3; soonest maturity ≤ 30d, biggest expense ≥ ₹5,000,
    revisions ≥ 5, journal gap ≥ 3 days). Computed per read with its own
    endpoint — no stored state.

29. **Capture is deterministic-first, AI-fallback (Phase 6):** pasted/voice
    text is parsed by pure rules (lib/capture.ts: Indian-grouping amounts,
    "1.5k/2.4 lakh" suffixes, relative dates with an injectable today,
    DD/MM convention, keyword direction vote with exact-word matching) and
    the LLM is only consulted when the rules cannot find an amount or a
    direction; its JSON is zod-validated and merged over the rules, so a
    draft always exists even when the AI is down (engine badge shows which
    path won: rules / llm / asr+llm / vision). Receipts go straight to the
    vision model (no rules apply to pixels). Nothing auto-saves — every
    capture lands in the standard Quick-Add review sheet with the source
    tag (voice/ocr/whatsapp/csv) preserved on the ledger row.
30. **CSV import refuses to guess (Phase 6):** column detection is
    header-alias first with content sniffing that only trusts rows whose
    date cell parses (statement files often carry junk rows — learned the
    hard way in browser verification). Direction resolution: debit/credit
    columns → their column; signed single column → negative = out,
    positive = in ONLY when the file mixes signs or a type column says so;
    an all-positive file with no type column fails per-row instead of
    silently booking expenses as income. Duplicates are (account, day,
    direction, amount, normalized note) against the ledger within the
    imported date span AND against earlier rows in the same file —
    re-importing a statement skips everything. One import = one account =
    one DB transaction (all creates + a single net balance adjustment),
    capped at 500 rows; bad rows fail individually with reasons.
31. **Voice is client-encoded 16 kHz WAV (Phase 6):** MediaRecorder's
    webm/opus is not accepted by the ASR service, so the recorder taps raw
    mono PCM (ScriptProcessorNode), downsamples with linear interpolation
    and encodes a canonical 44-byte-header WAV in the browser (lib/wav.ts,
    unit-tested incl. header bytes and resampler shape). 60 s auto-stop;
    the transcript ships back with the draft so the user can verify what
    was heard.
32. **Receipts are parsed, never stored (Phase 6):** the photo is base64'd
    straight to the vision endpoint and discarded; only the parsed draft
    (merchant, total, date) lands in the review sheet — privacy plus no
    attachment storage to secure. `Transaction.attachmentUrl` stays
    reserved for a future opt-in. The vision call needs `model: ''`
    (SDK type demands the property; the server default is the vision
    model). Test-image gotcha learned during verification: librsvg text
    rendering in the sandbox can silently produce blank PNGs — receipts
    for tests are drawn with PIL instead.
33. **Rate limiting is in-memory, per process (Phase 7):** sliding-window
    counters (lib/rate-limit.ts, injectable clock, unit-tested) live in the
    server process — no external store. Right trade-off for a single-user
    personal app on one node; revisit with Redis/Upstash only if Saarthi
    ever scales horizontally. Auth: 10 attempts / 15 min per IP
    (x-forwarded-for first hop). AI capture: 30/min per user (LLM/ASR/vision
    are expensive). Blocked requests return 429 + `Retry-After`.
34. **Insurance is protection, not net worth (Phase 7):** sum assured is
    what the family receives, not an asset owned — including it would
    inflate net worth and tempt "buy more insurance → richer" reasoning.
    Policies get their own coverage summary (₹ cover, annualized premium
    outgo) on the Insurance screen; `reduceNetWorthParts` is untouched.
35. **Premium "pay" = schedule advance + optional ledger row (Phase 7):**
    no `premium_payments` table. Paying advances `nextPremiumDue` exactly
    one drift-free anchored period and (optionally) writes one expense in
    the same DB transaction. Double-taps advance twice — visible in the UI
    (next-due moves), never money-corrupting; the UI gates the button on
    due date. The advanced date IS the ledger.
36. **XP is derived, never stored (Phase 7):** no event log table. XP =
    fixed weights × activity counts (habits ×5, routines ×10, journal ×10,
    workouts ×8, study ×8, skin ×3, bills ×5, transactions ×2, tasks ×8,
    revisions ×5), recomputed from the ledger on every read — idempotent,
    retroactive for existing data, impossible to double-award, and it can't
    drift from reality. Levels: advancing n→n+1 costs 100·n (cumulative
    100·(L−1)·L/2), titles banded (Beginner → Life Master). Badges are
    deterministic predicates over the same stats + streaks + net worth +
    Life Score (25 total, bronze/silver/gold). "New badge" detection is
    client-side vs a localStorage seen-set — first-ever load baselines
    silently (no confetti for things you earned before the feature).
37. **Security headers stay iframe-friendly (Phase 7):** `X-Content-Type-
    Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
    `Permissions-Policy` (mic=self for voice capture, camera/geolocation/
    payment blocked). Deliberately NO `X-Frame-Options` and no CSP
    frame-ancestors — the preview embeds the app in a cross-site iframe;
    a full CSP is the Supabase-deployment follow-up.
38. **Offline write-queue is Quick-Add-only, clientKey-idempotent
    (Phase 7):** a NEW entry saved offline is short-circuited BEFORE the
    network (instant "Saved offline ✓" toast — TanStack's default
    `networkMode: 'online'` would instead PAUSE the mutation forever on
    "Saving…", discovered in browser verification) into a localStorage
    queue; the shell replays it on reconnect and the server resolves
    replays to the original row via `Transaction.clientKey` (unique per
    user) — replays are provably safe, verified end-to-end. Other writes
    stay manual (offline → error toast) — queueing them safely needs
    per-endpoint idempotency keys; not worth it for a personal app.
    Journal-entry nudge, session list/revoke ("sign out others"), JSON
    data export, PWA manifest + install meta ship alongside.
39. **Six jobs, not “FD vs stocks” (Phase 8):** the user's framework —
    liquidity / safety / income / growth / inflation-protection / speculation
    (their "5 portfolios" fold into these; liquidity+safety ≈ Safety
    portfolio, protection = diversifiers) — is THE planning taxonomy. Every
    wealth entity (Account, FD, RD, Investment, Asset) carries an optional
    `job` column; when untagged, the framework *suggests* a job per entity
    kind (savings→liquidity, FD/RD→safety, govt-bond→safety, corporate
    bond→income, crypto→speculation, gold→protection, index/MF→growth,
    real-estate→growth, machinery→income; vehicles/electronics/art stay
    untagged as consumption). The stored tag ALWAYS wins over the
    suggestion; untagged money is counted in the plan denominator and
    surfaced as a nudge, never hidden.
40. **Targets are six rows, replaced wholesale (Phase 8):**
    `PortfolioTarget` (unique user+job, pct 0–100) — one PUT replaces the
    whole plan in a transaction (simpler and safer than per-row upserts for
    a six-number plan; the UI enforces sum = 100 ±0.5 and offers three
    presets, all unit-tested to sum to exactly 100). Drift tolerance is
    ±5pp from target (the framework's own discipline: don't let a 2–3%
    speculative sleeve quietly become 20%); guideline ranges (Liquidity 5–10 · Safety 15–30 ·
    Income 10–25 · Growth 35–50 · Protection 10–15 · Speculation 0–5) are
    displayed and flag ±0.5pp-grace violations but never block anything.
    Balance moves are informational nudges ("add/trim ₹X"), not orders.
41. **Bond/income fields on Investment, no second model (Phase 8):**
    additive optional columns — `ratePct` (coupon % p.a.), `creditRating`
    (govt/AAA/AA/A/BBB/BB/B/below_B/unrated), `maturityDate`,
    `couponFrequency` — reused for the income machine and rating guidance.
    Coupon calendar is maturity-anchored (walk back 12/f months from
    maturity; month-end clamps match the FD/RD convention); a bond without
    maturity counts in the monthly AVERAGE only, never in "scheduled this
    month". FD income is shown as accrual ((maturity − principal)/tenure —
    honest: FDs compound to maturity, they don't pay out monthly unless
    structurally so); distributions (dividend/interest txns) average the
    trailing 12 months. RD pays nothing until maturity by design. Real
    assets carry no rent model (documented simplification — no rental
    ledger exists). Yield denominator = deposits + investments market
    value only (income-producing base).
42. **DICGC awareness is advisory, not enforced (Phase 8):** savings + FD
    principal + RD value-now are aggregated per institution with
    best-effort name normalisation ("HDFC Savings" ≈ "HDFC Bank" ≈ hdfc —
    documented limitation: matching is textual, the user should name
    accounts by bank). The ₹5,00,000 limit splits insured/uninsured and
    flags over-limit banks; the app never blocks a deposit or moves money —
    it informs, per the framework ("verify the DICGC insured-bank list").

43. **Contributions are daily, exactly-once, and replace-on-rewrite
    (Phase 9):** a goal MAY carry a quantified metric — 'money' (₹) or
    'count' (unitLabel, e.g. km/pages) — with an optional total target in
    milli-units (Decision #21 convention: ₹1 = 1000 milli, 1 unit = 1000
    milli). `GoalContribution` is unique per (goal, day); re-entering a day
    REPLACES its value (BodyMetric convention — the input is pre-filled, so
    the user always sees what will be stored). Future dates are rejected:
    the grid records what you DID. Intensity levels 0–4 are target-relative
    (benchmark = target ÷ window days; 0<r<0.5 → L1, <1 → L2, <2 → L3,
    ≥2 → L4) with a quartile fallback when no target exists (<4 nonzero
    days render L2 — some effort, no yardstick). Metric-less goals still
    get a grid from task completions (1→L2, 2→L3, ≥3→L4 — no half credit).
    Pace bands reuse the study-pacing thresholds (Decision #19: +10/−10/−25
    pp; past deadline with target unmet = always at_risk); pace + streaks
    + totals are ALL-TIME even when the visual grid caps at its last 400
    days (stats never hide history just because the picture does — caught
    live in browser verification). Streaks follow the habit grace rule:
    an un-logged today doesn't break the run. Contributions carry no XP by
    design — XP stays derived from the ledger (Decision #36), and silently
    adding a weight would reprice every existing level.

44. **Effort grids are one shared system (Phase 10):** habits and courses
    reuse the goal grid's engine (`ContributionGrid` + `buildGrid`) with
    per-domain day values. Habit cells are binary and honest: scheduled+done
    → L4 (full block), everything else → L0 — misses read as empty, rest
    days are never painted as effort, and only scheduled days are tappable
    (`pickable: false` on rest days; the tap toggles the check-in with the
    same exactly-once API as the big button). Course cells carry that day's
    TOTAL minutes with no preset target, so intensity uses the quartile
    fallback (nearest-rank of nonzero days — the grid re-scales to the
    learner's own rhythm; <4 study days render L2). Windows are the
    entity's OWN history: [start date → today] capped at the last 400 days
    (`trailingWindow`), distinct from the goal window which anchors at the
    first contribution. Weekly/monthly roll-ups ALWAYS aggregate full
    history (never the capped render window — Decision #43's lesson
    applied everywhere), weeks are Monday-anchored like the grid columns,
    and the current week/month is included as a partial-to-date. Tap-to-log
    on the course grid aims the session logger at the picked day (banner
    shows the target date, auto-resets to today after logging).

45. **Planner ↔ goals is a one-way tag with two-way visibility (Phase
    10):** a money goal MAY carry a portfolio job (`Goal.job`) — the sleeve
    that FUNDS it. Only money goals can link (a sleeve funds a rupee
    target; tagging a count goal 422s), an explicit null clears, and
    switching the metric away from money auto-clears a stale tag so a
    non-money goal can never keep one. The planner reads the tag:
    per-job "Funds N goals" rows (contributed / target · %, soonest
    deadline first, undated last) plus a hero line ("₹X saved toward N
    linked goals (₹Y committed)") and an unlinked-backlog hint. Only
    ACTIVE goals roll up — achieved goals have already served their
    purpose (the money sits in the sleeve as a holding now); archived are
    noise. Target-less goals list with 0 committed (pct/remaining null)
    so the sleeve still shows what it is for. Contribution log/delete and
    goal saves invalidate the planner query — the two views can never
    drift apart.
46. **The milestone journal is a LEARNING log, not a second checklist
    (Phase 11):** big goals ("learn software development") break into
    milestones, and each milestone carries ONE daily journal entry
    (`MilestoneLog`, unique milestoneId+date — exactly-once upsert-replace
    like everything else): minutes worked (1..1440), what was done, what
    I'm learning, key takeaway (texts optional, ≤500 chars — minutes alone
    must stay a <10s entry). Journaling is TIME-based and deliberately
    separate from the Phase 9 metric grid: completion still comes ONLY
    from tasks/manual toggle (Decision #18 untouched), and a milestone's
    optional planned hours (`targetMinutes`, informational, capped at
    100%) drive a time bar that never forces done. The goal-level grid
    AGGREGATES minutes across milestones and reuses the effort-grid
    pipeline (quartile levels like study, full-history roll-ups in hours,
    today-grace streaks). The Today nudge fires per GOAL, not per
    milestone — one entry today covers the goal (a nudge, not a trophy
    case); goal-form gains "start with milestones, one per line" so big
    goals ship with their structure on day one.

## Bugfix log

- **BF-1 Sign-in broken in preview (2026-09-06):** `SameSite=Lax` cookie never
  sent back in the cross-site preview iframe → auth loop (login 200, /me 401).
  Fixed via Decision #9 (Partitioned cookie + Bearer fallback). Verified:
  curl matrix (cookie / bearer / unauth 401 / HTTPS attrs / logout revoke) +
  browser golden path (register → Today → reload persistence → sign out →
  wrong-password error → re-login). 39/39 tests, lint + `tsc` clean.

---

## Phase 0 — Foundation & App Shell ✅

- **0.1** Tooling: TypeScript strict, ESLint 9, Prettier, Vitest (39 unit tests),
  structure: `src/app` (page + api), `src/components` (ui/ money/ today/ growth/
  journal/ shell/), `src/lib` (pure logic), `src/hooks`, `src/services`,
  `prisma/`, `db/`, `tests/`. Smoke test green.
- **0.2** Auth: register (seeds 12 default categories), login, logout, `/api/auth/me`;
  scrypt password hashes; DB sessions; httpOnly cookie; sessions persist.
- **0.3** Design system + theme: Card, Button, Input, Textarea, Chip, ProgressBar,
  DatePicker, AmountInput (keypad), FAB, EmptyState, SectionHeader, StreakCalendar,
  Skeleton, MoneyText; light/dark via next-themes; gallery at `#/styleguide`.
- **0.4** Shell: hash router, 5 bottom tabs, global FAB, empty/loading/error
  states on every screen, deep links.
- **0.5** TASKS.md + PROGRESS.md live.

## Phase 1 — Money Core ✅

- **1.1 Accounts** — CRUD sheets; card fields (limit, statement day, due day);
  utilization % auto-computed and color-coded (<30 ok / 30–70 warn / >70 over).
- **1.2 Quick-Add FAB** — global sheet reachable in 1 tap from any screen;
  big keypad; expense/income toggle; category chips sorted recent-use-first;
  account memory (last used); date defaults to today. **Save in 2 taps after
  typing the amount.**
- **1.3 Transactions** — day-grouped list with daily totals; filters: account,
  category, month, direction; edit sheet + delete confirm; running balance when
  an account is selected (computed backwards from current balance).
- **1.4 Categories** — 12 system defaults seeded at registration; custom
  categories with emoji/color; system ones protected from deletion.
- **1.5 FD tracker** — CRUD; bank, principal, rate, tenure, start date;
  compounding: simple/annual/half-yearly/quarterly/monthly; maturity date +
  amount computed and unit-tested against hand math (e.g. ₹1L @7% qtrly =
  ₹1,07,185.90); auto-renew flag; status lifecycle; 30/15/7/1-day reminder
  ladder (injectable clock); **ladder timeline view** bucketing FDs by
  maturity horizon with elapsed-tenure progress bars.
- **1.6 Bills** — recurring (monthly/quarterly/annual/custom days), drift-free
  anchor-day recurrence engine (unit-tested: Jan 31 → Feb 29 → Mar 31); month
  calendar view; **mark-as-paid creates the linked transaction exactly once**
  (unique (bill, dueDate) constraint + catch-up advance); upcoming-due widget
  on Today; remind-days-before per bill.
- **1.7 Expense overview** — month totals (in/out/net), by-category donut +
  ranked list, month-over-month comparison with % delta, all derived from one
  query shared with the sums.

## Verification log

- `bun run test` — 39/39 green (money, date/tz, FD maturity, recurrence, smoke).
- `bun run lint` — clean. `tsc --noEmit` — 0 project errors.
- Agent Browser golden path (interactive, on the live dev server):
  register → Today welcome state → add HDFC savings (₹1,25,000) → add credit
  card (limit ₹2L, outstanding ₹46K, 23% utilization green) → quick-add ₹467
  Groceries via keypad (balance 1,25,000 → 1,24,533 ✓) → FD ₹2L @ 7.1% qtr 15m
  (live preview ₹2,18,391.41, maturity 2027-12-06 ✓) → bill Broadband ₹799
  monthly (following-occurrence preview 2026-10-06 ✓) → paid → schedule
  advanced to Oct 6, calendar paid-dot, transaction logged, overview total
  ₹1.27K ✓ → second period paid → balance 1,24,533 − 799 = **1,23,734** ✓ →
  deep links (#/money/overview, #/styleguide) direct-load ✓ → Recharts donut
  renders ✓ → dark theme ✓ → session survives reloads ✓.
- Bugs found by browser verification and fixed:
  1. `payBill` logged the transaction but skipped the balance effect → ledger
     now moves atomically with the payment (services/bills.ts).
  2. Card "outstanding right now" field was collected but not sent on create
     (components/money/account-form-sheet.tsx).
  3. FAB overlapped screen content on wide viewports → repositioned to
     bottom-right inside the phone frame (components/ui/saarthi.tsx).
- Screenshots: `download/saarthi-today.png`, `download/saarthi-overview.png`,
  `download/saarthi-styleguide-dark.png`.

## Phase 1.5 — Deposits, Investments & Real Assets ✅

- **RD tracker** — full CRUD; installment, rate, tenure (1–360m), start date,
  compounding (simple/annual/quarterly/monthly, quarterly default); live
  maturity preview in the form; **auto-creates a monthly installment bill**
  (linked via `Bill.rdId`, cascade-deleted with the RD; amount stays in sync
  on installment edits) so paying each installment reuses the exactly-once
  bill → transaction pipeline; installments-paid estimate + value-now;
  30/15/7/1-day maturity reminders via the shared ladder logic.
- **Deposits screen** (`#/money/fds`, retitled "Deposits — FD & RD") — FDs and
  RDs merged into ONE maturity ladder (bucketed: matured / this month / next
  3 months / this year / later / closed), combined summary (committed,
  at-maturity, interest), FD/RD chips, progress + paid-count per row.
- **Investments** (`#/money/invest`) — any market instrument: stock, bond,
  crypto, mutual fund, ETF, gold, REIT, PPF, NPS, other; symbol, platform,
  user-updated unit price (with priceUpdatedAt); buy / sell / dividend /
  interest transaction ledger; holdings with avg cost, invested basis,
  market value, unrealized P&L (₹ + %), realized P&L, income; opening buy at
  creation; over-sell rejected server-side (422 with held quantity); recent
  activity per holding.
- **Real assets** — real estate, vehicle, machinery, gold & jewellery,
  electronics, furniture, art, other; current value (user-maintained),
  optional purchase value/date, location, notes; gain ₹/­% vs purchase.
- **Net worth everywhere** — Today (Net worth + Growing tiles, FD+RD merged
  "Maturity alerts"), Money hub (Liquid / Deposits / Cards owed /
  Investments / Real assets breakdown + Invest module card), Overview screen
  (net worth snapshot with 4-way split).
- **Migration** — `prisma db push`: 4 new tables + `Bill.rdId` unique FK
  (cascade). Verified against the running app after a dev-server restart to
  load the regenerated Prisma client.

### Verification log (Phase 1.5)

- 21 new unit tests (RD maturity math hand-verified incl. ₹7,454.16 /
  ₹12,390 / ₹3,060.40 cases + ordering invariant + date/paid clamps;
  weighted-average-cost portfolio accounting incl. fractional crypto qty,
  realized/unrealized split, over-sell clamp). 60/60 total green.
- Browser golden path: register → seed accounts → RD via UI (live preview
  ₹1,29,779.56, saved, installment bill "RD · SBI" ₹5,000/mo appears in
  Bills) → BTC investment with opening buy (0.05 @ avg ₹50L, price ₹52L →
  ₹2.6L, +₹10K/+4%) → recorded sell 0.02 for ₹1.16L → holdings ₹1.56L,
  unrealized +₹6K, realized +₹16K ✓ → type edit via sheet ✓ → asset "2BHK
  Flat Pune" ₹65L (bought ₹48L, +35%) ✓ → Money hub net worth ₹68.49L
  = 2,00,000 + 5,000 + 1,56,000 + 65,00,000 − 12,000 (hand-verified) ✓.
- Bugs found during verification and fixed:
  1. Client components crashed the page: `ASSET_CATEGORIES` was imported
     from the service into a client sheet, dragging `next/headers` into the
     browser bundle → categories moved to server-safe `lib/constants.ts`.
  2. Zod create schemas rejected `null` for optional strings the forms send
     for empty fields (investments + assets 422) → `.nullable().optional()`.
  3. Dev server held a stale Prisma client after the schema push → restart
     documented as required step after `db push`.

## Phase 2 — Habits, Routines, Journal ✅

- **Streak engine** (`lib/habits.ts`, pure + injectable clock) — Mon..Sun
  bitstring schedules, current streak with the grace rule (today pending
  never breaks; unscheduled rest days never break), longest streak, 30-day
  completion rate (future days excluded from the denominator), 66-day
  building-mode progress (start day = day 1, clamped, "built" flip), and
  heatmap points (done / missed / rest-day) for the calendar.
- **Habits (2.1/2.2)** — CRUD with emoji + colour presets, weekday chips,
  building window (default 66), reminder time, archive; check-in toggle
  exactly-once via unique (habitId, date) (Decision #14); per-habit stats:
  current/best streak, 30-day rate, building bar, 5-week StreakCalendar.
- **Routines (2.3)** — builder with ordered steps (title + optional minutes,
  reorder/remove, ≤20 steps; full-list replace in a transaction); full-screen
  **play mode**: step counter, per-step timer (countdown for timed steps),
  Done/Skip/Previous/Finish-here, summary with completion %, run recorded by
  upsert on unique (routineId, date) so replays refresh today's run;
  routine streak reuses the habit engine on run dates.
- **Journal (2.4)** — entries with title, mood (5-point scale), tags, date;
  4 built-in templates (Gratitude / Wins / Learned / Tomorrow's priority)
  seed the editor; search (title+content+tags, Unicode-safe — Decision #16)
  + mood + tag-chip filters; day-grouped list; streak + month count stats.
- **Smart reminders (2.5)** — pure scheduler (`lib/reminders.ts`) + client
  engine (`useReminders`, 30s tick): habit/routine reminder times and the
  journal nudge fire local browser notifications + in-app toast; per-day
  fired-key storage prevents re-spam (Decision #17). Settings gains a
  Reminders section (permission status, enable, journal nudge time).
- **Today v2 (2.6)** — "Habits today" checklist (tap to check/uncheck,
  streaks + building day), routines row (played/steps/streak), journal tile
  (write nudge or today's mood); welcome state now includes habit + journal
  entry points; `hasNoData` covers growth + reflection too.
- **Migration** — `prisma db push`: 6 new tables (Habit, HabitEntry,
  Routine, RoutineStep, RoutineRun, JournalEntry) + User relations; dev
  server restarted after push (Prisma client reload).

### Verification log (Phase 2)

- 30 new unit tests: streak grace/rest-day/month-boundary/leap-year cases,
  longest-run over gaps, completion-rate windows incl. future exclusion,
  building-progress clamps (day 1 start, day-66 flip, pre-start, long past),
  heatmap truth table, journal streak grace, filter AND-semantics,
  tag sanitisation caps. **90/90 total green; lint + `tsc` clean.**
- Browser golden path (live dev server): register → Growth → create
  "Morning run" (Day 1 of 66) → check in (🔥 1, "1 of 1 done today") →
  expand row (heatmap + current/best/30-day stats) → build "Morning
  kickstart" (Stretch 2m → Cold shower 5m → Plan the day 3m, ~10 min) →
  play mode step-through (Done/Skip/summary "2 of 3 steps · 0:17") → run
  recorded (🔥 1, PLAYED, last 2026-09-06) → journal entry via Gratitude
  template with mood + tags → streak "1-day · 1 this month", #family /
  #health chips → search hits + no-match empty state + tag filter ✓ →
  **Today v2**: habits checklist, routine card "Played ✓ · 🔥1", journal
  mood tile, tap-to-toggle from Today ✓ → Settings Reminders section ✓.
- API matrix (curl): unauth 401; bad weekdays 422; **bad journal query
  param was 500 → fixed to 422** (ZodError escaped the HttpError path in
  the GET route); check-in toggle on/off both directions; routine play
  upsert; per-user scoping intact.
- Screenshots: `download/saarthi-growth-habit.png`,
  `download/saarthi-journal.png`, `download/saarthi-today-v2.png`.

## Phase 3 — Goals, Study, Body, Skin ✅

- **Goals (3.1)** — Goal → Milestone → GoalTask with computed roll-up
  progress (Decision #18); target dates with health chips
  (overdue / due-soon ≤7d / on-track); inline milestone + task editing on
  the expanded card (Enter-to-add, tap toggles, delete-with-cascade);
  "Mark achieved 🎉" when progress hits 100% (manual, reversible);
  standalone tasks skip milestones when a breakdown isn't needed.
- **Study (3.2)** — Courses with provider, dates, status; bulk syllabus
  paste (one topic per line); pacing engine (Decision #19) with expected vs
  actual bars, health chips, projected finish; topic lifecycle
  todo → learning → done via tap-cycle chips; spaced-repetition revision
  ladder [3,7,14,30,90] (Decision #20) with Revised/Forgot buttons and
  per-topic next-revision display; study-session logger (minutes + topic
  link) with 7-day/total stats and recent-session list.
- **Body (3.3)** — Workout log (7 types × 3 intensities, minutes, note);
  week/month/total stats; weight trend with 7-point moving-average chart
  (Recharts), min/max range, 7d/30d deltas (Decision #21); measurements for
  chest/waist/hips/arm/thigh/body-fat with same-day upsert.
- **Skin (3.4)** — Daily AM/PM check-in card with either-or streak and
  5-week calendar; product shelf with type/brand/opened-date/PAO months;
  PAO expiry ladder (Decision #22) surfacing expired/soon/expiring first;
  Finished/Discard lifecycle; note field.
- **Growth hub (3.5)** — /growth is now a 6-module launcher (Habits,
  Routines, Goals, Study, Body, Skin) with live per-module stats; habits &
  routines moved to #/growth/habits and #/growth/routines (two-tab screen
  preserved); all deep links direct-load.
- **Today v3 (3.6)** — new sections: "Goal tasks due" (undone tasks from
  active goals due today or overdue, one-tap complete with roll-up refresh)
  and "Revisions due" (due topics across active courses with Revised/Forgot
  inline); Skincare AM/PM card with streak; welcome empty-state unchanged
  for fresh users; hasNoData covers all Phase 3 surfaces.

### Verification log (Phase 3)

- 44 new unit tests: roll-up math (milestone ratio vs manual flag, direct
  tasks, empty goal), goal health boundaries incl. leap-day daysUntil,
  ladder gaps/graduate/forgot-restart/due-semantics, pacing bands (exact
  ±10pp/−25pp boundaries — caught a floating-point boundary bug, fixed by
  6dp rounding), start-day counting, month+leap elapsed, milli formatting,
  moving average, 7d/30d delta cutoffs, half-open week window, PAO ladder
  boundaries + month-end clamp (Jan 31 → Feb 28/29) + no-PAO, skin streak
  grace/gap cases. **134/134 total green; lint + `tsc` clean.**
- Browser golden path (live dev server, fresh user): register → Today v3
  (skincare card) → Growth hub 6 cards → Goal "Run a half marathon" →
  milestone + 2 tasks → toggle task (milestone 50%, goal 25% = (0.5+0)/2) →
  toggle manual milestone (75% = (0.5+1)/2) → 83% after standalone task done
  (2.5/3) — every number hand-verified → Study: course with 5-topic bulk
  paste → topic todo→learning→done (revision auto-scheduled +3d, 20% pace)
  → 45m session logged ("45m this week") → seeded due revision appears on
  Today → "Revised" advances ladder to stage 1, next +7d (2026-09-13) ✓ →
  Body: 35m cardio workout (week/month tiles) → weight upsert same-day
  (72.5 → 73.4 replaced, not duplicated) → 5-point trend chart with
  −0.4 kg/7d delta (hand-checked) → Skin: product + PAO 6M (181d left,
  expiry 2027-03-06 hand-checked) → AM check-in → 🔥1-day + calendar ✓ →
  Today v3 widgets live (goal task complete + revision buttons work from
  Today) → dark mode + deep-link reload persistence ✓.
- API matrix (curl): unauth 401; empty title / bad workout type /
  revise-not-due all 422; foreign-or-missing goal 404; every endpoint
  200 in dev.log with **zero 500s**.
- Fixed during build: CourseTopic index referenced a non-existent userId
  column (schema push failure); StudySession↔CourseTopic relation added for
  topic-titled sessions; sub-route schema imports resolved to the wrong
  file (made each route self-contained).
- Screenshots: `download/saarthi-today-v3.png`,
  `download/saarthi-body.png`, `download/saarthi-skin.png`,
  `download/saarthi-goals-dark.png`.

## Phase 4 — Investments & Net Worth deepening ✅

- **Price history (4.1)** — every investment price create/change auto-upserts
  a dated `InvestmentPricePoint` (one per day); holdings expose
  `priceHistory` (≤30 points) + `priceDeltaPaise/Pct` vs the previous
  recorded price; sparkline on each holding row, full chart in the sheet.
- **Portfolio allocation (4.2)** — `allocationByType` (pure, unit-tested)
  over open positions; donut + percentage bars on the Invest screen,
  largest-first, empty-safe.
- **Net-worth trend (4.3)** — `NetWorthSnapshot` table (BigInt parts, unique
  per user+day); lazy upsert on every Today / `/api/overview/networth` read;
  forward-filled series (`netWorthTrendSeries`, carry-forward flagged);
  Overview card charts 90 days with last-snapshot / 7d / 30d delta chips.
- **Net worth everywhere (4.4)** — Money hub card and Today tile show the
  delta vs the last stored snapshot (fallback labels before history exists).
- **One formula** — `reduceNetWorthParts` (services/networth.ts) is the
  single definition of net worth; Today and the snapshots both flow through
  it (Decision #24).
- **Migration** — `prisma db push`: `InvestmentPricePoint` +
  `NetWorthSnapshot` tables + relations; dev server restarted after push.

### Verification log (Phase 4)

- 17 new unit tests (price-series dedupe/ordering/window + non-finite
  filter, price-change 2-dp pct boundaries incl. zero-previous null,
  allocation sums/sort/zero-total guard, trend carry-forward over gaps,
  no-invented-pre-history, same-day duplicate wins, window truncation,
  month-boundary stepping, trend-delta nulls). **151/151 total green;
  lint + `tsc` clean.**
- API matrix (curl, fresh user phase4@saarthi.app): investment with opening
  buy → same-day price patch upserts ONE point (289,050 → 300,000 collapses
  to a single 2026-09-06 point); two backdated seeded points →
  `priceDeltaPaise` 22,000 / **+7.91% (hand-verified)**; net-worth trend
  today-only after account add → ₹31,000 (30,000 investments + 1,000
  liquid), same-day snapshot re-upsert verified (3,000,000 → 3,100,000);
  seeded backdated snapshots with a gap → series carries forward on gap
  days, deltaPct 19.23 vs previous snapshot (hand-verified), 7d/30d null
  while history is short; unauth 401; bad `days` param falls back to 90.
- Browser golden path: Today tile (₹31K, first-snapshot fallback) → Money
  hub delta line → Invest screen (allocation donut Stock 100% · ₹30K,
  sparkline row "▲ ₹220 (+7.91%) vs last price") → sheet price-history
  chart + delta → Overview trend chart with plateau-shaped carry-forward,
  "▲ ₹5K · vs last snapshot" chip → dark mode + deep-link reload
  persistence ✓. Zero 500s in dev.log; no console errors.
- Screenshots: `download/saarthi-networth-trend.png`,
  `download/saarthi-allocation-sparkline.png`,
  `download/saarthi-overview-dark.png`,
  `download/saarthi-invest-phase4.png`.

## Phase 5 — Intelligence Layer ✅

- **Budgets (5.1)** — recurring monthly cap per expense category
  (upsert-one-per-category); `lib/budgets.ts` pace engine (calendar-fraction
  expected spend, over/watch/on_track bands, straight-line month-end
  projection, safe-per-day, on-track ratio for the Life Score); Budgets
  screen (`#/money/budgets`) with month summary + per-category rows
  (progress bar tone by band, projection, safe/day), form sheet with
  category chips (already-budgeted disabled); Money hub card; Today card
  with OVER/WATCH/ON-TRACK chip and top-risk category.
- **Travel (5.2)** — `Trip` table + `Transaction.tripId` relation (SetNull);
  phase derived from dates (lib/trips.ts, unit-tested); Travel screen
  (`#/money/travel`) bucketed Happening-now / Upcoming / Past with budget
  progress + countdowns; trip detail (`#/money/travel/<id>`) with hero
  (spent / left / day X of Y), daily spend bars (pure CSS, zero-filled
  window), category split, transaction ledger with detach (✕), trip-scoped
  "Add expense" (opens Quick-Add with the trip pre-attached); trip chips in
  Quick-Add whenever a trip is ongoing, last-trip memory; Today trip widget
  (ongoing or next planned).
- **Life Score (5.3)** — `lib/lifescore.ts` pure scorer (9 components → 3
  pillars → overall; missing data skipped); service measures real inputs
  (month in/out, budget ratio, net-worth delta, habit rate30, 7-day
  workout/study minutes, 30-day journal count + mood avg, skin streak) with
  "ever used" guards so untouched features read as —, not 0; Today ring
  card (conic-gradient) + full breakdown on the Journal tab (Reflection
  pillar home).
- **Insights (5.4)** — `lib/insights.ts` pure rule engine + service
  aggregating across pillars; Today "Insights" section (top 4, severity
  tinted, deep-linked); `/api/insights?limit=` for the full ranked list.
- **Wiring** — Money hub gains Budgets + Travel module cards; Quick-Add
  invalidations extended so budgets / trips / ['trip'] / lifeScore /
  insights refresh after every money, growth, journal, skin and study
  mutation; transaction create/update/list accept `tripId`.
- **Migration** — `prisma db push`: `Budget` (unique user+category) +
  `Trip` tables, `Transaction.trip` relation + index, User/Category
  relations; dev server restarted after push.

### Verification log (Phase 5)

- 66 new unit tests (budget pace fractions incl. leap-month, band
  boundaries at exactly 100%/+10pp, projection rounding, safe/day floor +
  no-overshoot-spread, on-track ratio; trip phase/duration/countdowns
  incl. leap-day windows, zero-filled series with out-of-window exclusion,
  peak day; Life Score component clamps/null-skips + hand-verified pillar
  means (50/70/75 → 65) and rounding (78.49 → 78); insight rules trigger /
  stay-silent boundaries + severity ranking + cap). **217/217 total green;
  lint + `tsc` clean.**
- API matrix (curl, fresh user): budgets 401 unauth · 422 on income
  category / zero amount · upsert updates without duplicating · pace
  hand-verified (₹4,500 of ₹9,000 on day 6/30 = 50% vs 20% → watch);
  trips 422 on end<start and negative budget · foreign tripId 404 ·
  spend ₹2,500 + ₹3,120.50 = ₹5,620.50 · 6-day zero-filled series
  (Sep 1–6) · detach returns total to ₹2,500 · trip delete keeps the
  ledger (balance intact); Life Score: no income → savings skipped,
  after +₹1L income savings component 100, wealth 50 with null net-worth
  history excluded; insights surfaced "Food ahead of pace" + "Saving 90%
  of income"; Today payload carries budgetsToday + tripToday. Zero 500s.
- Browser golden path (live dev server, phase5 demo user): Today with Life
  Score ring, Budgets card (WATCH), Goa trip widget (ON BUDGET), Insights
  cards → Budgets screen numbers match API (trending ₹22.5K = 4,500÷0.2,
  safe/day ₹187.5 = 4,500÷24) → budget edit sheet prefilled → Travel →
  trip detail (day 6 of 30, daily bars peak Sep 5, category split 89/11)
  → "Add expense" ₹500 with trip pre-attached → total ₹6,120.50 → another
  ₹150 updates LIVE to ₹6,470.50 → Journal Life Score breakdown (Wealth 50
  = savings 100 + budgets 0, others —) → setting a Groceries budget moved
  the Today Life Score 50 → 75 (mean(100,50) hand-verified) → Money hub
  Budgets + Travel cards with live subtitles → dark mode + deep-link
  reload persistence ✓. No console errors.
- Bugs found during verification and fixed:
  1. Quick-Add saved without trip context: txn mutations invalidated
     `qk.trips` but not the `['trip', id]` detail family → trip detail
     totals went stale until reload; fixed by adding the `['trip']` prefix
     pattern to transaction / bill-pay invalidations.
  2. Quick-Add account selection captured null when the accounts query
     was cold at mount → Save permanently disabled (pre-existing Phase 1
     edge, exposed on a fresh session); rewritten as DERIVED state
     (stored id if valid, else first loaded account) — also self-heals
     stale localStorage ids from other users. Trip memory got the same
     tri-state derived treatment (explicit pick/unpick always wins).
  3. Trip-detail chart aria-label claimed the full trip range; now
     reflects the actual rendered window [start, min(end, today)].
- Screenshots: `download/saarthi-phase5-today.png`,
  `download/saarthi-phase5-budgets.png`, `download/saarthi-phase5-trip.png`,
  `download/saarthi-phase5-lifescore.png`,
  `download/saarthi-phase5-today-dark.png`.

## Phase 6 — Advanced Capture ✅

- **Capture hub (6.0)** — `#/money/capture` with four tabs (Voice · Message ·
  Receipt · Import), reached from Money-hub "Capture" and "Import CSV" cards
  (`#/money/import` deep-links straight to the Import tab). Every AI path
  funnels into the SAME Quick-Add review sheet via a new `preset` prop —
  amount, direction, date, note, category and the capture source are
  prefilled, the user confirms, nothing auto-saves.
- **Deterministic parser (6.1)** — `lib/capture.ts`: amounts (₹, Rs, /-,
  Indian + western grouping, 1.5k / 2.4L / 1.5 cr suffixes), dates (today /
  yesterday / day-before / last Friday / "5 aug" / numeric DD-MM with
  most-recent-past rule, injectable clock), direction keyword vote with
  exact-word stems (received-then-spent ties stay null), note extraction
  (quoted spans win, stopword strip), category guesser (name match →
  keyword hints → null; income direction defaults to the income category).
- **CSV engine (6.2)** — `lib/csv.ts`: RFC4180 parser (quotes, escaped
  quotes, newlines in fields, CRLF), header-alias mapping (date/narration/
  withdrawal amt/deposit amt/amount/type/category and more), debit-vs-type
  disambiguation by content sniff over date-valid rows, signed-amount and
  debit/credit shapes, per-row drafts with human errors, duplicate keys,
  planImport (ledger ∪ in-file, first wins).
- **AI capture service (6.3)** — `services/capture.ts` + `/api/capture/
  {text,voice,receipt}`: rules → LLM fallback (strict JSON prompt,
  brace-balanced extraction, zod-validated, rupees→paise at the boundary),
  ASR pipeline returning the transcript, vision receipt reader (merchant/
  total/date/paid-via, `model: ''` server default, 422 with actionable
  copy when no total is readable). All endpoints user-scoped, size-capped,
  401 without a session; category suggestion included on request.
- **Bulk import (6.4)** — `POST /api/transactions/import`: per-row value
  validation collecting failures (bad rows never sink the file), duplicate
  skip vs ledger date-span + in-file repeats, all creates + one net balance
  adjustment in a single DB transaction, `source='csv'` on every row.
- **Wiring** — hooks (`useParseCaptureText/Voice/Receipt`, `useImportCsv`
  with the full money-family invalidation), client-safe response types in
  `lib/types.ts` (no server SDK in the browser bundle), Money hub cards.

### Verification log (Phase 6)

- 53 new unit tests (amount grouping/suffixes, date conventions incl.
  most-recent-past and DD/MM swap, direction ties, CSV quoting/garbage-row
  tolerance/DR-CR suffixes/ambiguous-direction refusal, duplicate keys,
  WAV header bytes + resampler + chunked base64). **270/270 total green;
  lint + `tsc` clean.**
- API matrix (curl, fresh user): text capture deterministic "spent 250 on
  swiggy yesterday" → ₹250/out/Sep 5/rules + Food category; LLM fallback
  "ordered pizza … twelve fifty last night" → ₹12.50/out/llm engine;
  voice TTS→ASR→parse loop ("spent two hundred fifty rupees…") → transcript
  returned, ₹250/out/asr+llm; receipt (PIL-rendered BIG BAZAAR) → ₹745.50,
  2026-09-04, "big bazaar", vision engine; unauth 401; empty text 422;
  short audio 422; import value-errors fail per-row (0 amount, bad date,
  unknown category) while good rows import.
- Import ledger math hand-verified: ₹1,000 start + salary ₹45,000 − Swiggy
  ₹412 − Uber ₹230.50 − ATM ₹2,000 − validation-test rows → balance exact
  to the paise; RE-IMPORT of the same statement → "1 created · 3 duplicates
  skipped" (browser-run), in-file repeat collapsed.
- Browser golden path: Message tab → example chip → parse → draft card →
  Review & save → prefilled Quick-Add (₹340, Expense, Food) → Save → ledger
  row with **source=whatsapp**; Import tab → Load sample → detected
  debit/credit columns → junk row flagged, 4 readable → import → dedupe
  summary; Receipt tab → real file upload → vision draft ₹745.50 "big
  bazaar" → saved with **source=ocr**; Voice tab renders idle/recording
  states (real mic needs a human — the ASR loop was proven at API level
  with TTS-generated speech); dark mode + deep links ✓. Zero 500s in
  dev.log; no console errors.
- Bugs found by browser verification and fixed:
  1. `deposit amt` missing from the credit-column header aliases → the
     most common bank-CSV shape failed detection; added + regression test
     with a garbage row.
  2. Content sniffing required EVERY cell numeric → one junk row broke
     debit/credit detection; sniff now trusts only date-valid rows.
- Screenshots: `download/saarthi-capture-voice.png`,
  `download/saarthi-capture-message.png`,
  `download/saarthi-capture-import.png`,
  `download/saarthi-capture-dark.png`, `download/saarthi-money-hub.png`.
- Demo data under the phase6 test user (HDFC Savings with imported
  statement + whatsapp/ocr captures). Test receipt image: PIL-drawn
  (librsvg text rendering in the sandbox proved unreliable — Decision #32).

## Phase 7 — Gamification, Polish, Security Hardening ✅

**Schema:** `InsurancePolicy` (type/insurer/policy number/sum assured BigInt/premium
+ frequency/anchored `nextPremiumDue`/maturity/nominee/status) and
`Transaction.clientKey` (unique-per-user idempotency key, nullable) — one
`prisma db push`, Prisma client regenerated + dev restart.

**Pure engines + tests (37 new → suite 307/307):**
- `lib/insurance.ts` — drift-free anchored premium advance (Jan 31 → Feb 28 →
  Mar 31, leap-safe), annualized premium normalization (integer-exact),
  30/15/7/1 renewal ladder reusing the FD convention (+ 'due'/'overdue' rungs),
  coverage summary (active-only, attention count). 13 tests incl. 6-month
  chained-anchor drift checks.
- `lib/gamification.ts` — XP weights, 100·n level curve with banded titles,
  25 deterministic badges (streaks, counts, net-worth milestones ₹1L/₹10L/₹1Cr,
  Life Score ≥70, savings ≥20%, protection). 14 tests incl. exact boundaries
  and null-safety.
- `lib/rate-limit.ts` — sliding-window limiter with injectable clock,
  per-key isolation, lazy prune. 10 tests incl. exact expiry boundaries
  (two test expectations were initially mis-modeled — fixed to the consistent
  "call expires exactly windowMs after it was made" semantics).

**Services & API:** insurance (create/list+summary/update/delete/payPremium —
pay advances one anchored period + optional linked expense mirroring the
balance rule), gamification (20 aggregate queries incl. per-habit longest
streaks, trailing-30d savings rate, latest snapshot, Life Score reuse),
auth-sessions (list with current flag / revoke one / revoke others).
Routes: `/api/insurance` (+[id], /[id]/pay), `/api/gamification`,
`/api/auth/sessions` (+[id] DELETE, /revoke-others POST), `/api/export`.
Rate limiting applied to login/register (10/15min/IP) and all three capture
endpoints (30/min/user) with 429 + Retry-After. Security headers in
next.config (nosniff, referrer-policy, permissions-policy; deliberately
iframe-friendly, Decision #37).

**UI:** Insurance screen (`#/money/insurance`: coverage hero, Needs-attention
section, policy rows with renewal countdown + progress, pay-premium sheet with
account picker + note, edit/delete via the form sheet; live annual-premium +
next-due preview), Money hub Insurance card, Today insurance-premium widget +
gamification level chip in the header, Settings profile card (level ring,
XP progress bar, 25-badge grid earned/locked), Security section (active
devices, revoke, sign-out-others), Export-my-data button (downloads the full
JSON dump via `apiRaw`), offline banner, CSS confetti celebration (external-
store driven — new badges/level-ups only, first load baselines silently).
PWA: `manifest.webmanifest` + `icon.svg` + apple meta.

### Verification log (Phase 7)

- Unit 307/307, lint + tsc (src) clean.
- curl matrix: policy create → list summary (cover/annualized/attention),
  ladder `d7` → "Due in 4 days"; pay premium → nextDue 2026-09-11 →
  2027-09-11 + balance −₹25,000 exact; gamification profile (XP 2, level 1,
  badges `networth-1l` + `protected` derived from real data); sessions list →
  login → revoke-others → old token 401; login rate limit 401×10 → 429;
  export JSON with `Content-Disposition: attachment` and no secrets;
  clientKey replay → `deduped: true` with balance unchanged; 401s on all
  new routes unauthenticated.
- Browser golden path: sign-in → Today level chip; add policy (term life,
  due in 2 days) → NEEDS ATTENTION with countdown; pay premium via UI →
  due advances a year; Today insurance widget; Settings badges grid +
  security (sign-out others → only CURRENT remains); offline: banner +
  Quick-Add queued in localStorage → reconnect auto-flush → server row
  landed → replay deduped; journal entry → first-journal badge → confetti
  fired (seen-set 2 → 3); dark mode + deep-link reload persistence.
- Fixed during verification: (1) TanStack `networkMode` pause swallowing the
  offline path (Decision #38); (2) nested `<button>` inside PolicyRow →
  div[role=button]; (3) activity mutations now invalidate `qk.gamification`
  so XP/badges update immediately after check-ins/journal/bills/etc.;
  (4) export route needed a raw-response wrapper, not `withUser`.
- Screenshots: `download/saarthi-phase7-{today,insurance,settings,today-dark}.png`.
- Demo data under phase7-1788722@saarthi.app (HDFC Savings, 2 policies,
  journal entry, 5 transactions).

## Phase 8 — Portfolio Planner: "Every Rupee Has a Job" ✅

**Origin:** the user's directive — the app must solve the *real* problem: people
can't see all their money across accounts, FDs/RDs, stocks, bonds, gold, crypto
and real assets in one planning view, can't manage returns, and can't decide
with full knowledge (bucket structure, DICGC limits, credit-rating risk,
coupon ≠ guaranteed return, rebalancing discipline, time-horizon mapping).
Their full framework (₹1 Cr starter table, FD ladders, bond ladders as a
pseudo-salary, index-first equity, 5 portfolios) is now the app's planning brain.

**Schema:** `job` (String?) on Account/FixedDeposit/RecurringDeposit/Investment/
Asset; Investment gains `ratePct`/`creditRating`/`maturityDate`/`couponFrequency`
(Decision #41); new `PortfolioTarget` (unique user+job). One `prisma db push`
+ regenerate + dev restart.

**Pure engine + tests (31 new → suite 340/340):** `lib/planner.ts` —
- 6 jobs with guideline ranges + purpose statements (Decision #39);
- suggestion engine per entity kind; `buildJobPlan` (allocation 2dp, drift pp,
  status on_plan/drift/no_target, signed add/trim moves collapsing <₹1 to 0,
  outside-guideline flags with ±0.5pp grace, unassigned tracking);
  `planHealth` (empty/unset/aligned/drift);
- 3 presets (Starter balanced = the ₹1 Cr table mapped to jobs; Growth tilt;
  Capital protection) — each unit-tested to sum to exactly 100;
- `dicgcExposure` — per-institution aggregation (savings+FD+RD) with
  normalisation ("HDFC Savings" ≈ "hdfc"), insured/uninsured split at
  ₹50,000,000 paise, boundary test at exactly ₹5L;
- `incomeMachine` + `couponsInMonth` — maturity-anchored coupon calendar
  (quarterly/half-yearly/month-end clamps verified; matured bonds pay
  nothing; final coupon counts), FD accrual, trailing-12m distributions,
  yield on income-producing base; a 100× rate-conversion bug was caught by
  hand-verified tests before any UI existed;
- 14 knowledge cards + credit-rating metadata + horizon map.

**Services & API:** `services/planner.ts` (user-scoped overview: holdings from
5 wealth sources → buildJobPlan + income machine + DICGC; `replaceTargets`
transactional PUT; `parseJob`/`parseCreditRating`/`parseCouponFrequency`
validators shared by all wealth services). Routes: `GET/PUT /api/planner`.
`job` + bond fields accepted by accounts/fds/rds/investments/assets routes
and services (zod enums from `JOB_KEYS`/`CREDIT_RATINGS`/`COUPON_FREQUENCIES`).
Today snapshot extended with `plannerToday` (drift alerts top-2, DICGC
over-limit count, monthly income; null when no wealth).

**UI:** `PlannerScreen` at `#/money/planner` — hero (invested wealth, plan
health chip, income stats), six-job allocation rows (progress, target vs
actual, drift, add/trim hints, top holdings, guideline warnings), Balance
moves card, Income machine card (scheduled-this-month / average / annual +
per-source breakdown + honest-labelling footnote), DICGC exposure card
(insured/uninsured progress per bank), "Decide with full knowledge"
accordion (14 cards), horizon table, TargetsSheet (6 inputs, live sum
validation, 3 presets). `JobPicker` added to account/FD/RD/investment/asset
sheets with live suggestions; investment sheet gains a Bond details block
(rating with guidance notes, coupon, frequency, maturity) and a crypto
speculation hint. Money hub gets a full-width Planner card with health +
income sub-label; Today gets the drift/DICGC/set-plan nudge.

### Verification log (Phase 8)

- Unit 340/340, lint + tsc (src) clean.
- curl matrix (hand-verified to the paise): savings ₹3L + FD ₹4L @7.1% 24m
  quarterly + govt bond ₹2L @7.05% quarterly maturing 2027-03-15 + index fund
  ₹2L with a ₹500 dividend → total ₹11,00,000; liquidity 27.27% (drift
  +17.27, trim ₹1.9L), safety 54.55% (drift +29.55), income 0% (add ₹2.2L),
  growth 18.18%; income machine: scheduled Sep coupon ₹3,525 (= 7.05% × ₹2L ÷ 4),
  FD accrual ₹2,519.03/mo ((₹4,60,463 − ₹4L)/24 exact), distributions ₹416.70/mo,
  yield 5.6%; DICGC: "HDFC Savings" + "HDFC" FD aggregated to ₹7L → ₹5L
  insured, ₹2L exposed, overLimitCount 1; Today driftAlerts top-2 correct;
  401 unauth, 422 on unknown job / sum≠100 / duplicate job / rate > 100.
- Bugs found & fixed during verification: (1) FD rows were missing from the
  planner holdings list (RD values and DICGC saw FDs, the plan didn't) —
  caught because the total came back ₹7L instead of ₹11L; (2) DICGC name
  normalisation now strips " savings" suffixes so a savings account and an
  FD at the same bank aggregate per DICGC rules; (3) a 100× annual-coupon
  conversion bug in incomeMachine (missing /100 on ratePct) — caught by the
  hand-computed test before it could ship.
- Browser golden path: register → Money hub Planner card → add account with
  JobPicker (Auto · 💧 Liquidity suggestion) → planner shows ₹5.5L at 100%
  liquidity with guideline warning → "Set your plan" → Starter balanced
  preset → sum 100% ✓ → save → Drifting chip + Balance moves (trim ₹4,95,000
  = 90pp × ₹5.5L exactly; speculation correctly silent at 2pp) → knowledge
  accordion opens → Today shows "Portfolio drifting — 💧 Liquidity over
  target" nudge → invest sheet: bond type reveals Bond details block, job
  suggestion live-updates Growth → Income on type change, AA rating note
  renders → bond saved → planner hero updates (₹7.5L, monthly income ₹1.18K,
  per year ₹14.1K, moves recomputed to trim ₹4.75L) → dark mode + deep-link
  reload persistence. Zero 500s in dev.log, zero console errors.
- Screenshots: `download/saarthi-phase8-planner.png`,
  `saarthi-phase8-planner-dark.png`, `saarthi-phase8-planner-bond.png`.
- Demo data under phase8demo@saarthi.app (HDFC Savings ₹5.5L, NHAI AA bond
  ₹2L, starter-balanced plan) and phase8-*.@saarthi.app (full API-matrix set).

## Phase 9 — Goal Contributions & Effort Grid ✅

User directive: a 1-year goal needs **daily contribution tracking** ("how much
I am contributing to that goal") and a **GitHub-calendar-style grid** of daily
effort.

- **9.1 Schema** — `GoalContribution` (unique goalId+date — exactly-once like
  habit check-ins; amountMilli BigInt; upsert-replace) + optional quantified
  metric on `Goal` (`metric` money|count|null, `unitLabel`,
  `targetValueMilli`). One `prisma db push` + regenerate + dev restart.
- **9.2 Pure math** (`lib/goals-grid.ts`, 43 unit tests incl. exact band and
  level boundaries): window building (Monday-anchored, 400-day render cap
  with an untruncated pace window), daily benchmark, target-relative levels
  with quartile fallback, task-day levels, current/best streaks (today
  grace), pace bands (Decision #19 thresholds), needed-per-day (ceil,
  everything-left when due), projected finish, ₹/count ↔ milli conversions
  (2-decimal exact), month-label spans.
- **9.3 Services + API** — `GET/POST/DELETE /api/goals/:id/contributions`
  (grid payload / upsert / remove-by-date; future dates and metric-less
  logging rejected 422); metric fields through goal create/edit (explicit
  nulls clear tracking); `goalContributionsForToday` added to the Today
  snapshot (unlogged goals first, needed-per-day on each row).
- **9.4 UI** — `ContributionGrid` (GitHub layout: week columns, month-label
  spans, weekday gutter, goal-colour-tinted intensity, future ghosts,
  auto-scroll anchored on TODAY's column, tap-to-edit any past day);
  `ContributionPanel` in the expanded goal card (stats strip: all-time
  total · %, streak/best, needed-per-day, pace chip + projected finish;
  <10s quick log with Enter; pre-filled edit of any picked day with
  delete); metric pickers (None/₹ Money/Count + unit + target) in the goal
  form sheet; task-effort grid for metric-less goals; "Enable" hint row on
  plain goals; inline quick-log rows in the Today widget ("Logged 5 km
  today ✓").
- **Verified** — 383/383 tests, lint + tsc clean; 32/32 curl matrix (window
  math 366 days incl. leap-safe target year, benchmark ₹1L÷366, replace
  semantics ₹600 over ₹500, levels [3,4] hand-checked, needed/day ceil vs
  remaining÷365, future/zero/negative/non-ISO rejections, task grid [1
  task→L2], widget ordering unlogged-first); browser golden path: widget
  log 5 km → "✓ Done", expand Emergency fund → panel ₹15,572 · streak 6 ·
  ₹231.31/day · On track, tap 11-Sep cell (₹400) → pre-filled → type 1000 →
  Log → **total ₹16,172 (+₹600 exact), needed/day ₹229.67, projection
  re-dated** → dark mode + screenshots. Zero console errors; zero 500s.
- Bugs found by verification and fixed: (1) the 400-day render cap was
  silently truncating TOTALS/streaks — stats now compute all-time while the
  grid renders the capped window (Decision #43); (2) grid auto-scroll
  landed on the far future end — now anchored on today's column.
- Screenshots: `download/saarthi-phase9-today.png`,
  `saarthi-phase9-grid.png`, `saarthi-phase9-grid-dark.png`.
- Demo data under phase9ui@saarthi.app ("Emergency fund — ₹1L" with 60 days
  of seeded contributions, "Run 1000 km" count goal).

## Phase 10 — Planner ↔ Goals · Grids Everywhere · Roll-ups ✅

User directive: **both** (1) link money goals to portfolio jobs (planner ↔
goals) and (2) push the effort grid onto habits & study — with weekly/monthly
roll-up views (Decisions #44/#45).

- **10.1 Schema** — `Goal.job` (nullable portfolio-job tag, six-job
  vocabulary, money goals only). One `prisma db push` + regenerate + dev
  restart (repo convention — no migration files, Decision #2 portability).
- **10.2 Pure math** — `lib/effort-grid.ts` (25 tests): `trailingWindow`
  (entity-start → today, 400-day cap, future/leap-safe), `levelForCheckIn`
  (done→L4), `levelsForValues` (nearest-rank quartiles), `rollupWeeks` /
  `rollupMonths` (Monday-anchored, current period partial-to-date,
  full-history always), `formatMinutes`, `weekStartISO`. `lib/planner-
  goals.ts` (11 tests): `rollupGoalsByJob` — active-only, committed vs
  contributed, remaining/pct/achieved, deadline sort, unlinked backlog.
- **10.3 Services + API** — goals service validates `job` against the
  RESOLVED metric (422 on count-goal tag or unknown job; metric-away
  auto-clears); planner overview gains `goalsFunding` (per-job rollups +
  totals + backlog) and each job row carries its `goals`; goal grid payload
  gains full-history `rollups`; `GET /api/habits/:id/grid` and
  `GET /api/courses/:id/grid` return the shared effort-grid payload. Query
  invalidation wired both directions (contributions → planner, goal saves →
  planner, check-ins → habit grid, sessions → course grid).
- **10.4 UI** — goal form: Portfolio-job picker (money goals only); goal
  card: job chip (🛡️ Safety); planner: hero funding line + unlinked hint +
  per-job "Funds N goals" rows; habits: `HabitGridPanel` (tap a scheduled
  day to toggle its check-in — streak/stats/rollups recompute live);
  study: `CourseGridPanel` (tap a day to aim the session logger at it,
  banner + auto-reset to today); `EffortRollup` chips (This/Last week ·
  This/Last month) under ALL three grids.
- **Verified** — 413/413 unit tests (29 new), lint + tsc (src) clean;
  56/56 curl matrix on a fresh user (job echo/clear/auto-clear, 422s,
  planner rollups to the milli — ₹42,500/₹1,00,000 = 42.5%, target-less
  null pct, habit levels + rest-day entries + grace streak, quartile
  levels 20m→L1/30m→L2/45m→L3/60m+→L4, week/month rollups incl. the Aug/Sep
  boundary, 401/404); browser golden path: goal chips → expanded grid with
  correct cell tooltips → planner hero "₹54,845.67 saved toward 2 linked
  goals (₹1,00,000 committed)" + FUNDS-1-GOAL rows → habit tap-toggle
  (Sep 7 tinted, streak 2→4 via the grace chain) → study tap-to-log (Sep 8
  aimed, 25m logged, rollups 3h 45m→4h 10m) → job picker in the form →
  dark mode. Zero 500s, zero console errors.
- Screenshots: `download/saarthi-phase10-planner-goals.png`,
  `saarthi-phase10-planner-goals-dark.png`, `saarthi-phase10-goal-grid-
  rollups.png`, `saarthi-phase10-habit-grid.png`,
  `saarthi-phase10-study-grid.png`.

## Phase 11 — Goal Journal: Milestone Daily Progress ✅

User directive: "goal can be anything, for example to learn software
development as big goal — this can have multiple parts or milestones; each
milestone needs daily progress updates: how many hours worked today, what we
have done, what we are learning, and key learnings. Think properly and
improve this feature to its best." (Decision #46.)

- **11.1 Schema** — `MilestoneLog` (userId/milestoneId/date UTC-midnight,
  minutes 1..1440, did/learned/keyLearning ≤500 chars; unique milestoneId+
  date — exactly-once, upsert-replace) + `Milestone.targetMinutes` (optional
  planned effort, 0 clears, max 100 000 min). One `prisma db push` +
  regenerate + dev restart (repo convention, Decision #2).
- **11.2 Pure math** — `lib/milestone.ts` (14 tests): `sumMinutesByDay`
  (cross-milestone daily aggregation, ≤0 ignored), `timeProgress` (0..1,
  capped at 100%, null without a plan), `toContributionDays` +
  `journalStreaks` (reuses goals-grid streaks so the today-grace rule holds).
  Grid levels/roll-ups reuse `levelsForValues` / `rollupWeeks` /
  `rollupMonths` — minutes behave exactly like study minutes.
- **11.3 Services + API** — `services/milestone-logs.ts`:
  `logMilestoneProgress` (upsert; future dates 422), `removeMilestoneLog`,
  `listMilestoneLogs`, `goalDayLogs` (one day across ALL the goal's
  milestones — powers grid-tap editing), `goalJournal` (per-milestone
  summaries + recent-20 entries + goal-level grid aggregated over minutes +
  streaks + full-history roll-ups), `milestoneLogsForToday` (unlogged-goal
  nudge, one groupBy — no N+1). `shapeMilestone` now carries
  targetMinutes/totalMinutes/loggedToday/todayMinutes on every goal read.
  Routes: `GET/POST/DELETE /api/milestones/:id/logs`, `GET
  /api/goals/:id/journal`, `GET /api/goals/:id/journal/day?date=`;
  milestone POST/PATCH schemas take `targetMinutes` (zod: 0..100 000;
  service maps 0 → null = clear). Milestone PATCH invalidates the journal
  query via the returned goal id.
- **11.4 UI** — `MilestoneLogSheet` (one drawer for BOTH flows: per-milestone
  "Log progress" and per-day grid-tap; minute quick-chips 15m→3h, three
  reflection fields, single "Save day" that upserts filled rows and deletes
  emptied ones); `JournalPanel` (stats strip Total/Streak/Days, the shared
  ContributionGrid tinted with the goal colour in hour buckets, EffortRollup
  in `formatMinutes`); `MilestoneEditSheet` (rename · target date · planned
  hours — milestones were previously un-renameable); milestone rows gain a
  time chip ("⏱ 45m / 10h"), a capped-at-100% time bar, a "✓ today" badge,
  a Log button, and an expandable entry feed (did/📚 learned/💡 key
  takeaway, tap to edit, trash to delete, show-all beyond 3); goal form
  gains "Break it into milestones — one per line" (≤10) on create; Today
  gains the "Goal journals" widget with inline minutes quick-log mirroring
  the Phase 9 contributions row.
- **Verified** — 427/427 unit tests (14 new), lint + tsc (src/tests) clean;
  39/39 curl matrix on fresh users (upsert-replace keeps did on minutes-only
  rewrite, cross-milestone totals 90+45=165, window opens at the first log,
  today-grace streak 2, timeProgress 120/2400 = 0.05, day-fetch returns
  nulls for unlogged milestones, delete drops totals, planned-hours set AND
  0-clears, future/0/1441/fractional/non-ISO/501-char rejections 422,
  cross-user 404 both ways, Today nudge appears for unlogged goals, hides
  when the goal logged today, and disappears after a widget quick-log);
  browser golden path (register → goal with 3 starter milestones from the
  textarea → expand → journal grid → "Log progress" → chip 1h 30m + three
  reflections → Save day → stats/grid/roll-ups recompute (2h 45m after a
  3-milestone day edit) → milestone edit 10h → "45m / 10h" bar at 8% →
  Today nudge → 20m inline → row vanishes) → light + dark screenshots.
  Zero console errors. One real bug found by verification and fixed: the
  day-route threw before `withUser` (500 HTML) — validation moved into the
  service envelope (422 JSON); `targetMinutes: 0` initially stored 0
  instead of clearing — service now maps 0 → null.
- Screenshots: `download/saarthi-phase11-goal-journal.png`,
  `saarthi-phase11-goal-journal-dark.png`, `saarthi-phase11-today.png`.
- Demo data under goldenpath11@saarthi.app ("Learn software development"
  with 3 journaled milestones, "Guitar practice").

## Phase 12 — Learnings Digest · Drag-and-Drop Milestones · Goal Effort in the Life Score ✅

User directive (picking up the three "Next up" candidates verbatim): "'key
learnings this month' digest in the Journal tab, milestones reordering
drag-and-drop, or wiring milestone hours into the Life Score's growth pillar —
lets add these." All three shipped; no schema change was needed (the Phase 11
`Milestone.order` column already carried the sort).

- **12.1 Decision #47 — key-learnings digest.** `GET
  /api/journal/learnings?month=YYYY-MM` (defaults to the user's current month)
  returns every MilestoneLog of the month that carries a key takeaway, newest
  first, with goal + milestone context and `{count, totalMinutes, goalCount}`
  stats. Month validation is STRICT (`01-12`): JS Date silently normalizes
  month 13 into the next year, which would turn a bad query into an
  empty-but-200 digest — caught by the curl matrix before it could ship. The
  Journal tab renders it as the "💡 Key learnings" card under the Life Score:
  ‹ month › stepper (`shiftMonthKey`, next disabled at the current month),
  a stats line, learnings grouped by goal (busiest goal first, goal-colour
  count chip), each item = date · milestone · minutes + 💡 takeaway + 📚
  learned. Tap → navigate('/goals') (simpler interpretation: deep-linking a
  specific goal's journal arrives with hash-route params; the goals screen is
  one tap away today). Empty months get a hint to add 💡 takeaways when
  logging progress.
- **12.2 Decision #48 — drag-and-drop reorder.** Pure validation in
  `lib/goals.ts` `normalizeReorder` (the payload must be an EXACT permutation
  of the goal's milestone ids — no missing/unknown/duplicate; returns
  id → order or null) + `POST /api/goals/:id/milestones/reorder` which rewrites
  order 0..n-1 in one transaction. UI: a ⠿ grip on every milestone row when
  there are ≥2; pointer-based drag (mouse + touch + pen, `touch-none` grip)
  reorders rows LIVE as the pointer crosses each row's midpoint (row-swap, no
  transforms — stays correct with variable row heights), committing the new id
  order on release. **Real bug found by browser verification:** when a live
  swap re-parents the dragged row, Chrome drops the per-element pointer
  capture, so pointerup never reached the grip and the commit silently never
  fired (order reverted on reload). Fix: move/up/cancel listeners are
  registered on WINDOW at drag start (with an unmount safety net), which is
  immune to capture loss. Pointercancel snaps back to server truth.
- **12.3 Decision #49 — goal effort in the Life Score.** New growth component
  "Goal effort" = MilestoneLog minutes over the trailing 7 days vs a 150
  min/week target (~21 min/day of deliberate work on your own goals — slightly
  above the 120 study floor because goal work is self-chosen). Pairing with
  the study component is intentional: course study and personal goal effort
  are different disciplines and each caps at 100. The component is an
  OPTIONAL additive field on `LifeScoreComponents` (same precedent as
  `pickable?`) so existing payloads/tests stay valid; the standard
  "never journaled → null → skipped" guard applies. Because minutes now feed
  the score, log/delete mutations (and milestone/goal deletes, which cascade
  logs) invalidate the Life Score + learnings queries.
- **Verified** — 434/434 unit tests (7 new: shiftMonthKey incl. Dec/Jan +
  multi-year, normalizeReorder permutations, goalJournalScore + growth-mean
  with/without the component), lint + tsc (src/tests) clean; 32/32 curl
  matrix on two fresh users (permutation accept/rewrite 0..n-1 + restore,
  422 on missing/duplicate/unknown/empty ids, cross-user 404 + empty digest,
  learnings default-vs-explicit month, only-logs-with-takeaway counted,
  totalMinutes math, newest-first, cascade on log/milestone delete into both
  digest and score: 120/150 = 80 then 90/150 = 60, month-13 → 422); browser
  golden path (register → goal with 3 starter milestones → log 1h 30m with
  💡 on M1, 30m with 💡 on M2 → grips appear → drag M1 below M2's row
  midpoint: live swap → release → POST 200 → order survives reload → drag
  back up → server order restored; Journal tab: Life Score 80 with "Goal
  effort 80", digest "September 2026 · 2 takeaways · 2h across 1 goal",
  stepper to August shows the reviewed-month empty state and re-enables
  Next) → light + dark screenshots. Zero console errors; the only 500 in
  dev.log predates the parseBody fix (caught by the matrix itself).
  Second real bug caught by verification: the reorder route originally
  parsed the body OUTSIDE `withUser` (the exact Phase 11 regression pattern)
  → malformed JSON returned 500 HTML; parse moved inside the envelope → 422
  JSON.
- Screenshots: `download/saarthi-phase12-learnings.png`,
  `saarthi-phase12-learnings-dark.png`, `saarthi-phase12-goal-journal.png`.
- Demo data under goldenpath12@saarthi.app ("Learn software development"
  with three journaled milestones and two 💡 takeaways).

## Phase 24 — Plan presets · Exercise media · Progress photos ✅

**24.1 Five more plan presets.** `fitness-presets.ts` carried exactly one
template (Foundation A/B), hardcoded into the plan editor. It now holds six,
transcribed from the reference programmes supplied: **Full Body 3×** (beginner,
compounds only), **Upper / Lower** (4 days, intermediate), **Push / Pull /
Legs** (6 days, advanced), **Core & Belly Flow** (daily 15-minute circuit) and
**Mobility & Stretch** (upper body · spine · ankles, for rest days). Sets and
rep ranges are as written in the sources; **rest times are a documented
interpretation** — the sources gave sets × reps only, so the same guidance as
Foundation A/B applies (2–3 min on big compounds, 60–120 s on smaller moves).

The plan editor's "Foundation A/B" tab became a **Proven splits** picker with a
one-line level hint per template ("6 days · advanced"). Everything still lands
as an ordinary editable plan.

- **14 structural tests** rather than eyeballing 100+ exercise rows: every
  muscle group and equipment value is one the API accepts, every exercise
  prescribes reps XOR seconds (never neither, never both), every range runs the
  right way round, rest sits inside 10–600 s, names fit the 80-character limit,
  and no day repeats an exercise — a duplicate would collide on the
  `(userId, name)` unique key at create time.

**24.2 Exercise media — verified, not rebuilt.** The YouTube + photo path
already existed (Phase 19) and works: attaching
`youtube.com/watch?v=rT7DgCr-3pg` to Flat Bench Press surfaced
`video=rT7DgCr-3pg` in the session view alongside the PPL prescription
(4×8–12), and a non-YouTube URL was refused. The video ID is still derived at
read time and never stored (Decision #68). Note the route is **POST**
`/api/fitness/exercises/:id/media`, not PATCH.

**24.3 Progress photos (`ProgressPhoto`, new table).** Dated body photos with
a pose (front / side / back / other), a gallery grouped by day and a
side-by-side compare at `#/growth/body/photos`, linked from the Body screen.

- **Decision #81 — bytes stay in SQLite**, exactly like `Exercise.photoData`.
  This app has no media folder to configure, and these are the most private
  images it will ever hold, so they live in the same file as everything else
  rather than on a disk path or a CDN. The file route sets
  `Cache-Control: private, no-store` and is session-guarded — verified 401
  without a session, 200 with one.
- **Decision #82 — the weight is SNAPSHOTTED onto the photo at upload**, taken
  from the nearest weigh-in **on or before** that date (never a later one,
  which would attribute a weight the body did not have yet). A comparison view
  that re-derived the weight would drift the moment a reading was corrected.
  Verified: photos on 2 Sept and 23 Sept carried 62.0 kg and 62.76 kg
  respectively, not both the latest.
- Unique on `(user, date, pose)`: re-shooting the same pose the same day
  replaces it, while a second pose that day is a separate row. Verified both.
- Compare defaults to **oldest vs newest** — the comparison people actually
  want — and offers only poses present on BOTH sides, since half a comparison
  is not a comparison. It reports the gap in days and kilograms (+0.76 kg over
  21 days in the walkthrough).

**24.4 Verified.** 836/836 tests (+14), `tsc` and `eslint` clean. Curl matrix
over the photo API (upload, byte serving, 401 unauthenticated, same-pose
replace, second pose, non-image rejected, future date refused) and the media
API. Browser golden path: all six presets listed with level hints; creating
Push / Pull / Legs persisted 3 days × 7 exercises and activated it; the gallery
rendered three images (loading correctly once signed in through the form rather
than via a curl-injected token); Compare showed 2 Sept 62 kg → 23 Sept 62.76 kg.
Zero 500s.

---

## Phase 23 — Daily coach check-in ✅

The daily questions a coach actually runs through with a client, at
`#/growth/checkin`, with a Today card and a Growth hub entry.

**Decision #79 — the check-in asks only what nothing else records.** Weight is
a `BodyMetric`, protein is `NutritionDay` + `MealEntry`, training is a
`WorkoutSession` or a `Workout`. The check-in READS all of those to work out
what is already answered and shows them as done — tapping one jumps to the
screen that owns it. Only sleep, the subjective scales, steps and water are
stored here, in a new `DailyCheckIn` table (one row per user per day, unique,
upsert-replace). Nothing is ever kept in two places, so the check-in cannot
disagree with the screen the number came from. Verified live: a fresh day
already read 33 % complete with weigh-in and protein ticked off.

**Decision #80 — readiness averages what was answered, never what was
assumed.** Soreness and stress are inverted (`6 − v`) so every input points the
same way: higher is better. The score is the mean of the scales actually
answered — a blank is SKIPPED, never treated as a neutral 3, because "no
answer" is not "an average day". Below two answers it returns null outright:
one number is a mood, not a signal. Verdict bands are push ≥ 4.25, train
≥ 3.25, easy ≥ 2.25, else rest, and each result names its weakest input as the
limiter ("Energy is the limiter today") so the number is never a black box.
The card states how many of the four answers it is based on.

**Streak.** Consecutive days checked in, with the same grace rule as habits
(Decision #13): a check-in missing for TODAY does not break the run — the day
is not over — so the count falls back to yesterday.

**Partial saves.** `saveCheckIn` writes only the fields PRESENT in the payload,
so answering one question never blanks the others, while an explicit `null`
clears that one answer. Tapping an already-selected scale value clears it —
an answer has to be undoable. Verified: saving `{steps}` alone left energy,
sleep and water intact; `{energy: null}` cleared energy and kept soreness.

**Trends.** 30-day averages per field, each averaging only the days that
answered it (null, never 0, when nobody did), plus a readiness strip coloured
by verdict.

**23.x Verified.** 822/822 tests (+26), `tsc` and `eslint` clean. Curl matrix:
a good day (4/4/2/2) scored 4.00 "train as planned"; a wrecked day (1/2/5/4)
scored 1.50 "rest or deload" naming energy as the limiter; a single answer
returned null readiness; `energy: 9` was rejected and a future date refused.
Browser golden path: tapping Energy = 5 moved the verdict from "Train as
planned" to "Good day to push" and the basis from 3 of 4 to 4 of 4 live; Today
card read "1 left to log · Training · 4.3 · 83 %"; Growth hub read "1 left
today · 3-day streak". Zero 500s.

*Operational note:* `prisma db push` regenerates the Prisma client, but a
running `next dev` keeps the old one in memory — the new model reads as
`undefined` until the dev server is restarted. Hit twice now (Phase 22
`BodyProfile`, Phase 23 `DailyCheckIn`); restart after any push.

---

## Phase 22 — Body composition · Coach targets ✅

**22.1 The whole smart-scale panel, with no migration.** `BodyMetric` was
already a generic `(kind, valueMilli)` table with one row per kind per day, so
adding twenty readouts was a CONSTANTS edit, not a schema change: body fat,
BMI, muscle mass/rate, skeletal muscle, fat-free weight, body water, water
weight, bone mass, protein mass/rate, visceral and subcutaneous fat, fat mass
index, BMR, metabolic age, body score, ideal weight — plus neck, shoulders,
forearm and calf on the tape side. `BODY_METRIC_GROUPS` drives the panel
layout, so the UI follows the data.

- **Decision #75 — categorical readouts are derived, never stored.** A scale's
  "obesity level" and "obesity grade" are bands over BMI and body fat. Storing
  them would let them drift away from the numbers they describe, so they are
  computed in `lib/body.ts` instead.
- **Decision #76 — per-kind value ceilings.** One global cap cannot serve
  kilograms, percentages and kilocalories at once: a real BMR of 1592 kcal is
  1_592_000 milli-units, which the old 1_000_000 cap rejected, while that same
  cap would have accepted a 1000 kg body weight. `BODY_METRIC_MAX_MILLI` gives
  each kind its own bound (400 kg / 100 % / 300 cm / 10 000 kcal / 130 yrs),
  enforced in the service with the metric's own label in the error.

**22.2 `BodyProfile` (new table).** Height, birth year, sex and goal weight —
the facts a scale cannot weigh. Every field is nullable and clearing one is
meaningful, so the panel degrades gracefully rather than guessing.

**22.3 Derived figures (`lib/body.ts`, pure + tested).** `bmiMilli`,
`leanMassG`/`fatMassG`, `mifflinStJeorBMR`, `idealWeightG` (BMI 22 midpoint),
`ageFromBirthYear`, and health bands (`bmiBand` WHO, `bodyFatBand` ACE,
`visceralFatBand`, `bodyWaterBand`).

- **Decision #77 — a logged reading always beats a derived one, and an
  honest gap beats a guess.** Derived values fill only the cells the user has
  not logged and are labelled `calculated`, so a scale's figure and Saarthi's
  arithmetic never fight over the same cell. Every helper returns **null**
  rather than inventing: BMR refuses when sex is unknown or `other` (there is
  no published Mifflin-St Jeor constant for it), body-fat and body-water bands
  refuse without a sex to band against, and `metricBand` returns null for
  metrics with no defensible reference range at all (a vendor "body score",
  muscle mass in kg). Showing "normal" with no basis is worse than silence.

**22.4 Coach targets (`lib/coach-targets.ts`).** The bracketed calorie and
protein tables a coach hands a client, encoded as deterministic lookups —
no AI call, no hidden reasoning. `lookupBracket` clamps weights outside
50–100 kg to the nearest row and flags them `extrapolated` so the UI can say
the table does not really cover you.

- **Decision #78 — three goals, one table.** Fat loss reads the table
  directly; maintain adds 15 % and lean bulk 30 % to the same figure, so the
  goals stay consistent with each other instead of coming from three unrelated
  formulas. Protein is the strength-training figure on every goal — it is held
  high while cutting precisely because that is when muscle is at risk. Every
  suggestion carries a `rationale` naming the bracket it came from.
- *Float trap, caught by a test:* `1700 × 1.15` is `1954.9999999999998` in
  binary floating point and rounded DOWN to 1950. The percentages are integers
  (`× 115 / 1000`) for exactly this reason.

**22.5 Surface.** Body screen rebuilt as Composition | Movement.
Composition shows the profile strip, a goal picker with the suggested targets
and their rationale, weigh-in pace vs target, goal distance with an ETA, then
the grouped panel. Each card expands to a chart, min/max, 30-day delta and the
recent readings — each individually deletable, which needed `id` on
`BodyMetricSeries.points` (it was absent, which is why `useDeleteBodyMetric`
had sat imported-but-unused in the Body screen since Phase 3).
`CompositionSheet` takes the entire panel in one pass and saves it in one call;
a field emptied that previously held a reading clears it.

- The goal line on the weight chart computes its own Y domain. Recharts'
  `ifOverflow="extendDomain"` did not reliably stretch an `auto` domain, so a
  70 kg goal was clipped off a 62–62.8 kg chart — invisible in exactly the case
  where it matters. Verified: the axis now spans 61.4–70.6.
- `formatMetricDisplay` rounds for the panel (one decimal, or none for kcal /
  years / points). `formatMilli` keeps its tested ≤3-decimal contract for
  storage-precision contexts — "BMI 19.808" is false precision when the height
  behind it was typed to the nearest centimetre.

**22.6 Verified.** 796/796 tests (+37), `tsc` and `eslint` clean. Curl matrix
replayed a real smart-scale panel (62.76 kg, 9.82 % fat, 1592 kcal BMR at
178 cm / age 25 / male): BMI 19.8 "healthy range", body fat "athletic", lean
mass 56.6 kg and ideal weight 69.7 kg all derived and labelled; a second
weigh-in produced +0.25 kg/week "on track" and a 29-week ETA to the 70 kg goal;
switching to fat loss moved the target to 1500 kcal with protein held at 110 g;
a 300 % body-fat reading was rejected with "Body fat must be between 0 and 100".
Browser golden path over the panel, expandable charts and the goal line. Zero
500s in the dev log.

---

## Phase 21 — Nutrition truth-fix · Food library · Thali builder ✅

**21.0 Data-correctness pass (bugs, not features).** Three numbers disagreed
with each other across screens:

- **Decision #71 — one combined daily nutrition total.** `fitnessSummary` read
  protein from `NutritionDay` only and ignored `MealEntry`, so the Today card
  and the Fitness hub's Protein tile undercounted anyone who used the *richer*
  logging path. `reports.ts` and `lifescore.ts` already merged both sources;
  the summary was the outlier. New pure helper `mergeDailyNutrition()`
  (`lib/meals.ts`, 6 unit tests) union-merges manual rows with per-day meal
  sums. `NutritionDayDTO` now carries **both**: `proteinG`/`caloriesKcal` are
  the COMBINED truth every average, chart and adherence check reads, while
  `manual*` and `meal*` keep each source visible. A day logged only through
  meals no longer vanishes from history, and `adherence30` counts it.
  *Trap this creates, and the guard for it:* the quick-add chips build on
  `manualProteinG`, never the combined total — adding a chip to the combined
  figure would fold the meal log into the manual row and double-count from then
  on. There is an explicit regression test for exactly that arithmetic.
- **Decision #72 — Body counts every kind of movement.** `listWorkouts` counted
  only quick `Workout` rows, so a logged strength session was invisible in
  Body's week/month stats even though the Life Score already counted both.
  Closed sessions (`durationMin > 0`) now join the feed as
  `WorkoutDTO { source: 'session' }`, shaped read-only: the id is a *session*
  id, so those rows carry no delete button (the endpoint is `/api/workouts/:id`)
  and tap through to the session instead. `qk.workouts` joined
  `fitnessInvalidations()` so Body refreshes when a session changes.
- The Body weight chart hardcoded `#0D9488` / `#e2e8f0` and broke in dark mode;
  it now uses `var(--primary)` / `var(--border)` like every other chart.

**21.1 Food library (`FoodItem`).** Configure a food once — "100 g chana =
20 g protein" — and every portion scales from it. Macros are stored per
`basisQty` of `unit` (default per 100 g; also ml and piece) as integer
**milli-units** (Decision #21), so 20.5 g/100 g stays exact at a 30 g portion
(6.15 g, not 6). Categories, veg flag and an optional S/A/B/C protein tier.
Presets from the coach's protein-source chart seed as **ordinary user rows**
the user can edit or delete — no special "system" state to reason about.

**21.2 Thali builder (`Recipe`/`RecipeItem`).** Combine foods with quantities
and get exact totals, per-ingredient calorie share, and per-serving figures.
**Decision #73 — recipe totals are never stored.** They are recomputed from
the items on every read, so correcting a food's macros instantly fixes every
plate built on it (verified end-to-end: chana 20 g → 22 g moved the saved
plate from 17 g to 18 g protein with no user action).

**Decision #74 — a logged meal is a SNAPSHOT.** The counterpart to #73: when a
food or plate is logged, the macros are computed server-side and frozen into
the `MealEntry`; `foodItemId`/`recipeId`/`quantityMilli` are kept for
provenance only. Editing a food later must never rewrite what you ate last
Tuesday (verified: the same correction above left the logged entry at 17 g).

**21.3 Math.** `lib/food.ts` is pure and clock-free (`scaleFood`, `sumMacros`,
`composePlate`, `perServing`, `toWholeGrams`, `energyMismatch` — an advisory
4/4/9 sanity check on user-entered macros). 27 unit tests, including the
worked example: 50 g chana + 200 g curd = **302 kcal · 17 g protein ·
39.9 g carbs · 9.1 g fat**, split 60.3 % / 39.7 % by calories. The builder UI
calls the same `composePlate()` the server uses, so the live preview can never
disagree with the saved plate. Whole-gram rounding happens once, only at the
`MealEntry` save boundary.

**21.4 Surface.** `#/growth/fitness/food` — Foods tab (search, veg and category
filters, add/edit sheet, starter-preset groups) and Plates tab (saved plates
with expandable breakdowns, one-tap "log 1 serving"). The builder logs straight
into the day *without* requiring a name, so the calculator is never a dead end.
API: `/api/food`, `/api/food/items[/:id]`, `/api/food/recipes[/:id]`,
`/api/food/presets`, `/api/food/log` — all zod-validated and user-scoped, with
cross-account food references rejected in `assertOwnedFoods`.

**21.5 Verified.** 759/759 tests (+33), `tsc` and `eslint` clean, curl matrix
over the full food API, browser golden path (seed presets → configure chana and
curd → live builder totals → save → log → correct a food → plate updates while
history holds), zero 500s in the dev log.

---

## Phase 13 — Strength Coach: Plans · Session Logger · Progression · Fuel ✅

User context: a full natural-bodybuilding coaching plan (beginner A/B full-body,
progressive overload, 0.15–0.30 kg/week lean bulk, 1.8 g/kg protein on a
vegetarian diet, supplement triage, weekly tracking) — "I want to build add
this in our app that can help me train and achieve all of these goals and
manage my daily progress." Saarthi already had a quick `Workout` log
(cardio minutes) and `BodyMetric` weigh-ins; this phase adds the structured
strength-training system around them.

- **Decision #50 — sessions are a second, structured workout model.** The
  quick `Workout` log (7 types × minutes) stays for cardio/quick entries;
  strength training gets `WorkoutSession` + `SetLog` (per-exercise
  weight×reps/seconds). Both share the Life Score movement component and XP
  `workouts` stat — one honest "did you move this week" signal, no double
  counting. A session opens with `durationMin` 0 and is finished by setting
  it (1–1440); "open" sessions surface on Today for 24h.
- **Decision #51 — nutrition targets are user-editable with coach defaults.**
  Suggested starting point from the latest weigh-in: protein 1.8 g/kg,
  calories 40 kcal/kg (62.8 kg → 113 g / 2512 kcal — matches the coach's
  numbers), lean-bulk pace 250 g/week with an on-track band of ±50%.
  Defaults are never enforced; nothing is medical advice. Quick-add chip
  values are typical portions (labels note), stored as absolute day values
  via the established upsert-replace convention; the UI accumulates.
- **Decision #52 — "next workout" is rotation-based, not calendar-based.**
  The active plan's days form a cycle; the Today card offers the day AFTER
  the most recent session's plan day (wrapping). Alternating A/B emerges
  naturally, rest days aren't hard-coded, missed days never skip ahead, and
  a single-day plan always offers that day. Calendar-weekday mapping was
  rejected as brittle for real-life schedules (this is the simpler
  interpretation, documented per the golden rule).

- **13.1 Schema (8 tables, one `prisma db push`):** `Exercise` (user-scoped
  library, unique userId+name — SetLogs and PlanExercises reference it so
  history survives plan edits), `WorkoutPlan` (exactly one `active` per user
  powers the Today card), `PlanDay` (rotation order, label, focus),
  `PlanExercise` (sets × rep-range or seconds-range prescription, rest, note),
  `WorkoutSession` (date, label snapshot, plan/planDay nullable SetNull,
  `durationMin` — 0 means still open), `SetLog` (weight in GRAMS per
  Decision #21, reps OR durationSeconds, warm-up flag), `NutritionProfile`
  (one per user: kcal + protein targets, 1.8 g/kg basis, lean-bulk g/week),
  `NutritionDay` (unique userId+date, upsert-replace like BodyMetric).
- **13.2 Pure math (`lib/fitness.ts`, 42 tests):** Epley est-1RM with a
  20-rep cap (light sets otherwise inflate the estimate); volume = Σ weight×reps
  with warm-ups excluded and bodyweight/timed sets contributing 0 (documented —
  no fabricated numbers); top set by est-1RM tiebroken on absolute weight;
  `progressionDelta` with a ±0.5% noise band (holding a weight = flat, not
  failing); `nextPlanDay` rotation (after the last session's plan day, wrap
  around — A/B alternation emerges naturally, missed days never skip the
  cycle); `bulkPace` kg/week from first→last weigh-in (needs ≥2 points and
  ≥7 days span) with an on-track band of ±50% around the user's target
  (250 g/week default → 125–375 band, bracketing the coach's 0.15–0.30 kg
  guidance); `suggestNutrition` (1.8 g/kg protein, 40 kcal/kg — 62.8 kg →
  113 g / 2512 kcal, matching the coach's numbers); `proteinAdherence` over
  logged days only; `sessionsInWindow` trailing-7-day filter.
- **13.3 Presets (`lib/fitness-presets.ts`):** Foundation A/B one-tap plan —
  Workout A reproduces the coach's six exercises verbatim (Squat/Bench/Lat
  Pulldown/RDL/Lateral Raise 3×8–12 … Plank 3×20–45s timed); Workout B is
  constructed in the same mirrored full-body spirit (documented
  interpretation — the source plan detailed only A). 12 veg protein
  quick-add chips (paneer 100 g ≈ 18 g P, whey scoop 24 g, soy chunks 50 g
  dry 26 g, greek yogurt, milk, dal, tofu, chana, PB, curd, oats, roti) as
  TYPICAL portions with a visible "check package labels" note; supplement
  reference card (creatine useful · whey optional · B12 check · D individual ·
  fat burners avoid).
- **13.4 Service + API:** `services/fitness.ts` — exercises find-or-create,
  plan CRUD (transactional preset creation, exclusive activation), day/
  prescription editing, session lifecycle (open → sets → finish sets
  durationMin), add-set returns the refreshed session detail (targets +
  last-session top set + progression) so the UI stays instant; nutrition
  day upsert-replace (nulls clear the day) + profile upsert; `fitnessSummary`
  (next workout by rotation, open-session pickup within 24h, week
  sessions/minutes/volume, weight pace vs target, today's protein vs target,
  top-3 progression highlights); `exerciseProgress` per-exercise series
  (top set, est-1RM, volume per session date). 16 routes under
  `/api/fitness/*`, all `withUser`-scoped; 26/26 curl matrix including
  cross-user 404s, 422 bounds (weight 500 kg cap, set needs reps or seconds,
  protein ≤ 500, targets ≥ mins), delete-used-exercise 409.
- **13.5 Wiring into existing systems:** Life Score movement component now
  counts `Workout.minutes` + `WorkoutSession.durationMin` (trailing 7 days,
  either-ever null guard) — strength sessions and quick cardio logs share the
  150 min/week target; XP stats count sessions in `workouts` so the existing
  workout XP + badges (Iron Introduction → Body Banker) apply to real
  training; the session-finished sheet carries an optional "🪺 Add to goal
  journal" bridge that prefills minutes + "Trained: {label} — top set …"
  into the milestone daily log (same-day upsert-replace, user confirms —
  the journal stays the single source of truth for goal effort).
- **13.6 UI:** `#/growth/fitness` with Train / Progress / Fuel tabs; Train =
  week strip, pulsing open-session banner, next-workout card (rotation hint,
  exercise targets, one-tap Start), plan list (active badge, edit/delete),
  recent sessions; session logger = per-exercise cards with target chip,
  last-time top set prefill ("last: 50kg×8"), progression badge
  (PR pace ↗ / holding / below last ↘), weight+reps steppers (timed exercises
  get seconds), warm-up toggle, set chips with tap-to-delete, Finish with
  duration + goal-journal bridge; Progress = bulk-pace card (links to Body
  for weigh-ins), trained-exercise chips, per-exercise est-1RM/top-set chart
  with climbing/holding/regressing trend; Fuel = today's protein/kcal rings,
  quick-add chips accumulating client-side (API stores absolute day values —
  Decision #21 replace semantics), custom g/kcal add, targets editor with
  suggested-from-latest-weigh-in, 7-day history with hit-marks, 30-day
  adherence line, supplement card. Growth hub gains a Fitness tile; Today
  gains a Training card (open session → continue, next workout → start,
  protein line) that renders only when the user actually trains.
- **Bugs caught by verification:** (1) new plan-drawer content overflowed a
  short viewport with the Create button below the fold and no scroll —
  both forms now use the established `max-h-[62vh] overflow-y-auto` body
  wrapper; (2) the Progress tab passed the raw `picked` state (null) to the
  per-exercise query instead of the defaulted `activeId`, leaving the chart
  skeleton forever on first render; (3) a scripted matrix check deleted the
  55 kg progression set before asserting the 2-session series (test-ordering
  bug, not app code) — reordered.
- **Verified** — 476/474→476 unit tests (42 new), eslint clean, tsc (src)
  clean; 26/26 curl matrix (two fresh users, auth-gate 401, rotation
  A→B→A, set numbering, warm-up exclusion from volume, timed plank stored,
  progression 52.5→55 up, week stats 2×/85 min, nutrition replace
  semantics, Life Score movement 56.7 from sessions, gamification counts
  sessions); browser golden path (register → Fitness → Foundation A/B
  one-tap → Start → log 50 kg×8 typed set → finish 45 min → "✓ done ·
  800 kg moved" → 🪺 bridge writes 45 m into the milestone journal (goal
  grid shows the day at level 2) → Fuel chips 18+24 g → rings 42/113 +
  385 kcal → targets editor → Today "🏋️ Workout B · 42/113 g protein · 1×
  this week") → light + dark screenshots; zero console errors. Rate
  limiting on /auth/login tripped once during scripted verification — the
  guard behaves as designed (Decision #37).
- Screenshots: `download/saarthi-phase13-train.png`,
  `saarthi-phase13-train-dark.png`, `saarthi-phase13-progress.png`.
- Demo data under gp13fit-1789321282@saarthi.app (test1234): Foundation A/B
  plan, 1 finished Workout A session (Squat 2 sets + plank), protein 42 g
  logged, goal "Natural bodybuilding transformation" with a bridged journal.

## Phase 14 — Password Vault · Rest Timers · Plate Math · Workout History ✅ (recovered recap)

Built in a context window whose notes were lost; this section was reconstructed
from the code, tests, and worklog after the fact. Facts verified against the
repo (2026-09-20):

- **Zero-knowledge password vault** (`src/lib/vault-crypto.ts`,
  `src/services/vault.ts`, `/api/vault/*`, Settings → Password Vault): the
  master password never leaves the browser. WebCrypto derives an AES-256-GCM
  key via PBKDF2-SHA256 (default 310k iterations, OWASP 2023; bounds
  100k–2M); the server stores only salt + iteration count + a GCM "verifier"
  blob + per-entry ciphertext (`VaultConfig`, `VaultEntry`). Entries are
  encrypted/decrypted client-side; unlock = verifier decrypts. Reset deletes
  config + entries. A random generator with rejection sampling (no modulo
  bias), entropy readout, and passphrase mode (`vault-wordlist.ts`) are
  included. Tests: `tests/vault-crypto.test.ts`.
- **Rest timers** (`src/lib/rest-timer.ts`, `tests/rest-timer.test.ts`) and
  **plate math** (`src/lib/plate-math.ts`, `tests/plate-math.test.ts`) inside
  the training flow, plus a **workout-history calendar**
  (`src/lib/workout-history.ts`, `tests/workout-history.test.ts`) — the three
  fitness follow-ups the user picked after Phase 13.
- Demo/fresh-account flows around these features are user-scoped as
  everywhere else; the vault has no server-side recovery by design.

## Phase 15 — Life Principles & Dincharya ✅

The identity layer of the "entire life OS" expansion: the user's personal
constitution — rules they refuse to break — reviewed daily, with honest
adherence math wired into the Life Score, plus a one-tap Dincharya preset for
the routine builder.

**15.1 Schema + migration.** `Principle` (title ≤120, detail ≤500 "why",
category ∈ character|discipline|money|health|relationships|work, active flag)
and `PrincipleCheck` (status kept|broken|na, note ≤500 for the "what happened /
trigger" reflection) — exactly-once per (principle, day) via the unique pair,
same convention as habit check-ins; re-marking upserts. Pushed with
`prisma db push` per repo convention; `src/lib/db.ts` gained a generic
hot-reload guard that re-instantiates the cached Prisma client when the
generated datamodel signature changes (dev-only; fixes "model undefined"
after `db push` on a warm server).

**15.2 Pure math + tests** (`src/lib/principles.ts`,
`tests/principles.test.ts`, 20 tests → 558 total): `adherenceRate` =
kept / (kept + broken) over an inclusive window with today clamping; `na`
and unmarked days are excluded from the denominator and unmarked days never
punish; **null when nothing was judged** (no data ≠ 0%). `keptStreak` walks
back with the habit grace rules (unreviewed today doesn't break; a broken
past day does; `na` continues without adding). `longestKeptRun` iterates the
entry range (gaps inside reset — untracked ≠ kept). `breaksInWindow`,
`lastBreak`, `recentDayStrip` (14-day review strip), category/status guards.
`DINCHARYA` preset invariants tested against the routine-builder limits
(≤20 steps, ≤80-char titles, minutes 0–240/null).

**15.3 Service + API.** `src/services/principles.ts` (user-scoped everywhere)
with stats-shaped list (`todayStatus`, `todayNote`, `keptStreak`,
`longestRun`, `adherence30`, `breaks30`, `lastBreak`, `recent`), check
upsert (future days rejected), `principlesForToday` (unreviewed first for
the Today card) and `adherence30Aggregate` for the Life Score. Routes:
`GET/POST /api/principles`, `PATCH/DELETE /api/principles/[id]`,
`POST /api/principles/[id]/check`.

**15.4 Life Score + Today integration.** Growth pillar gains the optional
"Principles kept" component (ever-reviewed guard, Phase 12 additive
precedent) — verified live: 5 kept / 7 judged → 71. `TodaySnapshot`
carries `principlesToday`; the Today screen renders a Principles section
with the same 3-state control as the deep screen; `hasNoData` includes
principles.

**15.5 UI.** `#/growth/principles` screen: header stats (reviewed today /
30-day kept % / breaks), per-principle rows with ✓/✗/– Seg3 control,
expandable panel (14-day strip, longest run, breaks, last break, the "why"
quote, and — when broken — the trigger-note editor with its Save button
**in the label row** so it can never hide behind the bottom nav), archive +
restore, delete with history, and an empty state with six tap-to-prefill
starter principles. Growth hub gains the Principles card; the Routines tab
gains a one-tap **Dincharya preset** (13 classical steps, hidden once a
Dincharya-named routine exists).

**15.6 Verified.** 558/558 unit tests, eslint + tsc (src) clean; curl
matrix (create/check/upsert/day-stats/future-reject/bad-status-422/empty-
title-422/bogus-token-401/Life Score component/Today snapshot/routine
install); browser golden paths — existing user: mark kept→broken→na with
Life Score 50→0, break-note capture + reload persistence, seg-state round
trip; fresh user: register → Growth hub card → starter prefill → save →
Routines → Dincharya install (13 steps) — zero console errors; light + dark
screenshots.

- **Decision #53 — principle checks are a 3-state daily upsert.** kept /
  broken / na, exactly-once per (principle, day) with re-marking allowed
  (people reconsider). Unlike habits there is no toggle-off: the honest
  options are always "kept", "broken", or an explicit "n/a".
- **Decision #54 — adherence is kept / judged, and "no data" is null.** Only
  days the user actually marked count (na + unmarked excluded from the
  denominator), so honesty about a rough month can't be diluted by skipping
  days, and an untouched principle reads "—" rather than a fake 0%.
- **Decision #55 — the Life Score's growth pillar gains "Principles kept"
  as an optional additive component** (ever-reviewed guard, same precedent
  as Phase 12's Goal effort): touching the feature but scoring 0 is honest;
  never touching it is invisible.

## Phase 16 — Books, In-App Reader & Quotes ✅

Life-OS expansion Phase B: a private library where books are *read*, not just
listed — EPUBs render inside Saarthi with highlights/notes/bookmarks and
automatic progress, PDFs get an embedded viewer with page notes, physical
books get page tracking — and every book can feed the quotes vault.

**16.1 Schema.** 6 tables via `prisma db push` (repo convention): `Book`
(format physical|epub|pdf, status to_read|reading|finished|abandoned, page
progress for page-based books, CFI `position` + `percent` for EPUBs, file
blob + name/mime/size for uploads, rating 1–5 + takeaway on finish,
comma-separated tags, startedAt/finishedAt), `ReadingSession` (date, minutes
0–1440, pages — several per day allowed, unlike daily checks),
`Highlight` (EPUB CFI range or page, text ≤2000, note ≤1000, pen color
yellow|green|blue|pink|purple, chapter label; one-to-one with an optional
`Quote`), `BookBookmark` (CFI or page + label), `BookNote` (per-page margin
notes for PDF/physical), `Quote` (text ≤1000, author, source, optional book
link, tags, favorite, highlightId provenance). User relations added.

**16.2 Pure math + tests** (`src/lib/reading.ts`, `tests/reading.test.ts`,
28 tests → 586 total): `pageProgressPct` (2-decimal, clamps >100%, null
without totals) and `progressPct` unifying pages vs stored EPUB percent;
`readingStreak` (consecutive >0-minute days, habit-style grace: un-logged
today never breaks); window sums (minutes/pages, future-clamped);
`pagesPace` (pages / *elapsed* days since startedAt, so a 2-day-old book
isn't diluted by a 14-day window); `etaDays` (remaining / pace, **rounded
up**, null when finished/unknown); tags (trim, case-insensitive dedupe,
6×24 caps); deterministic daily-quote rotation — FNV-1a hash of the ISO
date → index, favorites get their own cycle first, `sortQuotesForRotation`
is total (favorite, then id) so two fetches can never disagree; rating
guard. All clock reads injectable (Decision #8).

**16.3 Service + API.** `services/reading.ts` (user-scoped everywhere):
library CRUD with per-book stats (streak, minutes7d, pace, ETA, sessions,
last read), status transitions (→reading sets startedAt, →finished sets
finishedAt), page clamp on totalPages, session logging with optional
current-page bump + to_read→reading promotion, file storage (base64 in,
15 MB cap, mime must match format, byte-exact binary GET with
`Content-Disposition: inline`), progress endpoint (pages ↔ percent
format-guarded both ways), highlights/bookmarks/notes CRUD, quotes vault
(favorite/tag/book filters, idempotent `quoteFromHighlight` that copies text
+ book provenance), and Today payloads (`readingForToday` — most recently
read book with progress label + streak; `dailyQuoteForToday`).
Routes: `GET/POST /api/books`, `GET/PATCH/DELETE /api/books/[id]`,
`POST/GET /api/books/[id]/file` (binary GET bypasses withUser like export),
`POST /api/books/[id]/progress|sessions|highlights|bookmarks|notes`,
`DELETE /api/books/[id]/sessions/[sid]|highlights/[hid]|bookmarks/[bid]|notes/[nid]`,
`GET/POST /api/quotes`, `PATCH/DELETE /api/quotes/[id]`,
`POST /api/quotes/from-highlight`.

**16.4 Today + hub integration.** TodaySnapshot gains `readingToday` (the
book to continue, tapping opens the reader for epub/pdf or the tracker for
physical) and `dailyQuoteToday`; `hasNoData` includes books+quotes. Growth
hub gains Library and Quotes cards with live subs (reading count, weekly
minutes, favorites).

**16.5 UI.** `#/growth/library` (stats tiles, status filter chips, book
cards with gradient covers + progress + Read button), `#/growth/library/[id]`
(progress control with page setter, start/finish/re-open/drop, rating +
takeaway verdict card on finish, 4-tile stats incl. pace/ETA, recent
sessions with delete, Highlights/Notes/Bookmarks tabs — highlight→"Quote"
button, inline note editor, manual passage adder for physical books),
`#/growth/library/[id]/read` — the in-app reader: epub.js loaded lazily
client-only from an authed blob (`apiRaw` → ArrayBuffer), selection toolbar
(5 pen colors + optional note), saved highlights painted as annotations,
font-size cycling, bookmark-this-spot, highlights/bookmarks drawer with
tap-to-jump, prev/next page controls, session sheet; resume = `display(saved
CFI)`. PDF mode: object-URL iframe with `#page=` jumps, page-set progress,
page notes, bookmarks, same drawer/session sheet. `#/growth/quotes` — daily
quote hero, search, favorites filter, tag chips, book links, favorite
star, edit sheet with optional book select.

**16.6 Reader engineering notes (hard-won).** epub.js mis-measures `'100%'`
inside the centered shell → renderTo gets real pixel dimensions + a
post-display `resize()`; `Locations.percentageFrom` doesn't exist in 0.3.93
(a TypeError silently aborted the relocated handler — found by
instrumentation) → percent comes from `relocated`'s own `start.percentage`
and is recomputed via `percentageFromCfi` after `locations.generate()`
resolves (fixes the wrong-percent-on-resume case); progress saves are
immediate + deduped by last-saved CFI (StrictMode-remount-safe) instead of
debounced; page-turn buttons call `rendition.next()/prev()` directly (the
lib's click zones map to its window-wide stage and are unreliable inside a
centered shell).

**16.7 Verified.** 586/586 unit tests, eslint + tsc clean; 56/56 curl
matrix (register → physical CRUD/progress/sessions with live streak/pace/ETA
math → EPUB upload with mime guards + byte-exact round-trip → percent/CFI
progress with format guards both ways → highlights/notes/quotes/bookmarks →
quote-from-highlight idempotency → favorites/tag filters → Today snapshot →
finish flow + rating bounds → cross-user 404s, bogus-token 401, 422 bounds →
orphan quotes survive book delete via SetNull); browser golden paths —
physical book: add → start → set p.142 (44%) → log 35m/22p session (streak 🔥1,
pace 22 p/day, ETA 9d = ⌈178/22⌉); EPUB: file picked in the form → reader
renders real text → page-turn → position + 28.57% persisted → bookmark at
exact CFI → reopen resumes with a correct 29% badge; quotes: UI add → daily
hero + list; Today shows Reading + Quote of the day cards. **Zero console
errors**; light + dark screenshots in download/saarthi-phase16-*.png.
Bugs caught en route: tz="" passed to sheets crashed `todayISO` (RangeError)
— screens now pass `user.timezone`; a Unicode-ellipsis arg rest broke compile
(fixed); epub.js engineering notes above.

- **Decision #56 — two progress systems, one number.** Page-based books
  (physical/pdf) track currentPage/totalPages; EPUBs (no true pages) track a
  CFI position + percent 0..100. `progressPct()` unifies them; pace/ETA math
  only applies where pages exist, EPUB pace is minutes-based.
- **Decision #57 — book files live in SQLite, capped at 15 MB.** Personal
  EPUBs/PDFs are 0.5–8 MB; the blob travels with the database (zip-friendly,
  no object storage), the GET serves bytes with the stored mime, and format
  mismatches are rejected at upload.
- **Decision #58 — the daily quote is a deterministic rotation, not random.**
  hash(date) % pool picks today's line (favorites cycle first); same day →
  same quote everywhere (Today card, quotes screen), the vault cycles over
  time, and no RNG means no state to store.
- **Decision #59 — quotes can be born from highlights (provenance kept).**
  One-to-one `highlightId` link makes re-quoting idempotent ("Already in
  your vault"), and deleting the book SetNulls the link so the quote
  survives with its author/source intact.

## Phase 17 — Skills Tracker & People CRM ✅

Life-OS expansion **Phase C**. Two new Growth modules: a deliberate-practice
tracker (XP → levels → ETA) and a personal CRM whose reconnect engine nudges
you before a relationship goes quiet. Schema: `Skill`, `SkillPractice`,
`Person`, `Touchpoint` via `db push` (the repo's schema-sync mechanism — no
migrations folder; documented since Phase 0).

**17.1 Skill tracker.** `lib/skills.ts` (pure, injectable today): a FIXED
cumulative XP curve `LEVEL_XP = [0, 100, 300, 600, 1000, 1500, 2100, 2800,
3600, 4500]` (10 levels; L10 = 75 focused hours), `levelForXp`/`xpForLevel`
with clamping, `levelProgress` (2-decimal pct, repo Math.round convention),
`practiceStreak` with the same grace rule as habits/reading (an un-logged
today doesn't break it), `minutesTrailing` across month-ends and leap days
(tested on Feb 29), `paceMinutes` (window start = day 1, clamped to today),
`etaDaysToLevel` (ceil; **0 when reached, null when pace unknown — "no data"
is never "tomorrow"**), `recentPracticeStrip`. 28 unit tests.

**17.2 People CRM.** `lib/people.ts` (pure): cadence defaults by importance
(core 3 → 14d, regular 2 → 30d, extended 1 → 90d) with a clamped per-person
override; `reconnectState` (last touch derived from Touchpoint rows — never
stored): `never` / `ok` (dueIn>0) / `due` (===0) / `overdue` (<0);
`reconnectRank` (overdue < never < due < ok) and `sortForReconnect`
(most-overdue first, soonest-ok first, name ties); `daysSince` (leap-year
and year-rollover tested); touch window sums + 14-day strips. 20 unit tests.

**17.3 Services + API.** `services/skills.ts` + `services/people.ts`
(user-scoped, zod-validated) and 8 routes: `/api/skills` (GET/POST),
`/api/skills/[id]` (PATCH/DELETE), `/api/skills/[id]/practice` (POST),
`/api/skills/[id]/practice/[pid]` (DELETE), and the people mirror
(`/api/people`, `/api/people/[id]`, `/api/people/[id]/touch`,
`/api/people/[id]/touch/[tid]`). Practice/touch rows allow multiple per day
(the math aggregates); past days are loggable, future days rejected (422);
list payloads carry stats + recent logs with ids for one-tap undo.

**17.4 Today + Growth hub.** Snapshot grows `skillsToday` (actives,
un-practiced first, minutesToday, best streak) and `peopleToday`
(overdue/never/due sorted, touched-today count); both feed the Today screen
("Skill practice" + "Reconnect" sections) and `hasNoData`. Growth hub gains
**Skills** and **People** cards with live subtitles.

**17.5 Screens.** `/growth/skills` — stats header, skill rows (level chip,
band progress bar, streak, ETA-to-target, TARGET ✓), expandable panel
(14-day intensity strip, XP/30d/last-practiced, recent sittings with
undo), starters, archive/restore, form sheet with category chips + target
slider. `/growth/people` — needs-a-tap / all / archived filter segments,
person rows (initials avatar, category, cadence, overdue/never/due badge),
expandable panel (touch strip, last-touch/30d/all-time, importance + tags +
notes, touchpoint history with undo), form sheet (circle, importance,
optional cadence override, role/contact/how-met/tags/notes).

**17.6 Verified.** 634/634 unit tests; eslint + tsc clean; 60/60 curl
matrix (skills CRUD → practice logging with live XP/level/streak/ETA math —
incl. exact `etaDays = ⌈1450/(50/30)⌉ = 870` — two-sittings aggregation,
log undo, archive ordering → people CRUD → cadence defaults + override →
reconnect transitions (never → ok → overdue-by-10) → today snapshot wiring →
cross-user 404s, bogus-token 401, 422 bounds → delete flows). Browser golden
paths: starter → skill (target L5) → log 25m → 🔥1, 25/100 XP → Lvl 2;
person (mentor/core→30d) → "Never touched" → log call → "Due in 30d",
touched-today 1 → cadence override 7d → backdated touch → "Overdue 3d",
"Needs a tap (1)", sorted first; Today shows Skill practice + Reconnect.
Zero console errors; light + dark screenshots in
download/saarthi-phase17-*.png. Dev-server note: after `db push`, the
Prisma client must be restarted even with the datamodel-signature guard
(node_modules require-cache holds the old client — restart is the fix,
matching the Phase 13 convention).

- **Decision #60 — XP is practice minutes, 1:1, on a fixed shared curve.**
  No multipliers or per-skill curves: a level-4 guitar and a level-4
  speaking mean the same effort (minutes are verifiable), levels are
  comparable across skills, and the ETA aims at a per-skill target level.
- **Decision #61 — ETA honesty: 0 means reached, null means unknown.**
  `etaDaysToLevel` returns 0 when the target XP is already banked and null
  when the trailing-30-day pace is 0/unknown — a skill with no recent
  practice shows no fake "3 days to level 8".
- **Decision #62 — freshness is derived, never stored.** The reconnect
  engine computes everything from Touchpoint rows at read time: back-dating
  a log instantly fixes overdue badges, and there is no stale
  `lastTouchAt` column to drift out of sync.
- **Decision #63 — cadence = importance default + explicit override.**
  Core/regular/extended map to 14/30/90 days; a per-person override
  (clamped ≥1) wins when human rhythm doesn't fit the bucket. Sort order
  for nudges: overdue (most-overdue first) → never → due → ok (soonest
  first).

## Phase 18 — Content Library & Ideas Lab ✅

Life-OS expansion **Phase D**. Two new Growth modules: a private watch/read-
later vault where YouTube plays in-app, articles open in a reader view, and
files stream from SQLite — plus a lean-canvas idea pipeline ranked by ICE
with a deterministic spark-of-the-day. Schema: `ContentItem`, `Idea` via
`db push` (the repo's schema-sync mechanism — no migrations folder;
documented since Phase 0).

**18.1 Content Library.** `lib/content.ts` (pure): `youtubeId` parses every
common URL shape (watch · youtu.be · shorts · embed · live · nocookie ·
music/m/mobile · bare 11-char ID passthrough) and rejects non-YouTube hosts;
`youtubeEmbedUrl` (privacy-enhanced nocookie player) + thumb URL; `isHttpUrl`
/ `isPrivateHost` (SSRF guard: loopback, RFC1918, link-local + cloud
metadata 169.254, CGNAT 100.64/10, IPv6 ULA, .local/.internal); `fileView`
routes video/audio/pdf/image vs download; `contentStats` — counts by status,
favorites, addedThisWeek (trailing-7 window ending today), completionPct
(done ÷ non-archived, 2-decimal), oldestUnconsumedDays (leap + year-rollover
tested); `extractArticle` — readability-lite: title → strip
comments/script/style/nav/header/footer/aside → prefer the longest
`<article>` → block tags become paragraph breaks → entities decoded (named +
numeric, malformed left intact, out-of-range codepoints dropped) → capped at
80k chars. 20 unit tests.

**18.2 Ideas Lab.** `lib/ideas.ts` (pure): `iceScore = impact × confidence ÷
effort` (ints 1..10 enforced; null outside range — no fake scores), 2-decimal
rounding; `iceBand` (strong ≥15 · promising ≥8 · seed); `nextPipelineStatus`
(spark → exploring → planned; launch is deliberate, not automatic);
`sortForAction` (forward stages first, then score desc, title ties);
`sparkOfTheDay` — hash(date) % pool over the id-sorted live pipeline (same
day → same idea everywhere, no state — the quote Decision #58 pattern);
`ideaStats` (counts, avgIce over the live pipeline only, bestIce ignoring
parked/dropped); `daysInPipeline` (floor 0, month-end/leap safe) +
`ageLabel`. 18 unit tests.

**18.3 Services + API.** `services/content.ts` + `services/ideas.ts`
(user-scoped, zod-validated) and 6 routes: `/api/content` (GET/POST),
`/api/content/[id]` (PATCH/DELETE), `/api/content/[id]/file` (POST base64
upload / GET raw bytes with stored mime / DELETE — books Decision #57
pattern, 15 MB cap, mime allowlist → 415), `/api/content/[id]/reader` (POST
fetch+extract, `?refresh=true` re-fetch, cached text serves when the site
can't be re-fetched), and `/api/ideas` + `/api/ideas/[id]` (GET/POST/PATCH/
DELETE). Kind auto-detects on create (YouTube → video, other URL → article,
file upload → file); title falls back to the hostname so pasting a link is
the only required step; moving to done stamps `consumedAt` (leaving clears);
URL change invalidates the cached reader text; launching stamps
`launchedAt` (unlaunching clears). 55/55 curl matrix incl. binary file
serving, cross-user 404s, bogus-token 401, 422 bounds.

**18.4 Screens.** `/growth/content` — stats tiles, filter segments (All ·
Queue · In progress · Done · ★ · archived toggle), rows with kind emoji /
status / age / tags / favorite star, expandable viewer: YouTube iframe
player in-app, article "Read here" (extracted text in a typographic pane
with refresh + original-link fallback), file player (video/audio inline,
PDF iframe, image, else download), status chips (Start · Done · Revisit ·
Archive/Restore). Form sheet: paste URL with live kind auto-detect hint, or
attach a file ≤15 MB. `/growth/ideas` — stats header (pipeline · avg ICE ·
launched), Today's spark card, segments (Pipeline · Launched · Shelved),
rows with ICE chip colored by band, expandable lean canvas (8 blocks rendered
only when filled + notes), forward-stage action chips (Start exploring ·
Move to planned · Launch 🚢 · Park · Drop · Back to pipeline). Form sheet:
category + stage chips, live ICE score hint while sliding, next-step field,
collapsible 8-field lean canvas.

**18.5 Today + Growth hub.** Snapshot grows `contentToday` (queue/active/
done counts, addedThisWeek, completionPct, oldestUnconsumedDays, nextUp =
the oldest unconsumed item) and `ideasToday` (pipeline/spark/launched
counts, avgIce, bestIce, sparkToday); both feed the Today screen ("Content
queue" with the next-up nudge + "Today's spark" card) and `hasNoData`.
Growth hub gains **Content** and **Ideas** cards with live subtitles.

**18.6 Verified.** 672/672 unit tests (38 new); eslint + tsc clean; 55/55
curl matrix (auto-kind detection → derived YouTube ID → hostname title →
status transitions stamping/clearing consumedAt → 15 MB-cap file upload with
correct-mime binary GET → 415 on zip → live article extraction of
paulgraham.com ("How to Do Great Work") with cached re-serve → ICE math
exact (7·8/3 = 18.67, 9·9/2 = 40.5) → pipeline ordering → launchedAt
stamp/clear → today snapshot wiring → cross-user 404s, bogus-token 401, 422
bounds → delete flows). Browser golden paths: starter prefill → YouTube
item with in-app player (iframe verified) → article saved → reader extracted
the real title + text → status moves → idea from starter → ICE sliders →
Today's spark card → exploring → planned → launched (segment move verified)
→ spark re-rotates after the launch → Today shows Content queue + Today's
spark. Zero console errors; light + dark screenshots in
download/saarthi-phase18-*.png. Dev-server restart after `db push` (Phase
17 convention).

- **Decision #64 — kind is derived from what the item IS, with an honest
  fallback.** YouTube URLs auto-become playable videos, other URLs become
  articles with a reader view, file uploads become files; anything else is a
  plain link. The viewer follows the row (a "link" pasted as YouTube can be
  promoted with one tap), and the title falls back to the hostname so pasting
  a URL is the only required keystroke.
- **Decision #65 — the reader view is readability-lite, cached, and
  SSRF-safe.** A pure string extractor (no DOM dependency, fully
  unit-tested) pulls title + paragraphs from fetched HTML; text is cached on
  the row so re-reads work offline and a failed re-fetch serves the cache;
  private/loopback/link-local/metadata hosts are refused and non-HTML
  content types fail with 415 — the server never becomes a proxy into the
  user's network.
- **Decision #66 — ICE is derived, lean canvas is free text.** impact ×
  confidence ÷ effort (2-decimal) is computed at read time from stored
  inputs, so re-tuning instantly re-ranks and nothing can go stale; the nine
  lean-canvas blocks are plain optional fields on the idea row rather than a
  structured sub-model — simpler to capture, simpler to edit, and the
  canvas grows with the idea instead of gating it.
- **Decision #67 — the spark of the day is a rotation, not a random pick.**
  hash(date) % pool over the live pipeline (Decision #58 quote pattern):
  same day → same spark on Today and the Ideas Lab, no RNG state, and it
  re-rotates as ideas launch (a launched idea leaves the pool
  automatically).

## Phase 19 — Exercise Media · Plan Generator · Meal Log ✅

Life-OS expansion **Phase E**. Three upgrades to the Strength Coach:
form media on any exercise (photo + YouTube demo that plays inside the
session view), a deterministic workout-plan generator, and a meal-level
food log beside the quick-add chips. Schema: `Exercise.mediaUrl/photo*`
and `MealEntry` via `db push` (the repo's schema-sync mechanism — no
migrations folder; documented since Phase 0).

**19.1 Exercise media.** Media lives on the Exercise row — attach once,
every plan and session shows it (Decision #68). A YouTube URL is stored;
its video ID is derived at read time with the same tested `youtubeId`
parser as the content library (never stored — Decision #62/#68). Photos
are blobs in SQLite capped at 5 MB, `image/*` only (415 otherwise).
Routes: `/api/fitness/exercises/[id]/media` (POST base64 JSON / DELETE
clears both) and `.../photo` (raw binary GET, books/content pattern).
`SessionExerciseDTO.media` carries `{ youtubeId, hasPhoto }`; the session
card shows compact "video"/"photo" chips that expand inline (iframe embed
in-app / image from the photo route) and a paperclip opens the media
sheet — reachable from the session view AND the plan editor's exercise
rows.

**19.2 Plan generator.** `lib/plan-generator.ts` (pure, deterministic —
same input → identical plan): day count picks the split (2 → Full A/B ·
3 → Push/Pull/Legs · 4 → Upper/Lower/Push/Pull · 5 → PPL+Upper/Lower ·
6 → PPL×2), goal only tunes prescriptions (strength 4×4–6 @180 s rest ·
muscle 3×8–12 · lean 3×10–15 + 2-set accessories · general 3×8–12), and
the equipment tier picks exercise variants — every catalog move defines
gym, dumbbells AND bodyweight forms, so any tier yields a complete,
barbell-free plan where needed. Output matches the plan-create payload
exactly, so the editor's "🪄 Generate for me" tab previews days +
`weeklySetVolume` (sets/muscle/week) and creates through the existing
endpoint — no new API. 17 unit tests (split table, prescription tuning
per goal, tier purity, uniqueness within a day, determinism, volume
totals).

**19.3 Meal-level food log.** `lib/meals.ts` (pure): `sumMealEntries`,
`combinedDayTotals`, `mealTypeBreakdown` (canonical breakfast → lunch →
dinner → snack order), `macroSplit` (4/4/9 kcal-per-gram, 2-decimal, null
when no macros — no fake 0%). `MealEntry` rows (date, mealType, name,
kcal, protein/carbs/fat) live BESIDE the manual `NutritionDay` row the
chips feed; the combined day total = meals + quick-adds with each source
labeled in the Fuel tab (Decision #70). Entries are delete-only — on
mobile, delete + re-add beats an edit sheet, and no in-place totals can
drift. Routes: `/api/fitness/meals` (GET ?date / POST) and
`/[id]` (DELETE returns the recomputed day payload); `getNutrition`
gains an optional date param and returns the `meals` block; the quick-add
arithmetic now adds onto the manual row only (no double-count with
meals). 12 unit tests.

**19.4 Verified.** 701/701 unit tests (29 new); eslint + tsc clean; 28/28
curl matrix (generated-shape plan create → media attach validation →
photo binary GET with mime → 415 on non-image → session detail carrying
derived media → clear + 404 after → meal entries with exact totals
(720/60 → 600/36 after delete) → future-date/name/bounds/meal-type 422s →
manual row independent of meal sums → cross-user 404s, bogus-token 401).
Browser golden paths: Generate tab (strength · 4 days · bodyweight →
preview shows Push-up 4×4–6 etc.) → plan created and active → session
started (badge fired) → YouTube media attached to Push-up with the
"✓ Video detected" hint → in-app iframe player opened and hidden → 2 sets
logged → finished at 25 min → Fuel tab: breakfast logged (Oats + whey
bowl 450/32) with per-meal grouping → quick-add chip stacked on top
("450 kcal · 32g from meals + 150 kcal · 5g quick-adds") → protein bar
counts the combined 37g. Zero fresh console errors; screenshots in
download/saarthi-phase19-*.png. Dev-server restart after `db push`
(Phase 17 convention).

- **Decision #68 — media lives on the exercise, IDs are derived.** One
  attach serves every plan, session and future feature that references
  the exercise; the YouTube ID is parsed from the URL at read time (the
  stored URL is the truth), and photos are 5 MB SQLite blobs like books
  and content files.
- **Decision #69 — the generator is a pure table, not an oracle.** Split
  = f(day count), prescriptions = f(goal), variants = f(equipment); no
  RNG and no exercise substitution magic, so output is testable and
  byte-stable, and it reuses the existing create-plan endpoint instead of
  inventing another one.
- **Decision #70 — meals are granular, quick-adds stay manual, the UI
  adds them up.** Both sources keep their meaning: meal rows for real
  tracking, chips for <10s logging — the Fuel tab labels each source and
  shows the combined total, and entries are delete-only to keep the
  mobile loop fast.

## Phase 20 — Reports hub · Life Score extension (Life-OS Phase F) ✅

The final Life-OS expansion phase: everything the user records can now be
*read back* honestly. Two workstreams, both read-only.

**20.1 Reports engine (pure).** `lib/reports.ts` — domain registry (13
domains: money, fitness, fuel, study, habits, goals, journal, skin, reading,
skills, people, content, ideas), strict ISO-date/month-key validation (leap
years rejected properly), inclusive-window math with the same-length
previous-window shift (month-boundary + leap-day safe), `deltaPct` (null
when there is no fair baseline, 2dp), `pctPart`, daily/weekly series
builders (zero-filled; future days clipped so a mid-month report never
renders empty future bars; auto day-bucket ≤31 days else week), bar-height
math, and window label helpers. 18 unit tests.

**20.2 Reports service.** `services/reports.ts` — one builder per domain,
each a single `Promise.all` of indexed aggregates (both the window AND its
previous window, so deltas are free), shaped into the shared payload:
`stats[]` (pre-formatted value + optional prev-window delta with a
`goodDirection` for coloring + optional sub-line), `series[]` (bucketed,
with unit so the UI formats rupees/minutes/kcal correctly), `rows[]`
(breakdown lists: top categories, per-habit rates, per-book minutes,
per-skill XP, meal-type split, touch-type split, idea status mix…), and
`notes[]` (deterministic insights — biggest expense, overspent budgets,
best habit, protein verdict, reading pace, drift counts). Highlights:
money budget adherence is WINDOW-scoped (category spend inside the window
vs the recurring cap — not the current-month `listBudgets` shape); habit
rates reuse `completionRate` so only scheduled days count; body weight and
protein averages merge meal rows + manual NutritionDay rows (Decision #70
combine); people rows include a live in-rhythm count from the reconnect
engine. `lifeReport(month)` assembles the monthly Life Report from the
same builders + the live Life Score snapshot.

**20.3 API.** `GET /api/reports?domain=&from=&to=` (zod + hand-rolled date
validation: real calendar dates, from ≤ to, ≤ 366 days, 422 with precise
messages; defaults to the current month) and `GET
/api/reports/life?month=` (future months rejected). Bearer-first auth via
`withUser`, user-scoping inside every query.

**20.4 Reports hub UI.** `#/reports` — domain chips (📊 Life + 13
domains), Life Report month stepper (‹ ›, future months disabled),
domain-window presets (this month / last month / last 30 / last 90) plus
custom from/to date inputs, stat tiles with delta badges (▲/▼ colored by
`goodDirection`), pure-CSS bar series (max bar highlighted, tooltips,
first/last labels + total), breakdown rows, insights list, and a Print /
PDF button. Print styles: `print:hidden` on nav/FAB/controls,
`print:max-w-none` on the shell, `.no-print` in globals.css — the browser
print dialog is the PDF pipeline (Decision #75). Entry point: a Reports
card at the top of the Growth hub.

**20.5 Life Score extension.** Six new OPTIONAL components (same
never-touched → null precedent): Growth adds Reading (105 min/wk target),
Skill practice (150 min/wk, matching goal effort), Content cleared
(4 completions/mo), Ideas with next step (share of live ideas carrying a
concrete next action); Reflection adds People in rhythm (share of active
people inside their reconnect cadence) and Protein target (hits over
logged days — unlogged days skipped, per Decision #27). Pillar means and
the 3-pillar overall math are untouched; 7 new unit tests (726/726 total).

**20.6 Verified.** 726/726 unit tests (25 new); eslint + tsc clean; API
matrix via curl (200s across domains, 422 bogus domain / fake date
2026-02-30 / 367-day span, 401 unauthenticated); browser golden paths:
Life Report (headline, pillar chips, relabeled unique stat keys),
Money → Fitness-style domain switch, Last-30-days window (Aug 22 → Sep 20
applied), Reading + Ideas reports render honest empty windows with
insights, journal screen shows all six new Life Score components, Growth
hub Reports card present, print-to-PDF sample generated. Zero fresh
console errors. Screenshots + sample PDF in download/saarthi-phase20-*.

- **Decision #71 — reports are read-only aggregation, zero new tables.**
  Every number is computed on read from the same indexed columns the
  modules themselves use; nothing stored, nothing stale, no backfill.
- **Decision #72 — Life Score stays 3 pillars; new signals slot in as
  optional components.** Craft + intentional consumption (reading, skills,
  content, ideas) strengthen Growth; care (people rhythm, protein) joins
  Reflection next to skincare. Untouched features stay null, so existing
  scores never shift because of this phase.
- **Decision #73 — one shared report shape (stats / series / rows /
  notes).** Thirteen domains render through one component set; series
  auto-bucket day (≤31d) or week, zero-filled with future days clipped.
- **Decision #74 — the Life Report shows the month's measured stats plus
  the LIVE Life Score snapshot.** Trailing-window components make
  historical per-month score re-computation a separate job; the report
  says so in its own footer instead of faking a month-average score.
- **Decision #75 — print-to-PDF is the browser's print dialog plus print
  CSS.** No server-side PDF generation; the user gets a native save-as-PDF
  flow with the app chrome stripped.
- **Decision #76 — content consumption is measured by completions
  (consumedAt), not watch-minutes.** Invasive time estimation for embeds
  is not worth fake precision; per-item minute tracking stays deferred.

## Next up

All phases of the master brief plus the planner layer are complete: Wealth
(accounts, FD+RD ladder, investments incl. bond instruments, real assets,
insurance, bills, budgets, net worth) · Growth (habits, routines, goals,
study, body, skin) · Reflection (journal, mood, Life Score, insights) ·
capture (voice/OCR/CSV/WhatsApp) · gamification · security hardening ·
portfolio planning (six-job allocation, rebalance moves, income machine,
DICGC awareness, knowledge layer) · goal contributions (daily tracking,
effort grid, streaks, pace) · planner ↔ goals (money goals fund sleeves,
per-job goal rollups) · grids everywhere (habits, study) with weekly/monthly
roll-ups · goal journal (milestone daily logs — hours, what was done,
learnings, key takeaways — with a goal-level effort grid, planned-hours
bars, and a Today nudge) · learnings digest + milestone drag-and-drop +
goal effort in the Life Score · Strength Coach (plans with rotation, set-by-set session logger with last-set prefill and progression badges, est-1RM charts, bulk-pace verdicts, vegetarian protein fuel with quick-add chips, goal-journal bridge from finished sessions) · password vault (zero-knowledge) + rest timers + plate math + workout-history calendar · **Life Principles (personal constitution with daily kept/broken/n-a review, trigger notes, adherence math, Dincharya preset — Phase 15)**.

**Life-OS expansion roadmap (approved 2026-09-20):** ~~Phase B — Book
library with in-app EPUB reader + highlights/notes, PDF viewer + page notes,
physical-book tracking, reading sessions, quotes vault~~ ✅ Phase 16 ·
~~Phase C — Skill tracker (levels, practice logs, XP) + People CRM
(touchpoints, reconnect-due engine, importance/cadence)~~ ✅ Phase 17 ·
~~Phase D — private content library (YouTube embeds in-app, article reader
view, uploads) + Ideas Lab (spark→launched pipeline, lean-canvas fields)~~ ✅
Phase 18 · ~~Phase E — exercise media (photo/YouTube in session view) +
workout plan generator + meal-level food logging~~ ✅ Phase 19 · ~~Phase F —
Reports hub (per-domain reports + monthly Life Report, print-to-PDF) +
Life Score extension (reading, skills, people, content, ideas, meals)~~ ✅
Phase 20. Natural follow-ups:
Postgres/Supabase migration with real RLS (Decision #2), full CSP at
deployment (Decision #37), server push delivery (Decision #8), rental income
fields for real assets (Decision #41 simplification), a credit-rating mix
view (govt vs AAA vs AA vs A/BBB share of the fixed-income sleeve), deep
links from digest items to a specific goal's journal (hash-route params),
routine-run grids (the third daily log that could join the shared
effort-grid system), and per-item consume stats for the content library
(minutes per video/article feeding the Phase F Life Report).
