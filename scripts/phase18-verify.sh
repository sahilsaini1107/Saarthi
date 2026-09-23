#!/usr/bin/env bash
# Phase 18 (Life-OS Phase D) API verification matrix — runs against a dedicated
# throwaway account so the user's real data is never touched.
set -u
BASE="http://localhost:3000"
JAR="/tmp/saarthi-p18-cookies.txt"
TOKEN_FILE="/tmp/saarthi-p18-token.txt"
EMAIL="phase18-test-$(date +%s)@saarthi.app"
PASS="phase18pass"
PASS_COUNT=0
FAIL_COUNT=0

say()  { echo "== $1"; }
check() { # $1 desc  $2 actual  $3 expected-regex
  if echo "$2" | grep -qE "$3"; then PASS_COUNT=$((PASS_COUNT+1)); echo "  PASS: $1";
  else FAIL_COUNT=$((FAIL_COUNT+1)); echo "  FAIL: $1 — got: $(echo "$2" | head -c 300)"; fi
}

# ---------- auth ----------
say "register throwaway user $EMAIL"
REG=$(curl -s -c "$JAR" -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Phase 18 Test\"}")
check "register ok" "$REG" '"id"'

ME=$(curl -s -b "$JAR" "$BASE/api/auth/me")
check "me returns user" "$ME" '"email"'

# Bearer fallback too
TOK=$(echo "$REG" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -n "$TOK" ]; then
  AUTH=(-H "Authorization: Bearer $TOK")
else
  AUTH=()
fi
say "using bearer: $([ -n "$TOK" ] && echo yes || echo cookie-only)"

api() { # method path [json]
  local m="$1" p="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -b "$JAR" "${AUTH[@]}" -X "$m" "$BASE$p" -H 'Content-Type: application/json' -d "$body"
  else
    curl -s -b "$JAR" "${AUTH[@]}" -X "$m" "$BASE$p"
  fi
}

