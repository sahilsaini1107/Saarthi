#!/usr/bin/env bash
# Phase 12 curl matrix — learnings digest, milestone reorder, goal-effort Life Score.
set -u
BASE="http://localhost:3000/api"
JAR="/tmp/p12-a.jar"; JAR2="/tmp/p12-b.jar"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (want $2, got $1)"; fi; }
jq_()  { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval(\"d$1\"))" 2>/dev/null; }

EMAIL="phase12-$RANDOM@saarthi.app"
EMAIL2="phase12b-$RANDOM@saarthi.app"

echo "== setup: two fresh users =="
curl -s -c "$JAR"  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"secret123\",\"name\":\"P12\"}" "$BASE/auth/register" > /dev/null
curl -s -c "$JAR2" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL2\",\"password\":\"secret123\",\"name\":\"P12B\"}" "$BASE/auth/register" > /dev/null

TODAY="2026-09-13"
MONTH="2026-09"
PREV="2026-08"

echo "== goal + milestones =="
GID=$(curl -s -b "$JAR" -H 'Content-Type: application/json' -d "{\"title\":\"Learn software development\",\"emoji\":\"💻\",\"targetDate\":\"2027-06-01\"}" "$BASE/goals" | jq_ "['data']['id']")
M1=$(curl -s -b "$JAR" -H 'Content-Type: application/json' -d '{"title":"HTML & CSS basics"}' "$BASE/goals/$GID/milestones" | jq_ "['data']['milestones'][-1]['id']")
M2=$(curl -s -b "$JAR" -H 'Content-Type: application/json' -d '{"title":"JavaScript fundamentals"}' "$BASE/goals/$GID/milestones" | jq_ "['data']['milestones'][-1]['id']")
M3=$(curl -s -b "$JAR" -H 'Content-Type: application/json' -d '{"title":"React projects"}' "$BASE/goals/$GID/milestones" | jq_ "['data']['milestones'][-1]['id']")
echo "  goal=$GID m1=$M1 m2=$M2 m3=$M3"
[ -n "$GID" ] && [ -n "$M1" ] && [ -n "$M2" ] && [ -n "$M3" ] && ok "goal + 3 milestones created" || bad "milestone creation"

echo "== 1. auth guard =="
check "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/journal/learnings")" "401" "learnings unauth → 401"
check "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"ids":["x"]}' "$BASE/goals/$GID/milestones/reorder")" "401" "reorder unauth → 401"

echo "== 2. reorder =="
# valid permutation: move M3 to front
ORDER=$(curl -s -b "$JAR" -X POST -H 'Content-Type: application/json' -d "{\"ids\":[\"$M3\",\"$M1\",\"$M2\"]}" "$BASE/goals/$GID/milestones/reorder")
check "$(echo "$ORDER" | jq_ "['data']['milestones'][0]['id']")" "$M3" "M3 now first"
check "$(echo "$ORDER" | jq_ "['data']['milestones'][2]['id']")" "$M2" "M2 last"
check "$(echo "$ORDER" | jq_ "['data']['milestones'][1]['order']")" "1" "orders rewritten 0..n-1"
# invalid permutations
check "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' -d "{\"ids\":[\"$M3\",\"$M1\"]}" "$BASE/goals/$GID/milestones/reorder")" "422" "missing id → 422"
check "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' -d "{\"ids\":[\"$M3\",\"$M1\",\"$M2\",\"$M3\"]}" "$BASE/goals/$GID/milestones/reorder")" "422" "duplicate id → 422"
check "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' -d "{\"ids\":[\"$M3\",\"$M1\",\"nope\"]}" "$BASE/goals/$GID/milestones/reorder")" "422" "unknown id → 422"
check "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' -d '[]' "$BASE/goals/$GID/milestones/reorder")" "422" "empty ids → 422"
# restore original order for later assertions
curl -s -b "$JAR" -X POST -H 'Content-Type: application/json' -d "{\"ids\":[\"$M1\",\"$M2\",\"$M3\"]}" "$BASE/goals/$GID/milestones/reorder" > /dev/null
check "$(curl -s -b "$JAR" "$BASE/goals" | jq_ "['data'][0]['milestones'][0]['id']")" "$M1" "restored M1 first (persistence)"

echo "== 3. cross-user isolation =="
check "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR2" -X POST -H 'Content-Type: application/json' -d "{\"ids\":[\"$M1\",\"$M2\",\"$M3\"]}" "$BASE/goals/$GID/milestones/reorder")" "404" "other user's goal → 404"
check "$(curl -s -b "$JAR2" "$BASE/journal/learnings?month=$MONTH" | jq_ "['data']['stats']['count']")" "0" "other user sees no learnings"

