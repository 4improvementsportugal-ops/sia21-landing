#!/usr/bin/env bash
# Fails when a landing HTML file ships without the human gate.
# templates/ is the copy-paste source and is not a published page.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
fail=0

while IFS= read -r -d '' f; do
  rel="${f#./}"
  case "$rel" in
    templates/*) continue ;;
  esac
  if ! grep -q 'human-gate.js' "$f"; then
    echo "FAIL $rel is missing human-gate.js"
    fail=1
    continue
  fi
  if grep -q 'capture_pageview:true' "$f" || grep -q 'capture_pageview: true' "$f"; then
    echo "FAIL $rel still captures PostHog pageviews before the human gate"
    fail=1
  fi
  if grep -q 'posthog.init' "$f"; then
    echo "FAIL $rel must not call posthog.init; SIA21_bootPosthog runs after the human gate"
    fail=1
  fi
  if ! grep -q 'SIA21_bootPosthog' "$f"; then
    echo "FAIL $rel must call SIA21_bootPosthog from SIA21_onHuman"
    fail=1
  fi
  if ! grep -q 'SIA21_onHuman' "$f"; then
    echo "FAIL $rel must wait for SIA21_onHuman before booting PostHog"
    fail=1
  fi
  if grep -q 'SIA21_startHumanGatedPixel' "$f" && ! grep -q 'SIA21_trackingSuppressed' "$f"; then
    echo "FAIL $rel starts the pixel without SIA21_trackingSuppressed"
    fail=1
  fi
done < <(find . -name '*.html' -not -path './.git/*' -not -path './node_modules/*' -not -path './test-results/*' -print0)

if ! grep -q 'SIA21_trackingSuppressed' templates/landing-template.html; then
  echo "FAIL templates/landing-template.html must document and call SIA21_trackingSuppressed"
  fail=1
fi

if ! grep -q 'SIA21_onHuman' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must expose SIA21_onHuman"
  fail=1
fi
if ! grep -q '__SIA21_HUMAN' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must set __SIA21_HUMAN"
  fail=1
fi
if ! grep -q 'ghl-agencias/obrigado.html' assets/human-gate.js; then
  echo "FAIL INSTANT_PATHS must include /ghl-agencias/obrigado.html"
  fail=1
fi
if ! grep -q 'SIA21_mayShowExit' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must expose SIA21_mayShowExit"
  fail=1
fi
if ! grep -q 'buy.stripe.com' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must gate buy.stripe.com clicks"
  fail=1
fi
if ! grep -q 'CHECKOUT_MIN_MS = 1500' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must wait 1500ms before Stripe navigation"
  fail=1
fi
if ! grep -q '__SIA21_ENGAGED' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must record engagement separately from a click"
  fail=1
fi
if ! grep -q 'SIA21_mayShowExit' assets/sia21-conv.js; then
  echo "FAIL assets/sia21-conv.js must keep exit offers behind SIA21_mayShowExit"
  fail=1
fi
if ! grep -q '__SIA21_CHECKOUT_OK' assets/sia21-conv.js; then
  echo "FAIL assets/sia21-conv.js must emit checkout events only after the Stripe gate"
  fail=1
fi
if ! grep -q 'capture_pageview: false' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must init PostHog with capture_pageview: false"
  fail=1
fi
if ! grep -q 'autocapture: false' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must init PostHog with autocapture: false"
  fail=1
fi
if ! grep -q 'disable_session_recording: true' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must init PostHog with disable_session_recording: true"
  fail=1
fi
if ! grep -q 'SIA21_armTracking' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must call SIA21_armTracking from SIA21_bootPosthog"
  fail=1
fi
if ! grep -q 'SIA21_allowCapture' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must expose SIA21_allowCapture"
  fail=1
fi
if ! grep -q '4improvementsportugal-ops.github.io' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must limit capture to the production host"
  fail=1
fi
if ! grep -q 'protocol !== "https:"' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must refuse non-HTTPS hosts"
  fail=1
fi
if ! grep -q 'SIA21_obviousTestId' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must refuse obvious test checkout ids"
  fail=1
fi
if grep -n 'route.continue' tests/*.js tests/*.mjs >/tmp/sia21-route-continue.txt 2>/dev/null; then
  echo "FAIL tests must not continue browser requests (a continued call can reach Meta or PostHog)"
  cat /tmp/sia21-route-continue.txt
  fail=1
fi
if grep -nE 'fetch\([[:space:]]*["'\'']https?://[^"'\'']*(posthog\.com|facebook\.com|facebook\.net)' tests/*.js tests/*.mjs >/tmp/sia21-remote-fetch.txt 2>/dev/null; then
  echo "FAIL tests must not fetch Meta or PostHog from Node"
  cat /tmp/sia21-remote-fetch.txt
  fail=1
fi
if ! grep -q 'sia21_qa_v1' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must honour the qa opt-out flag"
  fail=1
fi
if ! grep -q 'SIA21_trackingSuppressed' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must expose SIA21_trackingSuppressed"
  fail=1
fi
if ! grep -q 'sia21_qa' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must persist the sia21_qa flag"
  fail=1
fi
if ! grep -q 'SIA21_trackingSuppressed' assets/mthd-pixel.js; then
  echo "FAIL assets/mthd-pixel.js must use SIA21_trackingSuppressed before fbevents.js"
  fail=1
fi
if ! grep -q 'SIA21_trackingSuppressed' assets/sia21-conv.js; then
  echo "FAIL assets/sia21-conv.js must use SIA21_trackingSuppressed"
  fail=1
fi
if ! grep -q 'SIA21_trackingSuppressed' assets/sia21-purchase.js || ! grep -q 'cs_live_' assets/sia21-purchase.js; then
  echo "FAIL assets/sia21-purchase.js must suppress QA traffic and require a cs_live_ session"
  fail=1
fi
if ! grep -q 'sia21_scroll' assets/human-gate.js; then
  echo "FAIL assets/human-gate.js must emit sia21_scroll"
  fail=1
fi
if ! grep -q 'SIA21_allowCapture' assets/mthd-pixel.js; then
  echo "FAIL assets/mthd-pixel.js must stay silent unless SIA21_allowCapture"
  fail=1
fi

while IFS= read -r -d '' f; do
  rel="${f#./}"
  case "$rel" in
    templates/*|tests/*) continue ;;
  esac
  if grep -q 'stripe_checkout_click' "$f" && ! grep -q '__SIA21_CHECKOUT_OK' "$f"; then
    echo "FAIL $rel fires stripe_checkout_click without the Stripe gate"
    fail=1
  fi
done < <(find . -type f \( -name '*.html' -o -name '*.js' \) -not -path './.git/*' -not -path './node_modules/*' -not -path './test-results/*' -print0)

if [[ "$fail" -ne 0 ]]; then
  echo "anti-bot check failed"
  exit 1
fi
echo "anti-bot check passed"
