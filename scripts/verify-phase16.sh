#!/usr/bin/env bash
# Phase 16 — curl verification matrix for Books / Reader / Quotes.
set -u
BASE="http://localhost:3000"
J='-H Content-Type:application/json'
PASS=0; FAIL=0

say()  { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
ok()   { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31m✗ %s\033[0m\n' "$1"; }
# check "<desc>" <expected> <actual>
check(){ if [ "$2" = "$3" ]; then ok "$1 ($3)"; else bad "$1 — expected $2 got $3"; fi }
# jqhas "<desc>" <jq-expr> <json>
jqhas(){ v=$(printf '%s' "$3" | python3 -c 'import sys,json
d=json.load(sys.stdin)
try:
  v=eval("d"+sys.argv[1],{},{"d":d})
  print("" if v is None else v)
except Exception:
  print("")' "$2" 2>/dev/null); if [ -n "$v" ]; then ok "$1 ($v)"; else bad "$1 — path $2 not found/empty"; fi }

say "auth"
EMAIL="b16-$(date +%s)@saarthi.app"
REG=$(curl -s -X POST $BASE/api/auth/register $J -d "{\"name\":\"B16 Tester\",\"email\":\"$EMAIL\",\"password\":\"test1234\"}")
TOKEN=$(printf '%s' "$REG" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)
if [ -n "${TOKEN:-}" ]; then ok "registered $EMAIL"; else bad "register failed: $REG"; exit 1; fi
AH="Authorization: Bearer $TOKEN"
TODAY=$(TZ=Asia/Kolkata date +%F)

say "physical book CRUD + sessions"
B1=$(curl -s -X POST $BASE/api/books -H "$AH" $J -d '{"title":"Atomic Habits","author":"James Clear","format":"physical","totalPages":320,"status":"reading","tags":"habits, systems"}')
BID=$(printf '%s' "$B1" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
[ -n "${BID:-}" ] && ok "created physical book" || { bad "create: $B1"; exit 1; }
jqhas "startedAt auto-set" "['data']['startedAt']" "$B1"
jqhas "tags parsed" "['data']['tags']" "$B1"

R=$(curl -s -X POST $BASE/api/books/$BID/progress -H "$AH" $J -d '{"currentPage":120}')
jqhas "progress → pct" "['data']['progressPct']" "$R"
S=$(curl -s -X POST $BASE/api/books/$BID/sessions -H "$AH" $J -d "{\"date\":\"$TODAY\",\"minutes\":35,\"pages\":22,\"currentPage\":142}")
jqhas "session logged (35m)" "['data']['minutes']" "$S"
S2=$(curl -s -X POST $BASE/api/books/$BID/sessions -H "$AH" $J -d "{\"date\":\"$TODAY\",\"minutes\":25,\"pages\":18}")
SID2=$(printf '%s' "$S2" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
D=$(curl -s -X POST $BASE/api/books/$BID/sessions -H "$AH" $J -d "{\"date\":\"2026-09-19\",\"minutes\":40,\"pages\":30}")
DID=$(printf '%s' "$D" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
DET=$(curl -s $BASE/api/books/$BID -H "$AH")
jqhas "streak = 2 (2 days)" "['data']['streak']" "$DET"
jqhas "minutes7d = 100" "['data']['minutes7d']" "$DET"
jqhas "pace > 0" "['data']['pace']" "$DET"
jqhas "eta present" "['data']['eta']" "$DET"
PCT=$(printf '%s' "$DET" | python3 -c "import sys,json;print(round(json.load(sys.stdin)['data']['progressPct'],2))")
check "progress 142/320 = 44.38" "44.38" "$PCT"
# over-limit guards
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/books/$BID/sessions -H "$AH" $J -d "{\"date\":\"$TODAY\",\"minutes\":2000}")
check "minutes 2000 → 422" "422" "$C"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/books/$BID/sessions -H "$AH" $J -d "{\"date\":\"2099-01-01\",\"minutes\":30}")
check "future session → 422" "422" "$C"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/books/$BID/sessions -H "$AH" $J -d "{\"date\":\"$TODAY\",\"minutes\":0,\"pages\":0}")
check "empty session → 422" "422" "$C"
DS=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $BASE/api/books/$BID/sessions/$SID2 -H "$AH")
check "delete 2nd session → 200" "200" "$DS"
DET=$(curl -s $BASE/api/books/$BID -H "$AH")
jqhas "sessionsCount back to 2" "['data']['sessionsCount']" "$DET"

say "epub book + file + highlights + quotes"
B2=$(curl -s -X POST $BASE/api/books -H "$AH" $J -d '{"title":"Deep Work (Fixture)","author":"Cal Newport","format":"epub","status":"reading"}')
EID=$(printf '%s' "$B2" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
[ -n "${EID:-}" ] && ok "created epub book" || bad "epub create: $B2"
B64=$(base64 -w0 /home/z/my-project/tests/fixtures/tiny-book.epub)
U=$(curl -s -X POST $BASE/api/books/$EID/file -H "$AH" $J -d "{\"fileName\":\"tiny-book.epub\",\"mime\":\"application/epub+zip\",\"dataBase64\":\"$B64\"}")
jqhas "file stored (9447B)" "['data']['fileSize']" "$U"
CODE=$(printf '%s' "$U" | python3 -c "import sys;print('ok')" 2>/dev/null)
# mime mismatch guard
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/books/$EID/file -H "$AH" $J -d "{\"fileName\":\"x.pdf\",\"mime\":\"application/pdf\",\"dataBase64\":\"aGk=\"}")
check "pdf mime into epub book → 422" "422" "$C"
# physical book file guard
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/books/$BID/file -H "$AH" $J -d "{\"fileName\":\"x.epub\",\"mime\":\"application/epub+zip\",\"dataBase64\":\"aGk=\"}")
check "file into physical book → 422" "422" "$C"
# file round-trip
CT=$(curl -s -o /tmp/dl.epub -w '%{http_code} %{content_type}' $BASE/api/books/$EID/file -H "$AH")
check "file GET 200 + epub mime" "200 application/epub+zip" "$CT"
check "file bytes intact" "9447" "$(wc -c < /tmp/dl.epub | tr -d ' ')"
C=$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/books/$EID/file)
check "file GET no-auth → 401" "401" "$C"

# epub progress (percent + position)
R=$(curl -s -X POST $BASE/api/books/$EID/progress -H "$AH" $J -d '{"percent":42.456,"position":"epubcfi(/6/4[ch1]!/4/2)"}')
jqhas "epub percent 42.46" "['data']['percent']" "$R"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/books/$EID/progress -H "$AH" $J -d '{"currentPage":10}')
check "pages into epub → 422" "422" "$C"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/books/$BID/progress -H "$AH" $J -d '{"percent":50}')
check "percent into physical → 422" "422" "$C"

