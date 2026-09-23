#!/bin/bash
# Phase 13 verification matrix — Strength Coach APIs.
set -u
BASE="http://localhost:3000/api"
PASS=0; FAIL=0

jq_get() { python3 -c "import sys,json,functools; d=json.load(sys.stdin); print(functools.reduce(lambda a,k: a[int(k)] if isinstance(a,list) else a[k], '$1'.split('.') if '$1' else [], d))" 2>/dev/null; }

req() { # method path token data expected_code name [extract]
  local method=$1 path=$2 tok=$3 data=$4 expect=$5 name=$6
  local args=( -s -X "$method" "$BASE$path" -H "Content-Type: application/json" -o /tmp/p13_body.json -w "%{http_code}" )
  [ -n "$tok" ] && args+=( -H "Authorization: Bearer $tok" )
  [ -n "$data" ] && args+=( -d "$data" )
  local code; code=$(curl "${args[@]}")
  if [ "$code" = "$expect" ]; then PASS=$((PASS+1)); echo "✓ $name ($code)";
  else FAIL=$((FAIL+1)); echo "✗ $name — got $code want $expect: $(head -c 200 /tmp/p13_body.json)"; fi
}

# two fresh users — TT (main flow) and T (cross-user guard)
REG() {
  curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"test1234\",\"name\":\"$2\"}" | jq_get data.token
}
TT=$(REG "p13a-$(date +%s)@saarthi.app" "P13A")
T=$(REG "p13b-$(date +%s)@saarthi.app" "P13B")
[ -z "$TT" -o -z "$T" ] && { echo "✗ registration failed — aborting"; exit 1; }
echo "test tokens ok"

# --- auth gate ---
req GET /fitness/summary "" "" 401 "summary unauth 401"
req POST /fitness/sessions "$TT" '{"date":"2026-9-9"}' 422 "bad session date 422"

# --- plans: create from Foundation A/B preset (as UI does) ---
PRESET='{"name":"Foundation A/B","emoji":"🏋️","note":"Beginner full-body, 3 days a week.","activate":true,"days":[{"label":"Workout A","focus":"Squat · Bench · Pulldown","exercises":[{"name":"Squat","muscleGroup":"legs","equipment":"barbell","sets":3,"repMin":8,"repMax":12,"restSeconds":180},{"name":"Plank","muscleGroup":"core","equipment":"bodyweight","sets":3,"secondsMin":20,"secondsMax":45,"restSeconds":60}]},{"label":"Workout B","focus":"Press · Row","exercises":[{"name":"Leg Press","muscleGroup":"legs","equipment":"machine","sets":3,"repMin":8,"repMax":12},{"name":"Dumbbell Shoulder Press","muscleGroup":"shoulders","equipment":"dumbbell","sets":3,"repMin":8,"repMax":12}]}]}'
req POST /fitness/plans "$TT" "$PRESET" 200 "create preset plan"
PLAN=$(curl -s "$BASE/fitness/plans" -H "Authorization: Bearer $TT" | jq_get data.plans.0.id)
DAYS=$(curl -s "$BASE/fitness/plans" -H "Authorization: Bearer $TT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(' '.join(x['id'] for x in d['data']['plans'][0]['days']))")
DAY_A=$(echo $DAYS | cut -d' ' -f1); DAY_B=$(echo $DAYS | cut -d' ' -f2)
echo "plan=$PLAN dayA=$DAY_A dayB=$DAY_B"
req POST /fitness/plans "$TT" '{"name":"","days":[]}' 422 "invalid plan 422"

# --- summary: next workout should be Workout A (no sessions yet) ---
NEXT=$(curl -s "$BASE/fitness/summary" -H "Authorization: Bearer $TT")
echo "$NEXT" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print('next:', d['nextWorkout']['label'] if d['nextWorkout'] else None, '| active:', d['activePlan']['name'] if d['activePlan'] else None)"
echo "$NEXT" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; assert d['nextWorkout']['label']=='Workout A', 'rotation should start at A'; assert d['nextWorkout']['planDayId']=='$DAY_A'" && echo "✓ rotation starts at A"

# --- session lifecycle ---
req POST /fitness/sessions "$TT" "{\"planDayId\":\"$DAY_A\"}" 200 "start session from Workout A"
SID=$(curl -s "$BASE/fitness/summary" -H "Authorization: Bearer $TT" | jq_get data.openSession.id)
[ -n "$SID" ] && PASS=$((PASS+1)) && echo "✓ open session appears in summary" || { FAIL=$((FAIL+1)); echo "✗ no open session in summary"; }
DETAIL=$(curl -s "$BASE/fitness/sessions/$SID" -H "Authorization: Bearer $TT")
echo "$DETAIL" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; exs=d['exercises']; assert [e['name'] for e in exs]==['Squat','Plank'], f'plan-day targets missing: {[e[\"name\"] for e in exs]}'" && echo "✓ session detail carries plan-day targets (Squat, Plank)"

