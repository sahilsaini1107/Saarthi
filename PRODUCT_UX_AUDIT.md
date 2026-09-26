# Saarthi product UX audit

Last updated: 26 September 2026

## Product direction

Saarthi should feel like one calm operating system, not a collection of trackers. The primary loop is:

1. **Today** tells the user what matters now.
2. **Capture** makes logging take seconds.
3. **Money** and **Growth** provide focused workspaces.
4. **Journal** turns activity into reflection.
5. **Insights** explain change and suggest one next action.

Every surface should preserve this hierarchy: current state → recommended action → history/details.

## Live operation audit

| Area | Operation tested | Result | Product finding |
|---|---|---:|---|
| Authentication | Existing-account sign-in | Pass | Entry screen is clear and visually consistent. |
| Today | Navigation and empty-state actions | Pass | Useful onboarding, but the mobile-only shell wastes desktop space. |
| Accounts | Create savings account with opening balance | Pass | Clear form; duplicate add actions are unnecessary in the empty state. |
| Transactions | Create income through Quick Add; inspect filters | Pass | Save succeeds; loading categories briefly looked like a genuine empty state. |
| Money | Hub, account roll-up, module navigation | Pass | Strong hierarchy. Planner label rendered a literal Unicode escape. |
| Deposits | Create an FD and verify maturity/interest roll-ups | Pass | Calculations and Planner integration work; save took roughly 12 seconds. |
| Investments | Create an investment with an opening position | **Fail** | The request waited roughly 24 seconds, silently returned to the form, and created nothing. |
| Bills & budgets | Create a monthly bill and category budget | Pass | Both workflows are understandable; each save took roughly 9 seconds. |
| Capture | Parse an SMS-style salary message without saving | Pass | Correctly parses on-device and keeps an explicit review-before-save step. |
| Travel | Create an open-ended trip with a budget | Pass | Clear state and remaining-budget presentation; save took roughly 12 seconds. |
| Insurance | Create a health policy and verify premium reminder | Pass | Coverage is correctly kept outside net worth; save took roughly 18 seconds. |
| Planner, overview & reports | Inspect connected roll-ups and domain reports | Pass | Broad and useful, but very long surfaces need stronger progressive disclosure. |
| Habits | Create habit and check in | Pass | Check-in is fast; initial create took roughly 10 seconds. |
| Routines | Create, play and complete a one-step routine | Pass | Guided play mode is focused and completion state is clear. |
| Goals | Create goal with two milestones and expand | Pass | Model is strong; the global money FAB obscures milestone controls. |
| Study | Create course with syllabus | Pass | Clear onboarding; database-backed create is noticeably slow. |
| Health Coach | Navigate coach → check-in/fitness/food/body/skin | Pass | Best-connected part of the product. |
| Principles | Create a principle and mark it kept | Pass | Strong daily-review interaction; first load took more than 10 seconds. |
| Library & quotes | Create a physical book and a quote | Pass | Both flows are coherent and connected to reporting. |
| Content & ideas | Save a reference link and capture an ICE-scored idea | Pass | Useful pipeline concepts; auto-classification needs user-visible correction controls. |
| Skills | Create a skill and log a 25-minute session | Pass with issue | A single session produced a misleading “~5370d” forecast. |
| People | Create a synthetic contact and log a touchpoint | Pass | Reconnect cadence and due-state transition are easy to understand. |
| Skin | Create a product and complete the morning routine | Pass | Shelf, PAO and routine history connect cleanly. |
| Progress photos | Inspect private photo workflow | Partial | Empty/privacy state reviewed; no personal photo was uploaded during QA. |
| Journal | Create a journal entry with mood | Pass | Writing works, but analytics push the primary writing/history task below the fold. |
| Settings | Review profile, preferences, sessions, data and theme | Pass | Twenty-five badges dominate the page; sessions lack recognizable device metadata. |
| Responsive UI | 390×844 and 1440×900 | Needs work | Mobile hub cards truncate; desktop is constrained to 480 px with excessive whitespace. |
| Browser runtime | Console warnings/errors during audited flows | Pass | No browser console warnings or errors observed. |

Synthetic records created by the audit are prefixed with `QA`.

## Implemented in this pass

- Responsive desktop navigation rail, wider content canvas and one-column mobile Growth cards.
- Quick Add is limited to Today and Money so it no longer covers unrelated controls.
- Quick Add distinguishes loading, failed and genuinely empty category/account states.
- Empty category lists self-heal by idempotently seeding the defaults.
- Investment creation writes the holding, first price and optional opening buy atomically in one database round-trip.
- Journal insights are progressively disclosed; Life Score shows signal coverage and labels sparse results as an early estimate.
- Goal-learning links now open the correct Growth route.
- Settings badges collapse to the five most relevant and expose their descriptions on demand.
- Skill ETA stays hidden until at least three distinct practice days establish a minimally credible trend.
- The Money planner subtitle now renders the intended separator rather than a literal Unicode escape.

## P0 — reliability and trust

- Backfill default categories whenever a user has none.
- Add request timing/trace IDs to server logs and measure cold-query latency.
- Show explicit pending feedback after 400 ms and a retry path after a reasonable timeout.
- Add a health endpoint that checks database reachability without exposing credentials.
- Add coverage/confidence beside Life Score so sparse data cannot look authoritative.
- Keep destructive actions behind a confirmation dialog and add undo where recovery is possible.

## P1 — information architecture

- Use a desktop navigation rail and mobile bottom navigation from one shared shell.
- Keep Quick Add in Today and Money; do not float a finance action over Growth, Journal or Settings.
- Make Today the cross-domain command centre, with no more than three prioritized actions.
- Treat Health Coach as the connected health home rather than five unrelated trackers.
- Keep Journal entries primary; progressively disclose Life Score and monthly learnings.
- Collapse achievements in Settings and expose details on demand.
- Add a global command/search surface for modules, records and quick actions.

## P1 — interaction standards

- One primary CTA per empty state; do not repeat it in the page header.
- All deep screens need a consistent breadcrumb/back action.
- Forms should keep the submit action visible without covering fields.
- Sheet tabs and presets must wrap or scroll with a visible affordance at 320–390 px.
- Preserve page height during loading to prevent footer and navigation jumps.
- Use optimistic UI for reversible operations such as check-ins and toggles.
- Announce saves, failures and offline queueing through accessible status messages.

## P2 — missing product capabilities

- Global search and command palette.
- Notification centre with actionable reminders and a read state.
- Import review screen with validation, duplicate resolution and rollback.
- Custom dashboard/widget ordering.
- Recurring transaction rules and transfer reconciliation.
- Goal dependencies, archived views and reusable goal/course templates.
- Cross-module timeline showing money, health, learning and reflection events.
- Insight explanations: why a score changed and which underlying records contributed.
- Backup restore flow in addition to JSON export.
- Device/session metadata: browser, platform, approximate location and last active time.
- Accessibility pass: focus trapping, visible focus, reduced motion, contrast and screen-reader labels.

## Definition of done for each module

- Empty, loading, populated, offline and error states are designed.
- Create, read, update and archive/delete paths are verified.
- Mobile (390 px), tablet (768 px) and desktop (1440 px) layouts are checked.
- Keyboard and screen-reader navigation are usable.
- The module links back to Today and contributes to relevant insights/reports.
- Unit tests cover domain rules and an end-to-end test covers the primary user journey.