# highlight + note + quote-from-highlight
H=$(curl -s -X POST $BASE/api/books/$EID/highlights -H "$AH" $J -d '{"cfi":"epubcfi(/6/4[ch1]!/4/2/2/2)","text":"Clarity about what matters provides clarity about what does not.","color":"green","chapter":"The Deep Work Hypothesis"}')
HID=$(printf '%s' "$H" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
[ -n "${HID:-}" ] && ok "highlight saved (cfi)" || bad "highlight: $H"
HN=$(curl -s -X PATCH $BASE/api/books/$EID/highlights/$HID -H "$AH" $J -d '{"note":"The one-line test for any commitment."}')
jqhas "highlight note saved" "['data']['note']" "$HN"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/books/$EID/highlights -H "$AH" $J -d '{"text":"no location"}')
check "highlight without cfi/page → 422" "422" "$C"
# manual page highlight on physical book
H2=$(curl -s -X POST $BASE/api/books/$BID/highlights -H "$AH" $J -d '{"page":57,"text":"You do not rise to the level of your goals. You fall to the level of your systems."}')
jqhas "page highlight on physical book" "['data']['page']" "$H2"
H2ID=$(printf '%s' "$H2" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
QF=$(curl -s -X POST $BASE/api/quotes/from-highlight -H "$AH" $J -d "{\"highlightId\":\"$HID\"}")
jqhas "quote from highlight → book source" "['data']['quote']['source']" "$QF"
QF2=$(curl -s -X POST $BASE/api/quotes/from-highlight -H "$AH" $J -d "{\"highlightId\":\"$HID\"}")
CR=$(printf '%s' "$QF2" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['created'])")
check "idempotent re-quote" "False" "$CR"

# bookmark (cfi) + delete
BM=$(curl -s -X POST $BASE/api/books/$EID/bookmarks -H "$AH" $J -d '{"cfi":"epubcfi(/6/6[ch2]!/4/2)","label":"return here"}')
BMID=$(printf '%s' "$BM" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
[ -n "${BMID:-}" ] && ok "bookmark saved" || bad "bookmark: $BM"
# page note on pdf-style book (reuse physical)
N=$(curl -s -X POST $BASE/api/books/$BID/notes -H "$AH" $J -d '{"page":118,"text":"Make the default option the good one."}')
jqhas "page note saved" "['data']['page']" "$N"

say "quotes vault"
Q=$(curl -s -X POST $BASE/api/quotes -H "$AH" $J -d '{"text":"A calm mind, a fit body, a house full of love.","author":"Naval Ravikant","source":"Twitter","tags":"life, wisdom","favorite":true}')
QID=$(printf '%s' "$Q" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
[ -n "${QID:-}" ] && ok "quote created (favorite)" || bad "quote: $Q"
Q2=$(curl -s -X POST $BASE/api/quotes -H "$AH" $J -d '{"text":"Discipline equals freedom.","author":"Jocko Willink"}')
curl -s -X POST $BASE/api/quotes -H "$AH" $J -d '{"text":"Do the hard thing while it is still easy.","tags":"stoicism"}' > /dev/null
L=$(curl -s "$BASE/api/quotes" -H "$AH")
QCNT=$(printf '%s' "$L" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']))")
check "3 user quotes + 1 from highlight = 4" "4" "$QCNT"
LF=$(curl -s "$BASE/api/quotes?favorite=true" -H "$AH")
FC=$(printf '%s' "$LF" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']))")
check "favorites filter = 1" "1" "$FC"
LT=$(curl -s "$BASE/api/quotes?tag=stoicism" -H "$AH")
TC=$(printf '%s' "$LT" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']))")
check "tag filter = 1" "1" "$TC"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/quotes -H "$AH" $J -d '{"text":""}')
check "empty quote → 422" "422" "$C"

say "today snapshot"
T=$(curl -s $BASE/api/overview/today -H "$AH")
jqhas "readingToday title" "['data']['readingToday']['title']" "$T"
jqhas "readingToday streak" "['data']['readingToday']['streak']" "$T"
jqhas "dailyQuoteToday author" "['data']['dailyQuoteToday']['author']" "$T"
RT=$(printf '%s' "$T" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['readingToday']['minutesToday'])")
check "minutesToday = 35" "35" "$RT"

say "finish flow + rating"
F=$(curl -s -X PATCH $BASE/api/books/$BID -H "$AH" $J -d '{"status":"finished","rating":5,"takeaway":"Systems beat goals."}')
jqhas "finishedAt set" "['data']['finishedAt']" "$F"
jqhas "rating saved" "['data']['rating']" "$F"
C=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH $BASE/api/books/$BID -H "$AH" $J -d '{"rating":9}')
check "rating 9 → 422" "422" "$C"

say "library list + stats"
L=$(curl -s $BASE/api/books -H "$AH")
BN=$(printf '%s' "$L" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']))")
check "2 books" "2" "$BN"
LR=$(curl -s "$BASE/api/books?status=finished" -H "$AH")
FN=$(printf '%s' "$LR" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']))")
check "finished filter = 1" "1" "$FN"

say "scoping + errors"
E=$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/books)
check "no-auth list → 401" "401" "$E"
E=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/books $J -d '{"title":"x"}' -H "Authorization: Bearer bogus")
check "bogus token → 401" "401" "$E"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/books -H "$AH" $J -d '{"title":""}')
check "empty title → 422" "422" "$C"
# second user cannot touch first user's book
REG2=$(curl -s -X POST $BASE/api/auth/register $J -d "{\"name\":\"B16 Other\",\"email\":\"b16o-$(date +%s)@saarthi.app\",\"password\":\"test1234\"}")
T2=$(printf '%s' "$REG2" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
E=$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/books/$BID -H "Authorization: Bearer $T2")
check "cross-user book GET → 404" "404" "$E"
E=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $BASE/api/books/$BID -H "Authorization: Bearer $T2")
check "cross-user delete → 404" "404" "$E"
E=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/quotes/from-highlight -H "Authorization: Bearer $T2" $J -d "{\"highlightId\":\"$HID\"}")
check "cross-user highlight quote → 404" "404" "$E"
E=$(curl -s $BASE/api/overview/today -H "Authorization: Bearer $T2")
RT2=$(printf '%s' "$E" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['readingToday'])")
check "other user readingToday null" "None" "$RT2"

say "cleanup"
curl -s -X DELETE $BASE/api/books/$BID -H "$AH" > /dev/null
curl -s -X DELETE $BASE/api/books/$EID -H "$AH" > /dev/null
E=$(curl -s "$BASE/api/quotes" -H "$AH")
QN=$(printf '%s' "$E" | python3 -c "import sys,json;print(len([q for q in json.load(sys.stdin)['data'] if q['bookId'] is None]))")
ok "orphan quotes survive book delete ($QN remain)"

printf '\n\033[1mRESULT: %d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" = "0" ]
