#!/bin/bash
# Phase 10 verification — planner ↔ goals link + effort grids (curl matrix).
# Every monetary assertion is hand-computed; run against localhost:3000.
set -u
BASE="http://localhost:3000"
PASS=0; FAIL=0
say() { echo "== $1"; }
ck() { # ck <label> <expected> <actual>
  if [ "$2" == "$3" ]; then PASS=$((PASS+1)); echo "  ✓ $1 = $3"
  else FAIL=$((FAIL+1)); echo "  ✗ $1 — expected $2, got $3"; fi
}

EMAIL="phase10-$(date +%s)@saarthi.app"
say "auth: register $EMAIL"
REG=$(curl -s -X POST "$BASE/api/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"phase10pass\",\"name\":\"Phase Ten\",\"timezone\":\"Asia/Kolkata\"}")
TOKEN=$(echo "$REG" | jq -r '.data.token // empty')
if [ -z "$TOKEN" ]; then
  say "register failed, trying login"
  TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"phase10pass\"}" | jq -r '.data.token // empty')
fi
ck "token present" "yes" "$([ -n "$TOKEN" ] && echo yes || echo no)"
AUTH="Authorization: Bearer $TOKEN"

TODAY=$(curl -s "$BASE/api/planner" -H "$AUTH" | jq -r '.data.today')
YESTERDAY=$(python3 -c "from datetime import date,timedelta;print(date.fromisoformat('$TODAY')-timedelta(days=1))")
D3=$(python3 -c "from datetime import date,timedelta;print(date.fromisoformat('$TODAY')-timedelta(days=3))")
D8=$(python3 -c "from datetime import date,timedelta;print(date.fromisoformat('$TODAY')-timedelta(days=8))")
D15=$(python3 -c "from datetime import date,timedelta;print(date.fromisoformat('$TODAY')-timedelta(days=15))")
START=$(python3 -c "from datetime import date,timedelta;print(date.fromisoformat('$TODAY')-timedelta(days=20))")
NEXTYEAR=$(python3 -c "from datetime import date,timedelta;print(date.fromisoformat('$TODAY')+timedelta(days=365))")
echo "  today=$TODAY start=$START deadline=$NEXTYEAR"

# ---------- 401 unauth ----------
say "401 without token"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/planner")
ck "planner unauth" "401" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/habits/x/grid")
ck "habit-grid unauth" "401" "$CODE"

# ---------- goal ↔ job link ----------
say "goal create: money goal linked to safety"
G=$(curl -s -X POST "$BASE/api/goals" -H "$AUTH" -H 'content-type: application/json' -d "{
  \"title\":\"Emergency fund\",\"emoji\":\"🛟\",\"color\":\"#0D9488\",
  \"metric\":\"money\",\"targetValueMilli\":100000000,\"job\":\"safety\",
  \"targetDate\":\"$NEXTYEAR\"}")
GID=$(echo "$G" | jq -r '.data.id // empty')
ck "goal id" "yes" "$([ -n "$GID" ] && echo yes || echo no)"
ck "goal.job echoed" "safety" "$(echo "$G" | jq -r '.data.job')"
ck "goal.metric" "money" "$(echo "$G" | jq -r '.data.metric')"

say "reject job on count goal"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/goals" -H "$AUTH" -H 'content-type: application/json' \
  -d "{\"title\":\"Run km\",\"metric\":\"count\",\"unitLabel\":\"km\",\"targetValueMilli\":1000000,\"job\":\"safety\"}")
ck "422 job on count goal" "422" "$CODE"

say "reject unknown job"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/goals" -H "$AUTH" -H 'content-type: application/json' \
  -d "{\"title\":\"X\",\"metric\":\"money\",\"job\":\"banana\"}")
ck "422 unknown job" "422" "$CODE"

say "explicit null clears job"
J=$(curl -s -X PATCH "$BASE/api/goals/$GID" -H "$AUTH" -H 'content-type: application/json' -d '{"job":null}')
ck "job cleared" "null" "$(echo "$J" | jq -r '.data.job')"
J=$(curl -s -X PATCH "$BASE/api/goals/$GID" -H "$AUTH" -H 'content-type: application/json' -d '{"job":"safety"}')
ck "job re-set" "safety" "$(echo "$J" | jq -r '.data.job')"