echo "== 4. milestone logs feed the digest =="
# current month: M1 two entries WITH key learning, M2 one entry WITHOUT, M3 one WITH in prev month
curl -s -b "$JAR" -H 'Content-Type: application/json' -d "{\"date\":\"$TODAY\",\"minutes\":90,\"did\":\"Built a landing page\",\"learned\":\"Flexbox alignment\",\"keyLearning\":\"Ship small, ship daily\"}" "$BASE/milestones/$M1/logs" > /dev/null
curl -s -b "$JAR" -H 'Content-Type: application/json' -d "{\"date\":\"2026-09-11\",\"minutes\":45,\"did\":\"Read MDN closures\",\"keyLearning\":\"Closures capture variables, not values\"}" "$BASE/milestones/$M1/logs" > /dev/null
curl -s -b "$JAR" -H 'Content-Type: application/json' -d "{\"date\":\"2026-09-12\",\"minutes\":30,\"did\":\"Practiced typing\",\"keyLearning\":null}" "$BASE/milestones/$M2/logs" > /dev/null
curl -s -b "$JAR" -H 'Content-Type: application/json' -d "{\"date\":\"2026-08-20\",\"minutes\":60,\"keyLearning\":\"August insight: consistency beats intensity\"}" "$BASE/milestones/$M3/logs" > /dev/null

L=$(curl -s -b "$JAR" "$BASE/journal/learnings")
check "$(echo "$L" | jq_ "['data']['monthKey']")" "$MONTH" "default month = user's current month"
check "$(echo "$L" | jq_ "['data']['stats']['count']")" "2" "only logs WITH keyLearning counted"
check "$(echo "$L" | jq_ "['data']['stats']['totalMinutes']")" "135" "totalMinutes = 90+45 (excludes no-takeaway log)"
check "$(echo "$L" | jq_ "['data']['stats']['goalCount']")" "1" "goalCount distinct goals"
check "$(echo "$L" | jq_ "['data']['items'][0]['date']")" "$TODAY" "newest first"
check "$(echo "$L" | jq_ "['data']['items'][0]['keyLearning']")" "Ship small, ship daily" "keyLearning text intact"
check "$(echo "$L" | jq_ "['data']['items'][0]['goalTitle']")" "Learn software development" "goal context attached"
check "$(echo "$L" | jq_ "['data']['items'][0]['milestoneTitle']")" "HTML & CSS basics" "milestone context attached"
LP=$(curl -s -b "$JAR" "$BASE/journal/learnings?month=$PREV")
check "$(echo "$LP" | jq_ "['data']['stats']['count']")" "1" "explicit prev month works"
check "$(echo "$LP" | jq_ "['data']['items'][0]['keyLearning']")" "August insight: consistency beats intensity" "prev month content"
check "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$BASE/journal/learnings?month=Sep2026")" "422" "bad month → 422"
check "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$BASE/journal/learnings?month=2026-13")" "422" "month 13 → 422"

echo "== 5. deleting a log drops it from the digest =="
curl -s -b "$JAR" -X DELETE "$BASE/milestones/$M1/logs?date=2026-09-11" > /dev/null
check "$(curl -s -b "$JAR" "$BASE/journal/learnings" | jq_ "['data']['stats']['count']")" "1" "digest updates after log delete"

echo "== 6. Life Score growth pillar =="
S=$(curl -s -b "$JAR" "$BASE/lifescore")
check "$(echo "$S" | jq_ "['data']['growth']['components'][3]['label']")" "Goal effort" "4th growth component = Goal effort"
# trailing 7d after the section-5 delete (45m log gone): 90 (today, M1) + 30 (09-12, M2) = 120 → 120/150 = 80
check "$(echo "$S" | jq_ "['data']['growth']['components'][3]['score']")" "80" "Goal effort = 120/150 = 80"
check "$(echo "$S" | jq_ "['data']['growth']['components'][2]['label']")" "Study minutes" "order preserved: study 3rd"
S2=$(curl -s -b "$JAR2" "$BASE/lifescore")
check "$(echo "$S2" | jq_ "['data']['growth']['components'][3]['score']")" "None" "never-journaled user → Goal effort null (skipped)"

echo "== 7. milestone delete cascades (goal-level score drop) =="
check "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X DELETE "$BASE/milestones/$M2")" "200" "delete milestone M2"
# M2 carried the 30m log → 90m remains in the trailing 7d → 90/150 = 60
S3=$(curl -s -b "$JAR" "$BASE/lifescore")
GOT=$(echo "$S3" | jq_ "['data']['growth']['components'][3]['score']")
if [ "$GOT" = "60" ]; then ok "after cascade: 90/150 = 60"; else bad "cascade score (want 60, got $GOT)"; fi

echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