# ---------- content CRUD ----------
say "content: create from YouTube URL (auto → video)"
C1=$(api POST /api/content '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","notes":"phase18 smoke","tags":"smoke, video"}')
check "created with kind video" "$C1" '"kind":"video"'
check "youtubeId derived" "$C1" '"youtubeId":"dQw4w9WgXcQ"'
check "title falls back" "$C1" '"title":"YouTube video"'
CID=$(echo "$C1" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

say "content: create article (URL without YouTube)"
C2=$(api POST /api/content '{"url":"https://example.com/some/article"}')
check "auto kind article" "$C2" '"kind":"article"'
check "hostname title" "$C2" '"title":"example.com"'
CID2=$(echo "$C2" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

say "content: validation"
check "bad youtube url rejected" "$(api POST /api/content '{"url":"https://vimeo.com/123","kind":"video"}')" 'YouTube link'
check "private URL rejected for create is allowed (no fetch yet)" "$(api POST /api/content '{"url":"http://localhost:1/x"}')" '"id"'
check "bad url scheme rejected" "$(api POST /api/content '{"url":"javascript:alert(1)"}')" 'valid http'
check "empty payload rejected" "$(api POST /api/content '{}')" 'Title is required'

say "content: status transitions stamp consumedAt"
D1=$(api PATCH "/api/content/$CID" '{"status":"active"}')
check "active set" "$D1" '"status":"active"'
D2=$(api PATCH "/api/content/$CID" '{"status":"done"}')
check "done stamps consumedAt" "$D2" '"consumedAt":"2'
D3=$(api PATCH "/api/content/$CID" '{"status":"active"}')
check "leaving done clears consumedAt" "$D3" '"consumedAt":null'
D4=$(api PATCH "/api/content/$CID" '{"favorite":true}')
check "favorite toggles" "$D4" '"favorite":true'
check "url change clears reader cache (no error)" "$(api PATCH "/api/content/$CID2" '{"url":"https://other.example.com/a"}')" '"id"'

say "content: list + stats"
L=$(api GET "/api/content?archived=true")
check "list has 3 items" "$(echo "$L" | grep -o '"id":' | wc -l)" '^[3-9]$'
check "list carries youtubeId" "$L" 'dQw4w9WgXcQ'
TODAY=$(api GET /api/overview/today)
check "today has contentToday" "$TODAY" '"contentToday"'
check "contentToday queue=3" "$(echo "$TODAY" | sed -n 's/.*"contentToday":{"total":\([0-9]*\).*/\1/p')" '^3$'
check "today nextUp present" "$TODAY" '"nextUp"'

say "content: file upload (tiny png) + playback"
# 1x1 transparent PNG, base64
PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
UP=$(api POST "/api/content/$CID2/file" "{\"fileName\":\"dot.png\",\"mime\":\"image/png\",\"dataBase64\":\"$PNG\"}")
check "upload sets kind file" "$UP" '"kind":"file"'
check "upload sets size" "$UP" '"fileSize":70'
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "${AUTH[@]}" "$BASE/api/content/$CID2/file")
check "file GET serves binary 200" "$STATUS" '^200$'
CTYPE=$(curl -s -o /dev/null -w "%{content_type}" -b "$JAR" "${AUTH[@]}" "$BASE/api/content/$CID2/file")
check "file GET serves image/png" "$CTYPE" 'image/png'
check "zip upload rejected 415" "$(api POST "/api/content/$CID2/file" '{"fileName":"a.zip","mime":"application/zip","dataBase64":"UEsDBAoAAAAAAA=="}')" 'Only video'
DELFILE=$(api DELETE "/api/content/$CID2/file")
check "file delete restores kind" "$DELFILE" '"kind":"article"'

say "content: reader (network-dependent, offline-tolerant)"
RD=$(api POST "/api/content/$CID/reader")
# sandbox may or may not have egress — accept either a cached extraction or an honest 502/415
if echo "$RD" | grep -q '"text"'; then check "reader extracted text" "$RD" '"text"'; 
else check "reader honest failure (no egress)" "$RD" 'Could not fetch|not an HTML|responded'; fi

say "content: delete + 404 + cross-user"
check "delete ok" "$(api DELETE "/api/content/$CID")" '"ok":true'
check "get-after-delete 404s on patch" "$(api PATCH "/api/content/$CID" '{"favorite":false}')" 'not found'
C_OTHER=$(api POST /api/content '{"title":"orphan","notes":"x"}')
CID_OTHER=$(echo "$C_OTHER" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

# second user tries to touch it
JAR2="/tmp/saarthi-p18-cookies2.txt"
REG2=$(curl -s -c "$JAR2" -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"phase18-other-$(date +%s)@saarthi.app\",\"password\":\"$PASS\",\"name\":\"Other\"}")
check "second user registered" "$REG2" '"id"'
check "cross-user PATCH 404" "$(curl -s -b "$JAR2" -X PATCH "$BASE/api/content/$CID_OTHER" -H 'Content-Type: application/json' -d '{"favorite":true}')" 'not found|404'
check "cross-user DELETE 404" "$(curl -s -b "$JAR2" -X DELETE "$BASE/api/content/$CID_OTHER")" 'not found|404'
check "bogus token 401" "$(curl -s -H 'Authorization: Bearer bogus' "$BASE/api/content")" 'Not signed in|401'

# ---------- ideas ----------
say "ideas: create + ICE derivation"
I1=$(api POST /api/ideas '{"title":"Creator podcast","category":"content","impact":7,"confidence":8,"effort":3,"nextStep":"Draft 3 episode titles","problem":"No output outlet","audience":"Devs who watch","solution":"Weekly 20-min episodes","value":"Compounding audience"}')
check "created spark" "$I1" '"status":"spark"'
check "ICE = 18.67" "$I1" '"ice":18.67'
check "band strong" "$I1" '"iceBand":"strong"'
IID=$(echo "$I1" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

I2=$(api POST /api/ideas '{"title":"Boring but big","impact":9,"confidence":9,"effort":2}')
check "ICE = 40.5 (9*9/2)" "$I2" '"ice":40.5'
IID2=$(echo "$I2" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

say "ideas: validation + pipeline"
check "impact 11 rejected" "$(api POST /api/ideas '{"title":"x","impact":11}')" 'Too big|between 1 and 10'
check "impact 2.5 rejected" "$(api POST /api/ideas '{"title":"x","impact":2.5}')" 'expected int|integer'
check "bad status rejected" "$(api PATCH "/api/ideas/$IID" '{"status":"flying"}')" 'Unknown idea status'
ADV=$(api PATCH "/api/ideas/$IID" '{"status":"exploring"}')
check "advance to exploring" "$ADV" '"status":"exploring"'
LAU=$(api PATCH "/api/ideas/$IID2" '{"status":"launched"}')
check "launch stamps launchedAt" "$LAU" '"launchedAt":"2'
UNLAU=$(api PATCH "/api/ideas/$IID2" '{"status":"parked"}')
check "unlaunch clears launchedAt" "$UNLAU" '"launchedAt":null'

IL=$(api GET /api/ideas)
check "list has 2 ideas" "$(echo "$IL" | grep -o '"title":' | wc -l)" '^2$'
check "pipeline-first ordering (exploring before parked)" "$(echo "$IL" | sed -n '0,/"title":"\([^"]*\)"/s//\1/p')" 'podcast'

TODAY2=$(api GET /api/overview/today)
check "today has ideasToday" "$TODAY2" '"ideasToday"'
check "today spark present" "$TODAY2" '"sparkToday"'
check "spark is pipeline member" "$(echo "$TODAY2" | grep -o '"sparkToday":{"id":"[^"]*","title":"[^"]*"' | head -1)" 'podcast|Boring'

say "ideas: delete + cross-user"
check "delete idea" "$(api DELETE "/api/ideas/$IID")" '"ok":true'
check "cross-user idea PATCH 404" "$(curl -s -b "$JAR2" -X PATCH "$BASE/api/ideas/$IID2" -H 'Content-Type: application/json' -d '{"impact":1}')" 'not found|404'

# ---------- ideas form coverage: full lean canvas roundtrip ----------
I3=$(api POST /api/ideas "{\"title\":\"Full canvas\",\"problem\":\"p\",\"audience\":\"a\",\"value\":\"v\",\"solution\":\"s\",\"revenue\":\"r\",\"costs\":\"c\",\"metrics\":\"m\",\"advantage\":\"ad\",\"tags\":\"t1, t2\",\"notes\":\"n\"}")
check "lean canvas saved" "$(echo "$I3" | grep -c '"problem":"p"')" '^1$'
check "tags parsed" "$I3" '"tags":\["t1","t2"\]'
IID3=$(echo "$I3" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
check "delete full-canvas idea" "$(api DELETE "/api/ideas/$IID3")" '"ok":true'
check "delete orphan content" "$(api DELETE "/api/content/$CID_OTHER")" '"ok":true'

echo ""
echo "RESULT: $PASS_COUNT passed, $FAIL_COUNT failed"
exit $([ "$FAIL_COUNT" -eq 0 ] && echo 0 || echo 1)
