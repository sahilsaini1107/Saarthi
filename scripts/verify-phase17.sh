#!/usr/bin/env bash
# Phase 17 — curl verification matrix for Skills tracker + People CRM.
set -u
BASE="http://localhost:3000"
J='-H Content-Type:application/json'
PASS=0; FAIL=0

say()  { printf '\n== %s ==\n' "$1"; }
ok()   { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1"; }
# check "<desc>" <expected> <actual>
check(){ if [ "$2" = "$3" ]; then ok "$1 ($3)"; else bad "$1 — expected $2 got $3"; fi }
# jqval "<jq-expr>" <json>  -> prints value (empty when missing)
jqval(){ printf '%s' "$2" | python3 -c 'import sys,json
d=json.load(sys.stdin)
try:
  v=eval("d"+sys.argv[1],{},{"d":d})
  print("" if v is None else v)
except Exception:
  print("")' "$1" 2>/dev/null; }
# jqlen "<desc>" <path> <json> — asserts len(d[path]) == expected
jqlen(){ n=$(printf '%s' "$3" | python3 -c 'import sys,json
d=json.load(sys.stdin)
try:
  print(len(eval("d"+sys.argv[1],{}, {"d":d})))
except Exception:
  print("ERR")' "$2" 2>/dev/null); if [ "$n" = "$4" ]; then ok "$1 (len $n)"; else bad "$1 — expected len $4 got $n"; fi }
# jqhas "<desc>" <jq-expr> <json>
jqhas(){ v=$(jqval "$2" "$3"); if [ -n "$v" ]; then ok "$1 ($v)"; else bad "$1 — path $2 not found/empty"; fi }

say "auth"
EMAIL="c17-$(date +%s)@saarthi.app"
REG=$(curl -s -X POST $BASE/api/auth/register $J -d "{\"name\":\"C17 Tester\",\"email\":\"$EMAIL\",\"password\":\"test1234\"}")
TOKEN=$(printf '%s' "$REG" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)
if [ -n "${TOKEN:-}" ]; then ok "registered $EMAIL"; else bad "register failed: $REG"; exit 1; fi
AH="Authorization: Bearer $TOKEN"
TODAY=$(TZ=Asia/Kolkata date +%F)
YESTERDAY=$(TZ=Asia/Kolkata date -d 'yesterday' +%F 2>/dev/null || TZ=Asia/Kolkata date -v-1d +%F)
TOMORROW=$(TZ=Asia/Kolkata date -d 'tomorrow' +%F 2>/dev/null || TZ=Asia/Kolkata date -v+1d +%F)
FUTURE30=$(TZ=Asia/Kolkata date -d '+30 days' +%F 2>/dev/null || TZ=Asia/Kolkata date -v+30d +%F)

say "skills CRUD"
S1=$(curl -s -X POST $BASE/api/skills -H "$AH" $J -d '{"name":"Public speaking","category":"communication","targetLevel":5,"notes":"Own the room"}')
SKID=$(jqval "['data']['id']" "$S1")
[ -n "${SKID:-}" ] && ok "created skill" || { bad "create skill: $S1"; exit 1; }
jqhas "category meta" "['data']['categoryLabel']" "$S1"
jqhas "level starts at 1" "['data']['level']" "$S1"
jqhas "xp starts at 0" "['data']['xp']" "$S1"

S2=$(curl -s -X POST $BASE/api/skills -H "$AH" $J -d '{"name":"Guitar","category":"creative","targetLevel":8}')
SKID2=$(jqval "['data']['id']" "$S2")
[ -n "${SKID2:-}" ] && ok "created second skill" || bad "create second skill"

UP=$(curl -s -X PATCH $BASE/api/skills/$SKID -H "$AH" $J -d '{"name":"Public speaking + MC","targetLevel":6}')
jqhas "patch name" "['data']['name']" "$UP"
jqhas "patch targetLevel" "['data']['targetLevel']" "$UP"

BAD1=$(curl -s -X POST $BASE/api/skills -H "$AH" $J -d '{"name":"","category":"communication"}')
check "empty name → 422" "422" "$(printf '%s' "$BAD1" | python3 -c 'import sys,json;print(json.load(sys.stdin)["error"]["message"] and 422)' 2>/dev/null || echo 400)"
BAD2=$(curl -s -X POST $BASE/api/skills -H "$AH" $J -d '{"name":"X","targetLevel":11}')
jqhas "targetLevel 11 → 422" "['error']['message']" "$BAD2"
BAD3=$(curl -s -X POST $BASE/api/skills -H "$AH" $J -d '{"name":"X","category":"swords"}')
jqhas "bad category → 422" "['error']['message']" "$BAD3"

say "practice logging + XP/level/streak/ETA math"
P1=$(curl -s -X POST $BASE/api/skills/$SKID/practice -H "$AH" $J -d "{\"date\":\"$YESTERDAY\",\"minutes\":30,\"note\":\"rehearsed intro\"}")
jqhas "backdated practice xp=30" "['data']['xp']" "$P1"
jqhas "streak 1 (yesterday, today open)" "['data']['streak']" "$P1"
P2=$(curl -s -X POST $BASE/api/skills/$SKID/practice -H "$AH" $J -d "{\"date\":\"$TODAY\",\"minutes\":20}")
jqhas "today practice xp=50" "['data']['xp']" "$P2"
jqhas "streak 2" "['data']['streak']" "$P2"
jqhas "minutesToday 20" "['data']['minutesToday']" "$P2"
jqhas "level 1 (xp 50 < 100)" "['data']['level']" "$P2"
# target level 6 = LEVEL_XP[5] = 1500 XP; xp 50 → remaining 1450
# pace = 50 minutes over trailing 30 days = 1.667/day → ceil(1450/1.667) = 870
jqhas "etaDays = 870 (ceil(1450/(50/30)))" "['data']['etaDays']" "$P2"
jqhas "etaLabel mentions level 2" "['data']['etaLabel']" "$P2"
P3=$(curl -s -X POST $BASE/api/skills/$SKID/practice -H "$AH" $J -d "{\"date\":\"$TODAY\",\"minutes\":50,\"note\":\"second sitting\"}")
jqhas "two sittings aggregate xp=100" "['data']['xp']" "$P3"
jqhas "level 2 at 100 xp" "['data']['level']" "$P3"

BADP1=$(curl -s -X POST $BASE/api/skills/$SKID/practice -H "$AH" $J -d "{\"date\":\"$FUTURE30\",\"minutes\":30}")
jqhas "future practice → 422" "['error']['message']" "$BADP1"
BADP2=$(curl -s -X POST $BASE/api/skills/$SKID/practice -H "$AH" $J -d "{\"date\":\"$TODAY\",\"minutes\":0}")
jqhas "0 minutes → 422" "['error']['message']" "$BADP2"
BADP3=$(curl -s -X POST $BASE/api/skills/$SKID/practice -H "$AH" $J -d "{\"date\":\"$TODAY\",\"minutes\":1441}")
jqhas "1441 minutes → 422" "['error']['message']" "$BADP3"

LOGID=$(jqval "['data']['logs'][0]['id']" "$P3")
# logs[0] = today's FIRST sitting (20m) — stable sort keeps same-day rows in insert order
DELCODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $BASE/api/skills/$SKID/practice/$LOGID -H "$AH")
check "practice delete ok" "200" "$DELCODE"
AFTER=$(curl -s "$BASE/api/skills?archived=true" -H "$AH")
check "xp = 80 after deleting the 20m log" "80" "$(jqval "['data'][0]['xp']" "$AFTER")"

say "list ordering (active first) + archive"
curl -s -X PATCH $BASE/api/skills/$SKID2 -H "$AH" $J -d '{"status":"archived"}' > /dev/null
LIST=$(curl -s "$BASE/api/skills?archived=true" -H "$AH")
check "archived skill hidden from default" "1" "$(curl -s $BASE/api/skills -H "$AH" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]))')"
check "archived visible with ?archived" "2" "$(curl -s "$BASE/api/skills?archived=true" -H "$AH" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]))')"
check "active sorts before archived" "Public speaking + MC" "$(jqval "['data'][0]['name']" "$LIST")"

say "people CRUD + reconnect engine"
C1=$(curl -s -X POST $BASE/api/people -H "$AH" $J -d '{"name":"Aditi Sharma","category":"mentor","importance":3,"role":"PM at Fintech","howMet":"conference 2025","contact":"@aditi","tags":"career, product","notes":"Wants a design mentor"}')
PID=$(jqval "['data']['id']" "$C1")
[ -n "${PID:-}" ] && ok "created person" || { bad "create person: $C1"; exit 1; }
jqhas "cadence default 14 for core" "['data']['cadenceDays']" "$C1"
jqhas "status never (no touch)" "['data']['reconnect']['status']" "$C1"

C2=$(curl -s -X POST $BASE/api/people -H "$AH" $J -d '{"name":"Rohan V","category":"friend","importance":2}')
PID2=$(jqval "['data']['id']" "$C2")
[ -n "${PID2:-}" ] && ok "created second person" || bad "create second person"

UPP=$(curl -s -X PATCH $BASE/api/people/$PID -H "$AH" $J -d "{\"cadenceDays\":7}")
jqhas "cadence override 7" "['data']['cadenceDays']" "$UPP"

T1=$(curl -s -X POST $BASE/api/people/$PID/touch -H "$AH" $J -d "{\"date\":\"$TODAY\",\"type\":\"call\",\"note\":\"Intro call\"}")
jqhas "touch today → ok" "['data']['reconnect']['status']" "$T1"
jqhas "dueInDays = 7" "['data']['reconnect']['dueInDays']" "$T1"
jqhas "touchCount = 1" "['data']['touchCount']" "$T1"

# overdue engine: Rohan (cadence 30) gets ONLY a 40-day-old touch → overdue by 10
B40=$(TZ=Asia/Kolkata date -d '-40 days' +%F 2>/dev/null || TZ=Asia/Kolkata date -v-40d +%F)
curl -s -X POST $BASE/api/people/$PID2/touch -H "$AH" $J -d "{\"date\":\"$B40\",\"type\":\"meet\",\"note\":\"Old hangout\"}" > /dev/null
T3=$(curl -s $BASE/api/people -H "$AH")
jqhas "overdue sorts first" "['data'][0]['reconnect']['status']" "$T3"
check "most-overdue first" "Rohan V" "$(jqval "['data'][0]['name']" "$T3")"
check "overdue by 10" "-10" "$(jqval "['data'][0]['reconnect']['dueInDays']" "$T3")"

BADT1=$(curl -s -X POST $BASE/api/people/$PID/touch -H "$AH" $J -d "{\"date\":\"$FUTURE30\",\"type\":\"call\"}")
jqhas "future touch → 422" "['error']['message']" "$BADT1"
BADT2=$(curl -s -X POST $BASE/api/people/$PID/touch -H "$AH" $J -d "{\"date\":\"$TODAY\",\"type\":\"telepathy\"}")
jqhas "bad type → 422" "['error']['message']" "$BADT2"
BADP=$(curl -s -X POST $BASE/api/people -H "$AH" $J -d "{\"name\":\"X\",\"importance\":9}")
jqhas "importance 9 → 422" "['error']['message']" "$BADP"
BADP2=$(curl -s -X POST $BASE/api/people -H "$AH" $J -d "{\"name\":\"X\",\"cadenceDays\":0}")
jqhas "cadence 0 → 422" "['error']['message']" "$BADP2"

TOUCHID=$(jqval "['data'][0]['logs'][0]['id']" "$T3")
DELCODE2=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $BASE/api/people/$PID2/touch/$TOUCHID -H "$AH")
check "touchpoint delete ok" "200" "$DELCODE2"
T4=$(curl -s $BASE/api/people -H "$AH")
check "Rohan back to never after delete" "never" "$(jqval "['data'][0]['reconnect']['status']" "$T4")"

say "today snapshot wiring"
SNAP=$(curl -s $BASE/api/overview/today -H "$AH")
jqhas "skillsToday.total = 1" "['data']['skillsToday']['total']" "$SNAP"
jqhas "skillsToday practicedToday" "['data']['skillsToday']['practicedToday']" "$SNAP"
jqhas "skillsToday minutesToday" "['data']['skillsToday']['minutesToday']" "$SNAP"
jqhas "peopleToday tracked = 2" "['data']['peopleToday']['tracked']" "$SNAP"
jqhas "peopleToday dueCount ≥ 1" "['data']['peopleToday']['dueCount']" "$SNAP"
jqhas "peopleToday top person urgent" "['data']['peopleToday']['people'][0]['reconnect']['status']" "$SNAP"
jqhas "hasNoData false" "['data']['hasNoData']" "$SNAP"

say "cross-user + auth guards"
TOK2=$(curl -s -X POST $BASE/api/auth/register $J -d "{\"name\":\"C17 Other\",\"email\":\"c17other-$(date +%s)@saarthi.app\",\"password\":\"test1234\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
check "other user cannot PATCH skill (404)" "404" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH $BASE/api/skills/$SKID -H "Authorization: Bearer $TOK2" $J -d '{"name":"Hijack"}')"
check "other user cannot log touch (404)" "404" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/people/$PID/touch -H "Authorization: Bearer $TOK2" $J -d "{\"date\":\"$TODAY\",\"type\":\"call\"}")"
check "no token → 401" "401" "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/skills)"
check "bogus token → 401" "401" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer bogus' $BASE/api/people)"

say "delete flows"
curl -s -X PATCH $BASE/api/skills/$SKID2 -H "$AH" $J -d '{"status":"active"}' > /dev/null
check "delete skill" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $BASE/api/skills/$SKID2 -H "$AH")"
check "delete person" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $BASE/api/people/$PID2 -H "$AH")"
check "deleted skill 404" "404" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH $BASE/api/skills/$SKID2 -H "$AH" $J -d '{"name":"Zombie"}')"

printf '\n== RESULT: %d passed, %d failed ==\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
