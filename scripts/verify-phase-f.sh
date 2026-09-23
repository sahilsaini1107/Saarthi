#!/bin/bash
# Phase F browser verification — runs entirely inside ONE tool call because
# background processes are reaped between calls in this sandbox.
set -u
cd /home/z/my-project

AGENT=agent-browser
BASE=http://localhost:3000

echo "=== 1. start dev server ==="
setsid nohup bun run dev >> dev.log 2>&1 < /dev/null &
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" $BASE/ 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 1
done
echo "server http_code=$code"

echo "=== 2. login via API, stash token ==="
TOKEN=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"gp13fit-1789321282@saarthi.app","password":"test1234"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
echo "token_len=${#TOKEN}"

echo "=== 3. quick API smoke on the new endpoints ==="
for u in "reports/life" "reports?domain=money" "reports?domain=fitness" "reports?domain=reading" "reports?domain=people" "reports?domain=fuel" "reports?domain=ideas" "reports?domain=bogus" "reports?from=2026-02-30&to=2026-03-10&domain=money" "reports?from=2025-01-01&to=2026-09-20&domain=money"; do
  code=$(curl -s -o /tmp/resp.json -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE/api/$u")
  head=$(python3 -c "import json;d=json.load(open('/tmp/resp.json'));print(list(d.keys()))" 2>/dev/null)
  echo "GET /api/$u -> $code $head"
done
# cross-user 401 check
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/reports/life")
echo "GET /api/reports/life (no token) -> $code"

echo "=== 4. browser: load app with token ==="
$AGENT open $BASE >/dev/null 2>&1
$AGENT wait --load networkidle >/dev/null 2>&1
$AGENT storage local set saarthi_session_token "$TOKEN" >/dev/null
$AGENT open "$BASE/#/reports" 2>&1 | tail -1
$AGENT wait --load networkidle >/dev/null 2>&1
sleep 3
$AGENT snapshot -i 2>&1 | head -30

echo "=== 5. console errors ==="
$AGENT errors 2>&1 | head -10
$AGENT console 2>&1 | grep -i "error" | head -10

$AGENT screenshot /home/z/my-project/download/saarthi-phase20-life-report.png 2>&1 | tail -1
