#!/usr/bin/env bash
# Phase 11 — goal journal curl verification matrix (fixed quoting).
# Run AFTER `bun run dev` is up. Uses a fresh throwaway user.
set -u
BASE="http://localhost:3000"
PASS=0; FAIL=0

# get <json> <python-expr with d=json>  — extract via python3
getj() { python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(eval(sys.argv[2]))" "$1" "$2" 2>/dev/null; }

check() { # name expected actual
  if echo "$3" | grep -q "$2"; then PASS=$((PASS+1)); echo "ok   $1"
  else FAIL=$((FAIL+1)); echo "FAIL $1 — wanted '$2' got: $(echo "$3" | head -c 300)"; fi
}

req() { # method path token [json]
  local m="$1" p="$2" tok="$3" body="${4:-}"
  if [ -n "$body" ]; then
    curl -s -X "$m" "$BASE$p" -H 'Content-Type: application/json' -H "Authorization: Bearer $tok" -d "$body"
  else
    curl -s -X "$m" "$BASE$p" -H "Authorization: Bearer $tok"
  fi
}

EMAIL="p11-$$@saarthi.app"
REG=$(curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"test1234\",\"name\":\"Phase 11\"}")
TOKEN=$(getj "$REG" "d['data']['token']")
check "register" '"email"' "$REG"

# 1. journal-only goal (no metric) + milestones, one with planned hours
G=$(req POST /api/goals "$TOKEN" '{"title":"Learn software development","emoji":"🧑‍💻","color":"#8B5CF6"}')
GID=$(getj "$G" "d['data']['id']")
check "create goal" '"title":"Learn software development"' "$G"

M1=$(req POST "/api/goals/$GID/milestones" "$TOKEN" '{"title":"HTML & CSS basics","targetMinutes":2400}')
MID1=$(getj "$M1" "d['data']['milestones'][0]['id']")
check "milestone planned 2400" '"targetMinutes":2400' "$M1"
M2=$(req POST "/api/goals/$GID/milestones" "$TOKEN" '{"title":"JavaScript fundamentals"}')
MID2=$(getj "$M2" "d['data']['milestones'][1]['id']")
[ -n "$MID1" ] && [ -n "$MID2" ] && { PASS=$((PASS+1)); echo "ok   milestone ids ($MID1, $MID2)"; } || { FAIL=$((FAIL+1)); echo "FAIL milestone ids"; }

# 2. journal logging — upsert + replace semantics
TODAY=$(TZ=Asia/Kolkata date +%F)
YDAY=$(TZ=Asia/Kolkata date -d "yesterday" +%F)
L1=$(req POST "/api/milestones/$MID1/logs" "$TOKEN" "{\"date\":\"$TODAY\",\"minutes\":90,\"did\":\"Built layout\",\"learned\":\"Flexbox\",\"keyLearning\":\"gap > margins\"}")
check "log today 90m" '"minutes":90' "$L1"
L2=$(req POST "/api/milestones/$MID1/logs" "$TOKEN" "{\"date\":\"$TODAY\",\"minutes\":120}")
check "replace semantics → 120m" '"minutes":120' "$L2"
check "replace kept did" '"did":"Built layout"' "$L2"
L3=$(req POST "/api/milestones/$MID2/logs" "$TOKEN" "{\"date\":\"$YDAY\",\"minutes\":45,\"did\":\"Loops\"}")
check "milestone2 yesterday 45m" '"minutes":45' "$L3"

# 3. rejections
R1=$(req POST "/api/milestones/$MID1/logs" "$TOKEN" '{"date":"2030-01-01","minutes":30}')
check "future date 422" 'future dates' "$R1"
R2=$(req POST "/api/milestones/$MID1/logs" "$TOKEN" "{\"date\":\"$TODAY\",\"minutes\":0}")
check "minutes 0 rejected 422" 'Too small' "$R2"
R3=$(req POST "/api/milestones/$MID1/logs" "$TOKEN" "{\"date\":\"$TODAY\",\"minutes\":1441}")
check "minutes 1441 rejected 422" 'Too big' "$R3"
R4=$(req POST "/api/milestones/$MID1/logs" "$TOKEN" "{\"date\":\"not-a-date\",\"minutes\":30}")
check "bad date 422" 'Invalid string' "$R4"
LONG=$(python3 -c 'print("x"*501)')
R5=$(req POST "/api/milestones/$MID1/logs" "$TOKEN" "{\"date\":\"$TODAY\",\"minutes\":30,\"did\":\"$LONG\"}")
check "text >500 rejected 422" 'error' "$R5"
R6=$(req POST "/api/goals/$GID/milestones" "$TOKEN" '{"title":"X","targetMinutes":999999}')
check "targetMinutes out of range 422" 'Too big' "$R6"
R7=$(req POST "/api/milestones/$MID1/logs" "$TOKEN" "{\"date\":\"$TODAY\",\"minutes\":12.5}")
check "fractional minutes 422" 'error' "$R7"

# 4. journal payload
J=$(req GET "/api/goals/$GID/journal" "$TOKEN")
check "journal hasLogs" '"hasLogs":true' "$J"
check "journal totalMinutes 165 (120+45)" '"totalMinutes":165' "$J"
check "journal daysLogged 2" '"daysLogged":2' "$J"
check "journal currentStreak 2 (grace)" '"currentStreak":2' "$J"
check "journal bestStreak 2" '"bestStreak":2' "$J"
check "journal m1 todayMinutes 120" '"todayMinutes":120' "$J"
check "journal m1 timeProgress 0.05" '"timeProgress":0.05' "$J"
check "journal window starts at first log" "\"start\":\"$YDAY\"" "$J"
check "journal rollups weeks" '"weeks":\[' "$J"
check "journal this-week total 165" '"total":165' "$J"
check "journal m2 recentLogs has did" '"did":"Loops"' "$J"

D=$(req GET "/api/goals/$GID/journal/day?date=$YDAY" "$TOKEN")
check "day logs yday m2 45m" '"minutes":45' "$D"
check "day logs yday m1 empty" '"milestoneTitle":"HTML & CSS basics","logId":null' "$D"
D2=$(req GET "/api/goals/$GID/journal/day?date=bad" "$TOKEN")
check "day logs bad date 422" 'Date must be' "$D2"

# 5. today snapshot: goal logged today via m1 → widget must NOT show it
T=$(req GET /api/overview/today "$TOKEN")
if echo "$T" | grep -q '"goalJournalsToday":\[\]'; then PASS=$((PASS+1)); echo "ok   nudge suppressed when goal logged today"; else FAIL=$((FAIL+1)); echo "FAIL nudge suppression: $(echo "$T" | grep -o '"goalJournalsToday":\[[^]]*' | head -c 200)"; fi

# 6. DELETE m2's yesterday log → totals drop
req DELETE "/api/milestones/$MID2/logs?date=$YDAY" "$TOKEN" >/dev/null
J2=$(req GET "/api/goals/$GID/journal" "$TOKEN")
check "after delete totalMinutes 120" '"totalMinutes":120' "$J2"

# 7. milestone PATCH: planned hours + clear via 0
P=$(req PATCH "/api/milestones/$MID2" "$TOKEN" '{"targetMinutes":600}')
check "patch targetMinutes 600" '"targetMinutes":600' "$P"
P2=$(req PATCH "/api/milestones/$MID2" "$TOKEN" '{"targetMinutes":0}')
check "patch targetMinutes 0 clears" '"targetMinutes":null' "$P2"

# 8. ownership: another user cannot touch the journal
REG2=$(curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"p11b-$$@saarthi.app\",\"password\":\"test1234\",\"name\":\"Other\"}")
TOKEN2=$(getj "$REG2" "d['data']['token']")
J3=$(req GET "/api/goals/$GID/journal" "$TOKEN2")
check "other user journal → 404" 'not found' "$J3"
L4=$(req POST "/api/milestones/$MID1/logs" "$TOKEN2" "{\"date\":\"$TODAY\",\"minutes\":30}")
check "other user log → 404" 'not found' "$L4"

# 9. fresh goal: nudge APPEARS when nothing logged today
G2=$(req POST /api/goals "$TOKEN" '{"title":"Guitar practice","emoji":"🎸"}')
GID2=$(getj "$G2" "d['data']['id']")
M3=$(req POST "/api/goals/$GID2/milestones" "$TOKEN" '{"title":"Chords & transitions","targetMinutes":1200}')
MID3=$(getj "$M3" "d['data']['milestones'][0]['id']")
T2=$(req GET /api/overview/today "$TOKEN")
check "nudge shows unlogged goal milestone" '"milestoneTitle":"Chords & transitions"' "$T2"
# quick-log from the widget (minutes only), then nudge disappears
W=$(req POST "/api/milestones/$MID3/logs" "$TOKEN" "{\"date\":\"$TODAY\",\"minutes\":30}")
check "widget quick-log 30m" '"minutes":30' "$W"
T3=$(req GET /api/overview/today "$TOKEN")
if echo "$T3" | grep -q '"milestoneTitle":"Chords & transitions"'; then FAIL=$((FAIL+1)); echo "FAIL nudge gone after log"; else PASS=$((PASS+1)); echo "ok   nudge gone after logging"; fi

# 10. cleared plan → timeProgress null (clear Guitar milestone's plan via 0)
req PATCH "/api/milestones/$MID3" "$TOKEN" '{"targetMinutes":0}' >/dev/null
J4=$(req GET "/api/goals/$GID2/journal" "$TOKEN")
check "cleared plan → timeProgress null" '"timeProgress":null' "$J4"

echo "-------------------------"
echo "PASS=$PASS FAIL=$FAIL  (user: $EMAIL)"
