#!/bin/bash
# Phase 9 browser golden path (locators fixed) — server + UI drive in one call.
set -u
cd /home/z/my-project
BASE="http://localhost:3000"
EMAIL="phase9ui@saarthi.app"

(setsid npm run dev < /dev/null > /dev/null 2>&1 &)
for i in $(seq 1 40); do sleep 2; code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE/api/auth/me" 2>/dev/null); [ "$code" = "401" ] && break; done
echo "server ready ($code)"

agent-browser set viewport 500 1000 > /dev/null
agent-browser open "$BASE/" > /dev/null
agent-browser wait --load networkidle > /dev/null 2>&1
sleep 2
# login (button, not the tab)
agent-browser find role button click --name "Sign in" > /dev/null 2>&1 || true
agent-browser find label "Email" fill "$EMAIL" > /dev/null
agent-browser find label "Password" fill "test12345" > /dev/null
agent-browser find role button click --name "Sign in" > /dev/null
sleep 4
echo "url: $(agent-browser get url)"

echo "== today widget state =="
agent-browser wait --text "Goal contributions" > /dev/null 2>&1 || echo "WARN widget missing"
agent-browser eval "Array.from(document.querySelectorAll('h2')).find(h=>h.textContent.toUpperCase().includes('GOAL CONTRIBUTIONS'))?.parentElement?.innerText?.replace(/\n+/g,' | ').slice(0,300)"
agent-browser screenshot download/saarthi-phase9-today.png > /dev/null
echo "today screenshot ✓"

echo "== goals screen: expand Emergency fund =="
agent-browser open "$BASE/#/growth/goals" > /dev/null
agent-browser wait --load networkidle > /dev/null 2>&1
sleep 2
agent-browser eval "const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.includes('Emergency fund')); (b?b.click():'notfound')"
sleep 2
echo "-- panel content --"
agent-browser eval "document.querySelector('[data-testid=contribution-panel]')?.innerText?.replace(/\n+/g,' | ').slice(0,420) || 'PANEL MISSING'"
agent-browser screenshot download/saarthi-phase9-grid.png --full > /dev/null
echo "grid screenshot ✓"

echo "== edit a past cell (tap 15 Aug square) =="
agent-browser eval "const c=document.querySelector('[aria-label^=\"2026-08-15\"]'); c?(c.disabled?'disabled-future':'clicked'):'missing'"
sleep 1
echo "-- input state after pick --"
agent-browser eval "document.querySelector('[data-testid=contribution-panel] input')?.value || '(empty)'"
agent-browser eval "const i=document.querySelector('[data-testid=contribution-panel] input'); const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(i,'1000'); i.dispatchEvent(new Event('input',{bubbles:true}))"
sleep 1
agent-browser eval "const btns=Array.from(document.querySelectorAll('[data-testid=contribution-panel] button')); const b=btns.find(x=>x.textContent.trim()==='Log'); b?b.click():'notfound'"
sleep 2
echo "-- panel after edit --"
agent-browser eval "document.querySelector('[data-testid=contribution-panel]')?.innerText?.replace(/\n+/g,' | ').slice(0,300)"
agent-browser screenshot download/saarthi-phase9-edit.png > /dev/null

echo "== streak-day cell check + dark mode =="
agent-browser set media dark > /dev/null
sleep 1
agent-browser screenshot download/saarthi-phase9-grid-dark.png > /dev/null
agent-browser set media light > /dev/null
echo "dark screenshot ✓"

echo "== console/page errors =="
agent-browser errors | head -4
echo "-- [api] errors in dev.log: $(grep -a -c '\[api\] Error' dev.log 2>/dev/null || echo 0)"
echo DONE
