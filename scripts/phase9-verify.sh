#!/bin/bash
# Phase 9 verification matrix — goal contributions & effort grid API.
# Run: bash scripts/phase9-verify.sh
set -u
BASE="http://localhost:3000"
J="Content-Type: application/json"
TODAY=$(TZ=Asia/Kolkata date +%F)
YESTERDAY=$(TZ=Asia/Kolkata date -d "yesterday" +%F)
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (expected [$2] got [$1])"; fi; }
has()  { if echo "$1" | grep -q "$2"; then ok "$3"; else bad "$3 (missing [$2] in: $1)"; fi; }

EMAIL="phase9-$RANDOM@saarthi.app"

echo "== auth =="
REG=$(curl -s -X POST "$BASE/api/auth/register" -H "$J" -d "{\"email\":\"$EMAIL\",\"password\":\"test1234\",\"name\":\"P9\"}")
TOKEN=$(echo "$REG" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
[ -n "$TOKEN" ] && ok "register → token" || bad "register failed: $REG"
A="Authorization: Bearer $TOKEN"

echo "== create money goal (₹1,00,000 by $TODAY next year) =="
NEXT_YEAR=$(TZ=Asia/Kolkata date -d "+1 year" +%F)
G=$(curl -s -X POST "$BASE/api/goals" -H "$J" -H "$A" -d "{\"title\":\"Emergency fund\",\"emoji\":\"💰\",\"metric\":\"money\",\"targetValueMilli\":100000000,\"targetDate\":\"$NEXT_YEAR\"}")
GID=$(echo "$G" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
[ -n "$GID" ] && ok "goal created" || bad "goal create: $G"
check "$(echo "$G" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['targetValueMilli'])")" "100000000" "target stored in milli (₹1L = 100000000)"

echo "== grid before any contribution =="
C=$(curl -s "$BASE/api/goals/$GID/contributions" -H "$A")
check "$(echo "$C" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(d['window']['start'],d['window']['end'],len(d['days']))")" "$TODAY $NEXT_YEAR 366" "window = [today, target], 366 ghost days (leap-safe inclusive)"
check "$(echo "$C" | python3 -c "import sys,json;print(round(json.load(sys.stdin)['data']['stats']['benchmarkMilli'],2))")" "$(python3 -c "print(round(100000000/366,2))")" "benchmark = ₹1L ÷ 366 days"

echo "== log contributions =="
L1=$(curl -s -X POST "$BASE/api/goals/$GID/contributions" -H "$J" -H "$A" -d "{\"date\":\"$YESTERDAY\",\"amountMilli\":274000}")
check "$(echo "$L1" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['amountMilli'])")" "274000" "yesterday ₹274 → 274000 milli"
L2=$(curl -s -X POST "$BASE/api/goals/$GID/contributions" -H "$J" -H "$A" -d "{\"date\":\"$TODAY\",\"amountMilli\":500000}")
check "$(echo "$L2" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['amountMilli'])")" "500000" "today ₹500"
L3=$(curl -s -X POST "$BASE/api/goals/$GID/contributions" -H "$J" -H "$A" -d "{\"date\":\"$TODAY\",\"amountMilli\":600000}")
check "$(echo "$L3" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['amountMilli'])")" "600000" "re-send today ₹600 → REPLACES (upsert, not duplicate)"

echo "== grid math after 2 days =="
C=$(curl -s "$BASE/api/goals/$GID/contributions" -H "$A")
check "$(echo "$C" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['stats']['totalMilli'])")" "874000" "total = ₹874"
check "$(echo "$C" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['stats']['daysLogged'])")" "2" "2 days logged"
check "$(echo "$C" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['stats']['currentStreak'])")" "2" "streak 2 (yesterday+today)"
check "$(echo "$C" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print([x['level'] for x in d['days'] if x['amountMilli']>0])")" "[3, 4]" "levels: ₹274 ≥ benchmark → L3; ₹600 ≥ 2×benchmark → L4"
check "$(echo "$C" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['stats']['neededPerDayMilli'])")" "$(python3 -c "import math;print(math.ceil((100000000-874000)/365))")" "needed/day = remaining ÷ 365 (ceil)"
check "$(echo "$C" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['stats']['band'])")" "on_track" "day-1 pace reads on_track"

echo "== validation =="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/goals/$GID/contributions" -H "$J" -H "$A" -d "{\"date\":\"2099-01-01\",\"amountMilli\":1000}")
check "$code" "422" "future date rejected"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/goals/$GID/contributions" -H "$J" -H "$A" -d "{\"date\":\"$TODAY\",\"amountMilli\":0}")
check "$code" "422" "zero amount rejected"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/goals/$GID/contributions" -H "$J" -H "$A" -d "{\"date\":\"$TODAY\",\"amountMilli\":-5}")
check "$code" "422" "negative amount rejected"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/goals/$GID/contributions" -H "$J" -H "$A" -d "{\"date\":\"12/09/2026\",\"amountMilli\":100}")
check "$code" "422" "non-ISO date rejected"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/goals/$GID/contributions")
check "$code" "401" "unauthenticated grid → 401"

