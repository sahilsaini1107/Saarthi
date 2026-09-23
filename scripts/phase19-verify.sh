#!/usr/bin/env bash
# Phase 19 (Life-OS Phase E) API verification matrix — throwaway account only.
set -u
BASE="http://localhost:3000"
JAR="/tmp/saarthi-p19-cookies.txt"
EMAIL="phase19-test-$(date +%s)@saarthi.app"
PASS="phase19pass"
PASS_COUNT=0
FAIL_COUNT=0

say() { echo "== $1"; }
check() {
  if echo "$2" | grep -qE "$3"; then PASS_COUNT=$((PASS_COUNT+1)); echo "  PASS: $1";
  else FAIL_COUNT=$((FAIL_COUNT+1)); echo "  FAIL: $1 — got: $(echo "$2" | head -c 240)"; fi
}

say "register $EMAIL"
REG=$(curl -s -c "$JAR" -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Phase 19 Test\"}")
check "register ok" "$REG" '"id"'

api() {
  local m="$1" p="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -b "$JAR" -X "$m" "$BASE$p" -H 'Content-Type: application/json' -d "$body"
  else
    curl -s -b "$JAR" -X "$m" "$BASE$p"
  fi
}

# ---------- plan generator (client-side lib, but plan create must accept payload) ----------
say "plan generator: build a 4-day lean dumbbells plan payload and create it"
# (the generator itself is pure + unit-tested; here we verify its output shape creates fine)
PLAN=$(api POST /api/fitness/plans '{
  "name":"4-day Lean (dumbbells)","emoji":"🔥","activate":true,
  "note":"Lean block: 10–15 reps, short rests.",
  "days":[
    {"label":"Workout A","focus":"Upper body — push + pull","exercises":[
      {"name":"Dumbbell Bench Press","muscleGroup":"chest","equipment":"dumbbell","sets":3,"repMin":10,"repMax":15,"restSeconds":90},
      {"name":"One-Arm Dumbbell Row","muscleGroup":"back","equipment":"dumbbell","sets":3,"repMin":10,"repMax":15,"restSeconds":90},
      {"name":"Dumbbell Shoulder Press","muscleGroup":"shoulders","equipment":"dumbbell","sets":2,"repMin":12,"repMax":20,"restSeconds":60},
      {"name":"Plank","muscleGroup":"core","equipment":"bodyweight","sets":2,"secondsMin":20,"secondsMax":45,"restSeconds":60}
    ]},
    {"label":"Workout B","focus":"Lower body — squat + hinge","exercises":[
      {"name":"Goblet Squat","muscleGroup":"legs","equipment":"dumbbell","sets":3,"repMin":10,"repMax":15,"restSeconds":90},
      {"name":"Dumbbell Romanian Deadlift","muscleGroup":"legs","equipment":"dumbbell","sets":3,"repMin":10,"repMax":15,"restSeconds":90}
    ]}
  ]}')
