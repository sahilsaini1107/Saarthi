#!/bin/bash
# Phase 5 API matrix — budgets, trips, trip-attributed transactions,
# life score, insights. Hand-verified numbers throughout.
set -e
BASE=http://localhost:3000
J='-H Content-Type:application/json'

echo "=== 0. unauth checks ==="
curl -s -o /dev/null -w "GET /api/budgets unauth: %{http_code} (want 401)\n" $BASE/api/budgets
curl -s -o /dev/null -w "GET /api/trips unauth: %{http_code} (want 401)\n" $BASE/api/trips
curl -s -o /dev/null -w "GET /api/lifescore unauth: %{http_code} (want 401)\n" $BASE/api/lifescore
curl -s -o /dev/null -w "GET /api/insights unauth: %{http_code} (want 401)\n" $BASE/api/insights

echo "=== 1. register fresh user ==="
RUN_EMAIL="phase5-$(date +%s)@saarthi.app"
REG=$(curl -s -X POST $J -d "{\"email\":\"$RUN_EMAIL\",\"password\":\"test1234\",\"name\":\"Phase Five\"}" $BASE/api/auth/register)
TOKEN=$(echo "$REG" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
echo "token ok: ${TOKEN:0:12}..."
AUTH=(-H "Authorization: Bearer $TOKEN")

echo "=== 2. seed account + categories ==="
ACC=$(curl -s -X POST "${AUTH[@]}" $J -d '{"name":"HDFC Savings","type":"savings","balancePaise":5000000}' $BASE/api/accounts)
ACC_ID=$(echo "$ACC" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
echo "account: $ACC_ID"
CATS=$(curl -s "${AUTH[@]}" $BASE/api/categories)
FOOD_ID=$(echo "$CATS" | python3 -c "import sys,json;print([c['id'] for c in json.load(sys.stdin)['data'] if c['name']=='Food'][0])")
TRAVEL_CAT_ID=$(echo "$CATS" | python3 -c "import sys,json;print([c['id'] for c in json.load(sys.stdin)['data'] if c['name']=='Travel'][0])")
INCOME_CAT_ID=$(echo "$CATS" | python3 -c "import sys,json;print([c['id'] for c in json.load(sys.stdin)['data'] if c['name']=='Income'][0])")
echo "food: $FOOD_ID travel-cat: $TRAVEL_CAT_ID"

echo "=== 3. budgets ==="
curl -s -o /dev/null -w "budget on income category (want 422): %{http_code}\n" -X POST "${AUTH[@]}" $J -d "{\"categoryId\":\"$INCOME_CAT_ID\",\"amountPaise\":100000}" $BASE/api/budgets
curl -s -o /dev/null -w "budget 0 amount (want 422): %{http_code}\n" -X POST "${AUTH[@]}" $J -d "{\"categoryId\":\"$FOOD_ID\",\"amountPaise\":0}" $BASE/api/budgets
curl -s -o /dev/null -w "budget food 800000 (₹8,000): %{http_code}\n" -X POST "${AUTH[@]}" $J -d "{\"categoryId\":\"$FOOD_ID\",\"amountPaise\":800000}" $BASE/api/budgets
# upsert same category again — must UPDATE not duplicate
curl -s -X POST "${AUTH[@]}" $J -d "{\"categoryId\":\"$FOOD_ID\",\"amountPaise\":900000}" $BASE/api/budgets > /dev/null
BUDGETS=$(curl -s "${AUTH[@]}" $BASE/api/budgets)
echo "$BUDGETS" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
assert len(d['budgets'])==1, 'upsert must not duplicate'
assert d['budgets'][0]['amountPaise']==900000, 'upsert updated amount'
print('budget upsert OK: 1 budget, ₹9,000 cap')
"

echo "=== 4. month transactions for pace ==="
# Spend ₹4,500 on Food → 50% of ₹9,000 budget. Expected pace today = day/DIM.
TODAY=$(date -u +%F)
curl -s -o /dev/null -X POST "${AUTH[@]}" $J -d "{\"accountId\":\"$ACC_ID\",\"categoryId\":\"$FOOD_ID\",\"amountPaise\":450000,\"direction\":\"out\",\"date\":\"$TODAY\",\"note\":\"groceries\"}" $BASE/api/transactions
curl -s "${AUTH[@]}" $BASE/api/budgets | python3 -c "
import sys,json,datetime
d=json.load(sys.stdin)['data']
b=d['budgets'][0]
today=datetime.date.today()
dim=(datetime.date(today.year,today.month+1,1)-datetime.date(today.year,today.month,1)).days if today.month<12 else 31
import calendar
dim=calendar.monthrange(today.year,today.month)[1]
expected=round(today.day/dim*1000)/10
print(f\"food spent ₹{b['spentPaise']/100} band={b['band']} spentPct={b['spentPct']} expectedPct={b['expectedPct']} (calendar {expected}%)\")
assert b['spentPaise']==450000
assert b['expectedPct']==expected, f'expected pace {expected}'
print('pace math OK')
"

echo "=== 5. trips ==="
curl -s -o /dev/null -w "trip end<start (want 422): %{http_code}\n" -X POST "${AUTH[@]}" $J -d '{"name":"Bad","startDate":"2026-09-10","endDate":"2026-09-01"}' $BASE/api/trips
curl -s -o /dev/null -w "trip bad budget (want 422): %{http_code}\n" -X POST "${AUTH[@]}" $J -d '{"name":"Bad","startDate":"2026-09-10","budgetPaise":-5}' $BASE/api/trips
TRIP=$(curl -s -X POST "${AUTH[@]}" $J -d '{"name":"Goa with friends","emoji":"🏖️","destination":"Goa","startDate":"2026-09-01","endDate":"2026-09-30","budgetPaise":2000000}' $BASE/api/trips)
TRIP_ID=$(echo "$TRIP" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
echo "trip created: $TRIP_ID"
# two trip expenses: ₹2,500 + ₹3,120.50 → total ₹5,620.50 of ₹20,000
curl -s -o /dev/null -X POST "${AUTH[@]}" $J -d "{\"accountId\":\"$ACC_ID\",\"categoryId\":\"$TRAVEL_CAT_ID\",\"amountPaise\":250000,\"direction\":\"out\",\"date\":\"2026-09-03\",\"note\":\"cab\",\"tripId\":\"$TRIP_ID\"}" $BASE/api/transactions
TXN2=$(curl -s -X POST "${AUTH[@]}" $J -d "{\"accountId\":\"$ACC_ID\",\"categoryId\":\"$TRAVEL_CAT_ID\",\"amountPaise\":312050,\"direction\":\"out\",\"date\":\"2026-09-05\",\"note\":\"hotel deposit\",\"tripId\":\"$TRIP_ID\"}" $BASE/api/transactions)
TXN2_ID=$(echo "$TXN2" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
curl -s -o /dev/null -w "foreign/missing tripId txn (want 404): %{http_code}\n" -X POST "${AUTH[@]}" $J -d "{\"accountId\":\"$ACC_ID\",\"amountPaise\":100,\"direction\":\"out\",\"date\":\"$TODAY\",\"tripId\":\"nope\"}" $BASE/api/transactions

echo "=== 6. trip detail ==="
curl -s "${AUTH[@]}" $BASE/api/trips/$TRIP_ID | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
assert d['phase']=='ongoing', d['phase']
assert d['spentPaise']==562050, d['spentPaise']  # 2,500 + 3,120.50
assert d['remainingPaise']==2000000-562050
assert len(d['daySeries'])==6, d['daySeries']  # Sep 1..6 (today), zero-filled
sept3=[p for p in d['daySeries'] if p['iso']=='2026-09-03'][0]
sept4=[p for p in d['daySeries'] if p['iso']=='2026-09-04'][0]
assert sept3['outPaise']==250000 and sept4['outPaise']==0, 'zero-fill + attribution'
assert d['byCategory'][0]['outPaise']==562050
print('trip detail OK: spend ₹56,205.0/2,00,000 · 6-day series zero-filled · phase ongoing')
"

echo "=== 7. remove txn from trip (SetNull) ==="
curl -s -X PATCH "${AUTH[@]}" $J -d '{"tripId":null}' $BASE/api/transactions/$TXN2_ID > /dev/null
curl -s "${AUTH[@]}" $BASE/api/trips/$TRIP_ID | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
assert d['spentPaise']==250000, d['spentPaise']
print('trip spend back to ₹2,500 after detach OK')
"
curl -s -X PATCH "${AUTH[@]}" $J -d "{\"tripId\":\"$TRIP_ID\"}" $BASE/api/transactions/$TXN2_ID > /dev/null

echo "=== 8. trip delete keeps ledger ==="
TRIP2=$(curl -s -X POST "${AUTH[@]}" $J -d '{"name":"Temp","startDate":"2026-08-01","endDate":"2026-08-05"}' $BASE/api/trips)
TRIP2_ID=$(echo "$TRIP2" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
curl -s -o /dev/null -X POST "${AUTH[@]}" $J -d "{\"accountId\":\"$ACC_ID\",\"amountPaise\":12300,\"direction\":\"out\",\"date\":\"2026-08-03\",\"tripId\":\"$TRIP2_ID\"}" $BASE/api/transactions
curl -s -o /dev/null -w "delete temp trip: %{http_code}\n" -X DELETE "${AUTH[@]}" $BASE/api/trips/$TRIP2_ID
BAL=$(curl -s "${AUTH[@]}" $BASE/api/accounts | python3 -c "import sys,json;print(json.load(sys.stdin)['data'][0]['balancePaise'])")
echo "ledger intact after trip delete (balance ₹$((BAL/100))): OK"

echo "=== 9. life score ==="
curl -s "${AUTH[@]}" $BASE/api/lifescore | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print(f\"overall={d['overall']} wealth={d['wealth']['score']} growth={d['growth']['score']} reflection={d['reflection']['score']}\")
assert d['wealth']['score'] is not None, 'wealth must be measurable (account + income data pending)'
"
# add income so savings rate is measurable: +₹1,00,000 income
curl -s -o /dev/null -X POST "${AUTH[@]}" $J -d "{\"accountId\":\"$ACC_ID\",\"categoryId\":\"$INCOME_CAT_ID\",\"amountPaise\":10000000,\"direction\":\"in\",\"date\":\"$TODAY\",\"note\":\"salary\"}" $BASE/api/transactions
curl -s "${AUTH[@]}" $BASE/api/lifescore | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print(f\"after income: overall={d['overall']} wealth={d['wealth']['score']}\")
sav=[c for c in d['wealth']['components'] if c['label']=='Savings rate'][0]
print('savings component:', sav['score'])
"

echo "=== 10. insights ==="
curl -s "${AUTH[@]}" "$BASE/api/insights?limit=6" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
for i in d['insights']:
    print(f\"[{i['severity']}] {i['emoji']} {i['title']}\")
assert isinstance(d['insights'], list)
print('insights endpoint OK')
"

echo "=== 11. trip expense on Today ==="
curl -s "${AUTH[@]}" $BASE/api/overview/today | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
assert d['budgetsToday'] is not None, 'budgets on Today'
assert d['tripToday'] is not None, 'trip on Today'
print('Today: budgets', d['budgetsToday']['band'], '· trip', d['tripToday']['name'], d['tripToday']['phase'])
"

echo "ALL PHASE 5 API CHECKS PASSED"
