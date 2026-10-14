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

if [[ "$fail" -ne 0 ]]; then
  echo "anti-bot check failed"
  exit 1
fi
echo "anti-bot check passed"