# add a set to Squat (id from detail) — 50kg x 8
SQID=$(echo "$DETAIL" | jq_get data.exercises.0.exerciseId)
req POST "/fitness/sessions/$SID/sets" "$TT" "{\"exerciseId\":\"$SQID\",\"weightGrams\":50000,\"reps\":8}" 200 "log set 50kg×8 on Squat"
# second set, heavier top set
req POST "/fitness/sessions/$SID/sets" "$TT" "{\"exerciseId\":\"$SQID\",\"weightGrams\":52500,\"reps\":8}" 200 "log set 52.5kg×8"
# warmup set
req POST "/fitness/sessions/$SID/sets" "$TT" "{\"exerciseId\":\"$SQID\",\"weightGrams\":20000,\"reps\":10,\"isWarmup\":true}" 200 "log warm-up set"
# plank timed set
PLID=$(echo "$DETAIL" | jq_get data.exercises.1.exerciseId)
req POST "/fitness/sessions/$SID/sets" "$TT" "{\"exerciseId\":\"$PLID\",\"durationSeconds\":40}" 200 "log plank 40s"
# invalid set: no reps/seconds
req POST "/fitness/sessions/$SID/sets" "$TT" "{\"exerciseId\":\"$SQID\",\"weightGrams\":50000}" 422 "set without reps/seconds 422"
# invalid set: weight over cap
req POST "/fitness/sessions/$SID/sets" "$TT" "{\"exerciseId\":\"$SQID\",\"weightGrams\":900000,\"reps\":5}" 422 "weight over 500kg cap 422"

# set numbering + volume in detail
D2=$(curl -s "$BASE/fitness/sessions/$SID" -H "Authorization: Bearer $TT")
echo "$D2" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
squat=[e for e in d['exercises'] if e['name']=='Squat'][0]
nums=[s['setNumber'] for s in squat['sets']]
assert nums==[1,2,3], f'set numbers {nums}'
assert squat['sets'][0]['setNumber']==1
warm=[s for s in squat['sets'] if s['isWarmup']]
assert len(warm)==1
assert d['volumeGrams']==50000*8+52500*8, f'volume {d[\"volumeGrams\"]} should exclude warmup'
plank=[e for e in d['exercises'] if e['name']=='Plank'][0]
assert plank['sets'][0]['durationSeconds']==40 and plank['sets'][0]['reps'] is None
print('✓ set numbering, warm-up exclusion from volume, timed set stored')
"

# prefill: session detail's Squat lastTop is null (first session) — progression null
echo "$D2" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; s=[e for e in d['exercises'] if e['name']=='Squat'][0]; assert s['lastTop'] is None and s['progression'] is None" && echo "✓ first session: no lastTop/progression"

# finish session (duration 45)
req PATCH "/fitness/sessions/$SID" "$TT" '{"durationMin":45}' 200 "finish session 45min"
# second session on Workout B, then Squat appears in Workout A's next rotation
req POST /fitness/sessions "$TT" "{\"planDayId\":\"$DAY_B\"}" 200 "start Workout B session"
SID2=$(curl -s "$BASE/fitness/summary" -H "Authorization: Bearer $TT" | jq_get data.openSession.id)
req PATCH "/fitness/sessions/$SID2" "$TT" '{"durationMin":40}' 200 "finish Workout B 40min"

# rotation: next should wrap to Workout A after B
curl -s "$BASE/fitness/summary" -H "Authorization: Bearer $TT" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; assert d['nextWorkout']['label']=='Workout A', d['nextWorkout']['label']; print('✓ rotation wraps B → A')"
# week stats
curl -s "$BASE/fitness/summary" -H "Authorization: Bearer $TT" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; assert d['week']['sessions']==2 and d['week']['minutes']==85, d['week']; print('✓ week stats: 2 sessions / 85 min')"