say "switching metric money→count auto-clears a stale job"
J=$(curl -s -X PATCH "$BASE/api/goals/$GID" -H "$AUTH" -H 'content-type: application/json' \
  -d '{"metric":"count","unitLabel":"km","targetValueMilli":1000000}')
ck "job auto-cleared on metric switch" "null" "$(echo "$J" | jq -r '.data.job')"
J=$(curl -s -X PATCH "$BASE/api/goals/$GID" -H "$AUTH" -H 'content-type: application/json' \
  -d '{"metric":"money","unitLabel":null,"targetValueMilli":100000000,"job":"safety"}')
ck "back to money + safety" "safety" "$(echo "$J" | jq -r '.data.job')"

# second goal: growth, undated, target-less (lists, adds 0 to committed)
G2=$(curl -s -X POST "$BASE/api/goals" -H "$AUTH" -H 'content-type: application/json' -d "{
  \"title\":\"House corpus seed\",\"emoji\":\"🏠\",\"metric\":\"money\",\"targetValueMilli\":null,\"job\":\"growth\"}")
GID2=$(echo "$G2" | jq -r '.data.id')
# third goal: unlinked money goal (backlog count)
G3=$(curl -s -X POST "$BASE/api/goals" -H "$AUTH" -H 'content-type: application/json' -d "{
  \"title\":\"Mystery stash\",\"emoji\":\"💎\",\"metric\":\"money\",\"targetValueMilli\":50000000}")

# ---------- contributions ----------
say "contribute: ₹40,000 over 3 days + ₹2,500 today"
curl -s -X POST "$BASE/api/goals/$GID/contributions" -H "$AUTH" -H 'content-type: application/json' -d "{\"date\":\"$D15\",\"amountMilli\":20000000}" > /dev/null
curl -s -X POST "$BASE/api/goals/$GID/contributions" -H "$AUTH" -H 'content-type: application/json' -d "{\"date\":\"$D8\",\"amountMilli\":15000000}" > /dev/null
curl -s -X POST "$BASE/api/goals/$GID/contributions" -H "$AUTH" -H 'content-type: application/json' -d "{\"date\":\"$D3\",\"amountMilli\":5000000}" > /dev/null
curl -s -X POST "$BASE/api/goals/$GID/contributions" -H "$AUTH" -H 'content-type: application/json' -d "{\"date\":\"$TODAY\",\"amountMilli\":2500000}" > /dev/null
# future date rejected
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/goals/$GID/contributions" -H "$AUTH" -H 'content-type: application/json' \
  -d "{\"date\":\"$NEXTYEAR\",\"amountMilli\":1000}")
ck "422 future contribution" "422" "$CODE"
# growth goal: ₹12,345.67 all-time (no target → null pct)
curl -s -X POST "$BASE/api/goals/$GID2/contributions" -H "$AUTH" -H 'content-type: application/json' -d "{\"date\":\"$TODAY\",\"amountMilli\":12345670}" > /dev/null

# ---------- planner rollups ----------
say "planner: goalsFunding rollups (hand-computed)"
P=$(curl -s "$BASE/api/planner" -H "$AUTH")
ck "linkedCount" "2" "$(echo "$P" | jq -r '.data.goalsFunding.linkedCount')"
ck "unlinkedCount" "1" "$(echo "$P" | jq -r '.data.goalsFunding.unlinkedCount')"
ck "safety committed" "100000000" "$(echo "$P" | jq -r '.data.goalsFunding.byJob.safety.committedMilli')"
ck "safety contributed (40k+15k+5k+2.5k)" "42500000" "$(echo "$P" | jq -r '.data.goalsFunding.byJob.safety.contributedMilli')"
ck "safety goalCount" "1" "$(echo "$P" | jq -r '.data.goalsFunding.byJob.safety.goalCount')"
ck "growth contributed ₹12,345.67" "12345670" "$(echo "$P" | jq -r '.data.goalsFunding.byJob.growth.contributedMilli')"
ck "total committed" "100000000" "$(echo "$P" | jq -r '.data.goalsFunding.totalCommittedMilli')"
ck "job row safety carries goals" "1" "$(echo "$P" | jq -r '.data.jobs[] | select(.job=="safety") | .goals | length')"
ck "row pct 42.5" "42.5" "$(echo "$P" | jq -r '.data.jobs[] | select(.job=="safety") | .goals[0].pct')"
ck "row remaining ₹57,500" "57500000" "$(echo "$P" | jq -r '.data.jobs[] | select(.job=="safety") | .goals[0].remainingMilli')"
ck "target-less row pct null" "null" "$(echo "$P" | jq -r '.data.jobs[] | select(.job=="growth") | .goals[0].pct')"
ck "unlinked goal absent from jobs" "0" "$(echo "$P" | jq '[.data.jobs[] | select(.job==null)] | length')"