echo "== delete a day =="
curl -s -X DELETE "$BASE/api/goals/$GID/contributions?date=$YESTERDAY" -H "$A" >/dev/null
C=$(curl -s "$BASE/api/goals/$GID/contributions" -H "$A")
check "$(echo "$C" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['stats']['totalMilli'])")" "600000" "yesterday removed → total ₹600"
check "$(echo "$C" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['stats']['currentStreak'])")" "1" "streak falls to 1 (grace keeps today)"

echo "== count goal with unit + target, no deadline =="
G2=$(curl -s -X POST "$BASE/api/goals" -H "$J" -H "$A" -d "{\"title\":\"Read books\",\"emoji\":\"📚\",\"metric\":\"count\",\"unitLabel\":\"pages\",\"targetValueMilli\":365000}")
G2ID=$(echo "$G2" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
L=$(curl -s -X POST "$BASE/api/goals/$G2ID/contributions" -H "$J" -H "$A" -d "{\"date\":\"$TODAY\",\"amountMilli\":2500}")
check "$(echo "$L" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['amountMilli'])")" "2500" "2.5 pages → 2500 milli"
C2=$(curl -s "$BASE/api/goals/$G2ID/contributions" -H "$A")
check "$(echo "$C2" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print([x['level'] for x in d['days'] if x['amountMilli']>0])")" "[1]" "2.5 < ½ of 365/day benchmark → L1"
check "$(echo "$C2" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['stats']['neededPerDayMilli'])")" "362500" "no deadline → needed = all remaining"

echo "== metric-less goal: logging rejected, task grid works =="
G3=$(curl -s -X POST "$BASE/api/goals" -H "$J" -H "$A" -d "{\"title\":\"Plan wedding\",\"emoji\":\"💒\"}")
G3ID=$(echo "$G3" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/goals/$G3ID/contributions" -H "$J" -H "$A" -d "{\"date\":\"$TODAY\",\"amountMilli\":1000}")
check "$code" "422" "logging on a metric-less goal → 422"
T=$(curl -s -X POST "$BASE/api/goals/$G3ID/tasks" -H "$J" -H "$A" -d "{\"title\":\"Book venue\"}")
TID=$(echo "$T" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['directTasks'][-1]['id'])")
curl -s -X PATCH "$BASE/api/tasks/$TID" -H "$J" -H "$A" -d '{"done":true}' >/dev/null
C3=$(curl -s "$BASE/api/goals/$G3ID/contributions" -H "$A")
check "$(echo "$C3" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print([x['tasksDone'] for x in d['days'] if x['tasksDone']>0])")" "[1]" "task completion lands on today's grid"
check "$(echo "$C3" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print([x['level'] for x in d['days'] if x['tasksDone']>0])")" "[2]" "1 task → L2"

echo "== goal edit: switch metric fields =="
E=$(curl -s -X PATCH "$BASE/api/goals/$G3ID" -H "$J" -H "$A" -d "{\"metric\":\"money\",\"targetValueMilli\":500000000}")
check "$(echo "$E" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['metric'])")" "money" "PATCH adds daily tracking to an existing goal"
E=$(curl -s -X PATCH "$BASE/api/goals/$G3ID" -H "$J" -H "$A" -d "{\"metric\":null,\"targetValueMilli\":null}")
check "$(echo "$E" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(d['metric'],d['targetValueMilli'])")" "None None" "explicit nulls clear tracking"
code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/goals/$G3ID" -H "$J" -H "$A" -d "{\"metric\":\"crypto\"}")
check "$code" "422" "invalid metric rejected"

echo "== today snapshot widget =="
G4=$(curl -s -X POST "$BASE/api/goals" -H "$J" -H "$A" -d "{\"title\":\"Unlogged goal\",\"emoji\":\"🚀\",\"metric\":\"money\",\"targetValueMilli\":50000000}")
G4ID=$(echo "$G4" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
T=$(curl -s "$BASE/api/overview/today" -H "$A")
check "$(echo "$T" | python3 -c "import sys,json;d=json.load(sys.stdin)['data']['goalContributionsToday'];print(len(d), d[0]['loggedToday'], d[0]['id'])")" "3 False $G4ID" "widget lists metric goals, unlogged first"
has "$T" "neededPerDayMilli" "widget carries needed-per-day"

echo ""
echo "PASS=$PASS FAIL=$FAIL"
