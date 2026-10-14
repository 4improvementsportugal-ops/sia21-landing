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
    if ! grep -q 'capture_pageview:false' "$f"; then
      echo "FAIL $rel PostHog init must set capture_pageview:false"
      fail=1
    fi
    if ! grep -q 'autocapture:false' "$f"; then
      echo "FAIL $rel PostHog init must set autocapture:false"
      fail=1
    fi
    if ! grep -q 'disable_session_recording:true' "$f"; then
      echo "FAIL $rel PostHog init must set disable_session_recording:true"
      fail=1
    fi
    if ! grep -q 'SIA21_armTracking' "$f"; then
      echo "FAIL $rel must call SIA21_armTracking() after posthog.init"
      fail=1
    fi
    gate_line="$(grep -n 'human-gate.js' "$f" | head -1 | cut -d: -f1)"
    ph_line="$(grep -n 'posthog.init' "$f" | head -1 | cut -d: -f1)"
    if [[ -n "$gate_line" && -n "$ph_line" && "$gate_line" -gt "$ph_line" ]]; then
      echo "FAIL $rel loads human-gate.js after posthog.init"
      fail=1
    fi
  fi
done < <(find . -name '*.html' -not -path './.git/*' -print0)

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

while IFS= read -r -d '' f; do
  rel="${f#./}"
  case "$rel" in
    templates/*|tests/*) continue ;;
  esac
  if grep -q 'stripe_checkout_click' "$f" && ! grep -q '__SIA21_CHECKOUT_OK' "$f"; then
    echo "FAIL $rel fires stripe_checkout_click without the Stripe gate"
    fail=1
  fi
done < <(find . -type f \( -name '*.html' -o -name '*.js' \) -not -path './.git/*' -print0)

if [[ "$fail" -ne 0 ]]; then
  echo "anti-bot check failed"
  exit 1
fi
echo "anti-bot check passed"