# ---------- habit grid ----------
say "habit: create + seed check-ins (Mon/Wed/Fri schedule)"
H=$(curl -s -X POST "$BASE/api/habits" -H "$AUTH" -H 'content-type: application/json' -d "{
  \"name\":\"Morning run\",\"emoji\":\"🏃\",\"color\":\"#F59E0B\",\"weekdays\":\"1010100\",
  \"startDate\":\"$START\",\"buildingDays\":66}")
HID=$(echo "$H" | jq -r '.data.id')
ck "habit id" "yes" "$([ -n "$HID" ] && echo yes || echo no)"
# today is $TODAY; seed done days: today, yesterday, D3, D8 (some may be rest days)
for D in "$TODAY" "$YESTERDAY" "$D3" "$D8"; do
  curl -s -X POST "$BASE/api/habits/$HID/checkin" -H "$AUTH" -H 'content-type: application/json' -d "{\"date\":\"$D\"}" > /dev/null
done
HG=$(curl -s "$BASE/api/habits/$HID/grid" -H "$AUTH")
ck "grid window start" "$START" "$(echo "$HG" | jq -r '.data.window.start')"
ck "grid window end" "$TODAY" "$(echo "$HG" | jq -r '.data.window.end')"
ck "today level (done → 4)" "4" "$(echo "$HG" | jq -r ".data.days[] | select(.iso==\"$TODAY\") | .level")"
ck "today scheduled (Sat on 1010100 → false)" "false" "$(echo "$HG" | jq -r ".data.days[] | select(.iso==\"$TODAY\") | .scheduled")"
ck "rest-day entry still value 1" "1" "$(echo "$HG" | jq -r ".data.days[] | select(.iso==\"$TODAY\") | .value")"
ck "missed scheduled day → 0" "0" "$(echo "$HG" | jq -r ".data.days[] | select(.iso==\"$D15\") | .level")"
DAYS=$(echo "$HG" | jq '.data.days | length')
ck "grid spans 21 days" "21" "$DAYS"
ck "rollup weeks count" "4" "$(echo "$HG" | jq '.data.rollups.weeks | length')"
ck "rollup current week end = today" "$TODAY" "$(echo "$HG" | jq -r '.data.rollups.weeks[-1].end')"
ck "rollup current week total = check-ins since Monday" "3" "$(echo "$HG" | jq -r '.data.rollups.weeks[-1].total')"
ck "weeks[-2] end is Sunday" "$(python3 - <<PY
from datetime import date,timedelta
t=date.fromisoformat('$TODAY')
mon=t-timedelta(days=(t.weekday()))
print(mon-timedelta(days=7)+timedelta(days=6))
PY
)" "$(echo "$HG" | jq -r '.data.rollups.weeks[-2].end')"
ck "months include current" "true" "$(echo "$HG" | jq -r '.data.rollups.months[-1].current')"
ck "toggle-off removes (checkin yesterday again)" "done:false" "$(curl -s -X POST "$BASE/api/habits/$HID/checkin" -H "$AUTH" -H 'content-type: application/json' -d "{\"date\":\"$YESTERDAY\"}" | jq -r '"done:" + (.data.done|tostring)')"
curl -s -X POST "$BASE/api/habits/$HID/checkin" -H "$AUTH" -H 'content-type: application/json' -d "{\"date\":\"$YESTERDAY\"}" > /dev/null

# ---------- course grid ----------
say "course: create + sessions (20/30/45/60/120 min)"
C=$(curl -s -X POST "$BASE/api/courses" -H "$AUTH" -H 'content-type: application/json' -d "{
  \"title\":\"Systems design\",\"emoji\":\"📚\",\"color\":\"#8B5CF6\",\"startDate\":\"$START\",\"targetEndDate\":\"$NEXTYEAR\"}")