check "generated-shape plan created" "$PLAN" 'name.*Lean .dumbbells.\)?"'
PLAN_ID=$(echo "$PLAN" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
DAY_A=$(echo "$PLAN" | python3 -c "import sys,json;d=json.load(sys.stdin)['data']['days'][0];print(d['id'], d['exercises'][0]['exerciseId'])")
DAY_A_ID=$(echo "$DAY_A" | cut -d' ' -f1)
BENCH_ID=$(echo "$DAY_A" | cut -d' ' -f2)

# ---------- exercise media ----------
say "exercise media: youtube attach + validation"
check "bad youtube url rejected" "$(api POST "/api/fitness/exercises/$BENCH_ID/media" '{"youtubeUrl":"https://vimeo.com/1"}')" 'YouTube link'
M1=$(api POST "/api/fitness/exercises/$BENCH_ID/media" '{"youtubeUrl":"https://youtu.be/dQw4w9WgXcQ"}')
check "youtube attached" "$M1" '"ok":true'

say "exercise media: photo attach (1x1 png) + binary GET"
PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
M2=$(api POST "/api/fitness/exercises/$BENCH_ID/media" "{\"photo\":{\"fileName\":\"form.png\",\"mime\":\"image/png\",\"dataBase64\":\"$PNG\"}}")
check "photo attached" "$M2" '"ok":true'
PSTATUS=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/api/fitness/exercises/$BENCH_ID/photo")
check "photo GET 200" "$PSTATUS" '^200$'
PTYPE=$(curl -s -o /dev/null -w "%{content_type}" -b "$JAR" "$BASE/api/fitness/exercises/$BENCH_ID/photo")
check "photo GET content-type" "$PTYPE" 'image/png'
check "photo 415 on non-image" "$(api POST "/api/fitness/exercises/$BENCH_ID/media" "{\"photo\":{\"fileName\":\"a.txt\",\"mime\":\"text/plain\",\"dataBase64\":\"aGk=\"}}")" 'Only image'

say "session detail carries media"
S=$(api POST /api/fitness/sessions "{\"planDayId\":\"$DAY_A_ID\"}")
check "session opened" "$S" '"open":true'
check "session exercise carries media ids" "$S" '"youtubeId":"dQw4w9WgXcQ"'
check "session exercise has photo flag" "$S" '"hasPhoto":true'
SESSION_ID=$(echo "$S" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")

say "media clear"
check "clear media" "$(api DELETE "/api/fitness/exercises/$BENCH_ID/media")" '"ok":true'
S2=$(api GET "/api/fitness/sessions/$SESSION_ID")
check "media gone from session" "$(echo "$S2" | grep -c '"youtubeId":"dQw4w9WgXcQ"')" '^0$'
check "photo 404 after clear" "$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/api/fitness/exercises/$BENCH_ID/photo")" '^404$'

# finish the session so meals tests are independent
api PATCH "/api/fitness/sessions/$SESSION_ID" '{"durationMin":45}' > /dev/null

# ---------- meals ----------
say "meals: add entries across meal types"
ME1=$(api POST /api/fitness/meals '{"date":"'$(date +%F)'","mealType":"breakfast","name":"Paneer bhurji · 2 rotis","caloriesKcal":420,"proteinG":24}')
check "breakfast entry added" "$ME1" '"name":"Paneer bhurji · 2 rotis"'
check "meals payload present" "$ME1" '"meals":{"date"'
ME2=$(api POST /api/fitness/meals "{\"date\":\"$(date +%F)\",\"mealType\":\"lunch\",\"name\":\"Dal · 1 cup\",\"caloriesKcal\":180,\"proteinG\":12}")
ME3=$(api POST /api/fitness/meals "{\"date\":\"$(date +%F)\",\"mealType\":\"snack\",\"name\":\"Whey scoop\",\"caloriesKcal\":120,\"proteinG\":24}")
TOTS=$(echo "$ME3" | python3 -c "import sys,json;t=json.load(sys.stdin)['data']['meals']['totals'];print(t['caloriesKcal'], t['proteinG'])")
check "totals sum across entries (720 kcal, 60g)" "$TOTS" '^720 60$'
ENTRY_ID=$(echo "$ME3" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['meals']['entries'][-1]['id'])")

say "meals: validation"
check "future date rejected" "$(api POST /api/fitness/meals '{"date":"2099-01-01","name":"x"}')" 'future'
check "empty name rejected" "$(api POST /api/fitness/meals "{\"date\":\"$(date +%F)\",\"name\":\"\"}")" 'Too small|Meal name'
check "kcal 9999 rejected" "$(api POST /api/fitness/meals "{\"date\":\"$(date +%F)\",\"name\":\"x\",\"caloriesKcal\":9999}")" '5000'
check "bad meal type rejected" "$(api POST /api/fitness/meals "{\"date\":\"$(date +%F)\",\"mealType\":\"brunch\",\"name\":\"x\"}")" 'Unknown meal type'

say "meals: delete recomputes"
DEL=$(api DELETE "/api/fitness/meals/$ENTRY_ID")
T2=$(echo "$DEL" | python3 -c "import sys,json;t=json.load(sys.stdin)['data']['meals']['totals'];print(t['caloriesKcal'], t['proteinG'])")
check "totals recomputed after delete (600 kcal, 36g)" "$T2" '^600 36$'

say "meals: combined with quick-adds"
api POST /api/fitness/nutrition "{\"date\":\"$(date +%F)\",\"proteinG\":10,\"caloriesKcal\":190}" > /dev/null
NUT=$(api GET /api/fitness/nutrition)
check "nutrition payload has meals block" "$NUT" '"meals"'
ADH=$(echo "$NUT" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(d['days'][-1]['proteinG'], d['meals']['totals']['proteinG'])")
check "manual row 10g separate from meal sums 36g" "$ADH" '^10 36$'

say "cross-user"
JAR2="/tmp/saarthi-p19-cookies2.txt"
curl -s -c "$JAR2" -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"phase19-other-$(date +%s)@saarthi.app\",\"password\":\"$PASS\",\"name\":\"Other\"}" > /dev/null
check "cross-user media PATCH 404" "$(curl -s -b "$JAR2" -X POST "$BASE/api/fitness/exercises/$BENCH_ID/media" -H 'Content-Type: application/json' -d '{"youtubeUrl":"https://youtu.be/dQw4w9WgXcQ"}')" 'not found'
check "cross-user meal DELETE 404" "$(curl -s -b "$JAR2" -X DELETE "$BASE/api/fitness/meals/$ENTRY_ID")" 'not found'
check "cross-user photo 404" "$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR2" "$BASE/api/fitness/exercises/$BENCH_ID/photo")" '^404$'
check "bogus token 401" "$(curl -s -H 'Authorization: Bearer bogus' "$BASE/api/fitness/meals")" 'Not signed in'

echo ""
echo "RESULT: $PASS_COUNT passed, $FAIL_COUNT failed"
exit $([ "$FAIL_COUNT" -eq 0 ] && echo 0 || echo 1)