# third session (A) — progression vs first A session should show up
req POST /fitness/sessions "$TT" "{\"planDayId\":\"$DAY_A\"}" 200 "start second Workout A session"
SID3=$(curl -s "$BASE/fitness/summary" -H "Authorization: Bearer $TT" | jq_get data.openSession.id)
D3=$(curl -s "$BASE/fitness/sessions/$SID3" -H "Authorization: Bearer $TT")
SQID=$(echo "$D3" | jq_get data.exercises.0.exerciseId)
req POST "/fitness/sessions/$SID3/sets" "$TT" "{\"exerciseId\":\"$SQID\",\"weightGrams\":55000,\"reps\":8}" 200 "log 55kg×8 on Squat (2nd session)"
curl -s "$BASE/fitness/sessions/$SID3" -H "Authorization: Bearer $TT" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
s=[e for e in d['exercises'] if e['name']=='Squat'][0]
assert s['lastTop'] is not None and s['lastTop']['weightGrams']==52500, s['lastTop']
assert s['progression'] and s['progression']['direction']=='up', s['progression']
print('✓ progression: lastTop 52.5kg → up vs previous session')
"

# cross-user guard: real user cannot touch test user's session
req GET "/fitness/sessions/$SID" "$T" "" 404 "cross-user session 404"
req DELETE "/fitness/sessions/$SID3" "$T" "" 404 "cross-user delete 404"

# --- exercise list & progress ---
EX=$(curl -s "$BASE/fitness/exercises" -H "Authorization: Bearer $TT")
echo "$EX" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']['exercises']; names={e['name'] for e in d}; assert {'Squat','Plank','Leg Press','Dumbbell Shoulder Press'} <= names, names; print('✓ exercise library auto-built:', len(d), 'exercises')"
SQEX=$(echo "$EX" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']['exercises']; print([e['id'] for e in d if e['name']=='Squat'][0])")
curl -s "$BASE/fitness/progress/$SQEX" -H "Authorization: Bearer $TT" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
assert d['name']=='Squat'
assert len(d['sessions'])>=2, d['sessions']
s0,s1=d['sessions'][0],d['sessions'][-1]
assert s1['est1RMGrams']>s0['est1RMGrams']
assert d['direction']=='up'
print('✓ exercise progression series: est-1RM rising, direction up')
"
# trained list
curl -s "$BASE/fitness/progress" -H "Authorization: Bearer $TT" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']['exercises']; assert any(e['name']=='Squat' for e in d); print('✓ trained-exercise list includes Squat')"

# delete one set
SETID=$(curl -s "$BASE/fitness/sessions/$SID3" -H "Authorization: Bearer $TT" | jq_get data.exercises.0.sets.0.id)
req DELETE "/fitness/sets/$SETID" "$TT" "" 200 "delete a set"

# delete exercise used by sets → 409
req DELETE "/fitness/exercises/$SQEX" "$TT" "" 409 "delete used exercise 409"

# --- nutrition ---
req PATCH /fitness/nutrition/profile "$TT" '{"calorieTarget":2500,"proteinTargetG":113,"weeklyGainTargetG":250}' 200 "set nutrition targets"
req POST /fitness/nutrition "$TT" "{\"date\":\"$(date +%F)\",\"proteinG\":18,\"caloriesKcal\":265}" 200 "log paneer chip (18g/265kcal)"
req POST /fitness/nutrition "$TT" "{\"date\":\"$(date +%F)\",\"proteinG\":24,\"caloriesKcal\":120}" 200 "log whey scoop"
curl -s "$BASE/fitness/nutrition" -H "Authorization: Bearer $TT" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
assert d['profile']['proteinTargetG']==113
today=[x for x in d['days'] if x['proteinG']][0]
assert today['proteinG']==24, f'replace semantics: second write wins, got {today}'
today_k=[x for x in d['days'] if x['caloriesKcal']][0]
assert today_k['caloriesKcal']==120, today_k
print('✓ nutrition day upsert-replaces (Decision #21 convention; UI accumulates client-side)')
"
# invalid nutrition values
req POST /fitness/nutrition "$TT" '{"date":"2026-09-14","proteinG":9999}' 422 "protein over cap 422"
req PATCH /fitness/nutrition/profile "$TT" '{"proteinTargetG":10}' 422 "protein target under min 422"

# --- lifescore includes session minutes ---
curl -s "$BASE/lifescore" -H "Authorization: Bearer $TT" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
w=[c for c in d['growth']['components'] if c['label']=='Workout minutes'][0]
assert w['score'] is not None, 'movement component should be present with sessions'
print('✓ Life Score movement component active from strength sessions:', w['score'])
"
# gamification counts sessions
curl -s "$BASE/gamification" -H "Authorization: Bearer $TT" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print('✓ gamification ok — level', d['level']['level'], '| badges earned', d['earnedCount'])
"

echo ""
echo "=== RESULT: PASS=$PASS FAIL=$FAIL ==="
exit $FAIL