CID=$(echo "$C" | jq -r '.data.id')
# five distinct nonzero values → quartiles q1=30,q2=45,q3=60
curl -s -X POST "$BASE/api/courses/$CID/sessions" -H "$AUTH" -H 'content-type: application/json' -d "{\"date\":\"$D15\",\"minutes\":20}" > /dev/null
curl -s -X POST "$BASE/api/courses/$CID/sessions" -H "$AUTH" -H 'content-type: application/json' -d "{\"date\":\"$D8\",\"minutes\":30}" > /dev/null
curl -s -X POST "$BASE/api/courses/$CID/sessions" -H "$AUTH" -H 'content-type: application/json' -d "{\"date\":\"$D3\",\"minutes\":45}" > /dev/null
curl -s -X POST "$BASE/api/courses/$CID/sessions" -H "$AUTH" -H 'content-type: application/json' -d "{\"date\":\"$YESTERDAY\",\"minutes\":60}" > /dev/null
curl -s -X POST "$BASE/api/courses/$CID/sessions" -H "$AUTH" -H 'content-type: application/json' -d "{\"date\":\"$TODAY\",\"minutes\":120}" > /dev/null
CG=$(curl -s "$BASE/api/courses/$CID/grid" -H "$AUTH")
ck "course window start" "$START" "$(echo "$CG" | jq -r '.data.window.start')"
ck "today minutes 120" "120" "$(echo "$CG" | jq -r --arg d "$TODAY" '.data.days[] | select(.iso==$d) | .value')"
ck "20m (below q1) → L1" "1" "$(echo "$CG" | jq -r --arg d "$D15" '.data.days[] | select(.iso==$d) | .level')"
ck "30m (=q1, <q2) → L2" "2" "$(echo "$CG" | jq -r --arg d "$D8" '.data.days[] | select(.iso==$d) | .level')"
ck "45m (=q2, <q3) → L3" "3" "$(echo "$CG" | jq -r --arg d "$D3" '.data.days[] | select(.iso==$d) | .level')"
ck "60m/120m (≥q3) → L4" "4" "$(echo "$CG" | jq -r --arg d "$TODAY" '.data.days[] | select(.iso==$d) | .level')"
ck "stats.totalMinutes 275" "275" "$(echo "$CG" | jq -r '.data.stats.totalMinutes')"
ck "stats.activeDays 5" "5" "$(echo "$CG" | jq -r '.data.stats.activeDays')"
ck "stats.minutes7d = 225 (today+yest+D3)" "225" "$(echo "$CG" | jq -r '.data.stats.minutes7d')"
ck "avg 55.0" "55" "$(echo "$CG" | jq -r '.data.stats.avgActiveDayMinutes')"
ck "week rollup current total (today+yesterday+D3)" "225" "$(echo "$CG" | jq -r '.data.rollups.weeks[-1].total')"
ck "month rollup current total incl. D8, excl. Aug D15" "255" "$(echo "$CG" | jq -r '.data.rollups.months[-1].total')"
ck "course grid day scheduled=false" "false" "$(echo "$CG" | jq -r --arg d "$TODAY" '.data.days[] | select(.iso==$d) | .scheduled')"

# ---------- goal grid rollups ----------
GG=$(curl -s "$BASE/api/goals/$GID/contributions" -H "$AUTH")
ck "goal rollups present" "4" "$(echo "$GG" | jq '.data.rollups.weeks | length')"
EXPW=$(python3 - <<PY
from datetime import date, timedelta
T = date.fromisoformat('$TODAY')
mon = T - timedelta(days=T.weekday())
vals = {'$TODAY': 2_500_000, '$D3': 5_000_000, '$D8': 15_000_000, '$D15': 20_000_000}
print(sum(v for d, v in vals.items() if date.fromisoformat(d) >= mon))
PY
)
ACTW=$(echo "$GG" | jq -r '.data.rollups.weeks[-1].total')
ck "goal current-week rollup = ₹₹ of (today + this week's days)" "$EXPW" "$ACTW"
EXPWD=$(python3 - <<PY
from datetime import date, timedelta
T = date.fromisoformat('$TODAY')
mon = T - timedelta(days=T.weekday())
vals = {'$TODAY': 1, '$D3': 1, '$D8': 1, '$D15': 1}
print(sum(v for d, v in vals.items() if date.fromisoformat(d) >= mon))
PY
)
ck "goal current-week activeDays" "$EXPWD" "$(echo "$GG" | jq -r '.data.rollups.weeks[-1].activeDays')"

# ---------- 404 ownership ----------
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/habits/does-not-exist/grid" -H "$AUTH")
ck "habit grid 404" "404" "$CODE"

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
