#!/usr/bin/env bash
# Phase 8 planner API matrix — hand-verified numbers.
set -euo pipefail
BASE=http://localhost:3000
EMAIL="phase8-$(date +%s)@saarthi.app"
PASS='test1234pass'

jqget() { python3 -c "import sys,json,functools; d=json.load(sys.stdin); print(functools.reduce(lambda a,k: a[int(k)] if isinstance(a,list) else a[k], '$1'.split('.'), d))"; }

echo "== register =="
REG=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Phase8\"}")
TOKEN=$(echo "$REG" | jqget data.token)
AUTH="Authorization: Bearer $TOKEN"
echo "token: ${TOKEN:0:12}…"

echo "== unauthenticated planner -> expect 401 =="
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/planner

echo "== create savings account HDFC ₹3,00,000 (job auto) =="
curl -s -X POST $BASE/api/accounts -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"HDFC Savings","type":"savings","balancePaise":30000000}' | jqget data.id

echo "== create FD HDFC ₹4,00,000 @7.1% 24m quarterly =="
curl -s -X POST $BASE/api/fds -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"bank":"HDFC","principalPaise":40000000,"ratePct":7.1,"tenureMonths":24,"startDate":"2026-01-05","compounding":"quarterly"}' | jqget data.id

echo "== create govt bond: G-Sec ₹100/unit × 2000 = ₹2,00,000 MV, 7.05% quarterly, matures 2027-03-15 =="
curl -s -X POST $BASE/api/investments -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"GOI 7.05% 2027","type":"bond","job":"safety","creditRating":"govt","ratePct":7.05,"couponFrequency":"quarterly","maturityDate":"2027-03-15","currentPricePaise":10000,"openingBuy":{"quantity":2000,"amountPaise":20000000,"date":"2026-02-01"}}' | jqget data.id

echo "== create index fund holding: ₹250/unit × 800 = ₹2,00,000 MV =="
curl -s -X POST $BASE/api/investments -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"Nifty 50 Index Fund","type":"mutual_fund","currentPricePaise":25000,"openingBuy":{"quantity":800,"amountPaise":20000000,"date":"2026-02-01"}}' | jqget data.id

echo "== invalid job -> expect 422 =="
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH $BASE/api/investments/xxx -H "$AUTH" -H 'Content-Type: application/json' -d '{"job":"yolo"}'

echo "== record a ₹500 dividend on the fund (trailing-12m income) =="
INV2=$(curl -s $BASE/api/investments -H "$AUTH" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print([x['id'] for x in d if x['type']=='mutual_fund'][0])")
curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/api/investments/$INV2/txns -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"kind":"dividend","amountPaise":50000,"date":"2026-08-20"}'

echo "== set targets (starter balanced) =="
curl -s -X PUT $BASE/api/planner -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"targets":[{"job":"liquidity","targetPct":10},{"job":"safety","targetPct":25},{"job":"income","targetPct":20},{"job":"growth","targetPct":35},{"job":"protection","targetPct":8},{"job":"speculation","targetPct":2}]}' > /dev/null

echo "== bad plan (sum 120, unknown job) -> expect 422 =="
curl -s -o /dev/null -w "%{http_code}\n" -X PUT $BASE/api/planner -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"targets":[{"job":"safety","targetPct":120}]}'
curl -s -o /dev/null -w "%{http_code}\n" -X PUT $BASE/api/planner -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"targets":[{"job":"chaos","targetPct":10}]}'

echo "== GET planner =="
curl -s $BASE/api/planner -H "$AUTH" -o /tmp/planner.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/planner.json'))['data']
print("health:", d['health'], "| hasTargets:", d['hasTargets'])
print("total:", d['totalPaise'], "| unassigned:", d['unassignedCount'])
for j in d['jobs']:
    print(f"  {j['job']:<12} value={j['valuePaise']:>11} pct={j['pct']:>6} target={j['targetPct']} drift={j['driftPp']} move={j['movePaise']} status={j['status']} guide_out={j['outsideGuideline']}")
inc = d['income']
print("income scheduled/avg/annual:", inc['scheduledThisMonthPaise'], inc['monthlyAveragePaise'], inc['projectedAnnualPaise'], "yield:", inc['yieldPct'])
print("income parts bond/fd/dist:", inc['bondCouponsMonthlyPaise'], inc['fdAccrualMonthlyPaise'], inc['distributionMonthlyPaise'])
print("dicgc overLimitCount:", d['dicgc']['overLimitCount'])
for r in d['dicgc']['rows']:
    print("  ", r['institution'], r['totalPaise'], "insured", r['insuredPaise'], "uninsured", r['uninsuredPaise'], "over", r['overLimit'])
PY

echo "== today snapshot planner section =="
curl -s $BASE/api/overview/today -H "$AUTH" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print('plannerToday:', json.dumps(d['plannerToday']))"
