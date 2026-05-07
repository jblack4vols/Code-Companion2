#!/usr/bin/env bash
# Lightweight production probe for crm.tristarpt.com.
#
# Hits the unauthenticated surfaces that prove the app is alive and that
# the auth boundary is intact. Exits 0 if everything is healthy, 1 otherwise.
#
# Usage:
#   bash scripts/check-prod-health.sh
#
# Designed to be cheap enough to run every few minutes:
#   - via the Claude Code /loop slash command (during a session)
#   - via cron / launchd / systemd timer (hands-off)
#   - via a GitHub Action with a `schedule:` trigger (cloud-side, free)
#
# What it does NOT do (and why):
#   - It can't read /api/feedback or /api/audit-logs because those require
#     an authenticated session. To monitor those surfaces, mint an API key
#     with the relevant scopes (or add `feedback:read` / `audit:read` scopes
#     to publicApi.ts) and adapt this script to send `x-api-key`.
#   - It can't read Railway logs without the Railway CLI and a project
#     token, neither of which are wired up here.

set -u

BASE_URL="${BASE_URL:-https://crm.tristarpt.com}"
TIMEOUT="${TIMEOUT:-10}"
fail_count=0

probe() {
  local label="$1"
  local path="$2"
  local expected="$3"

  local response
  response=$(curl -sS -o /dev/null -w "%{http_code} %{time_total}" \
    --max-time "$TIMEOUT" "${BASE_URL}${path}" 2>&1) || {
    printf "  FAIL  %-22s  curl error: %s\n" "$label" "$response"
    fail_count=$((fail_count + 1))
    return
  }

  local code="${response% *}"
  local time="${response#* }"
  if [[ "$code" == "$expected" ]]; then
    printf "  ok    %-22s  HTTP %s  %ss\n" "$label" "$code" "$time"
  else
    printf "  FAIL  %-22s  HTTP %s (expected %s)  %ss\n" \
      "$label" "$code" "$expected" "$time"
    fail_count=$((fail_count + 1))
  fi
}

printf "Probing %s\n" "$BASE_URL"

# Server-up signal. /health is unauthenticated and cheap.
probe "health"             "/health"           "200"

# Frontend bundle reachable.
probe "root"               "/"                 "200"

# Auth boundary intact: /api/auth/me unauthenticated must 401, never 200 or 5xx.
probe "auth boundary"      "/api/auth/me"      "401"

# CSRF token endpoint reachable (also confirms middleware loaded without error).
probe "csrf-token"         "/api/csrf-token"   "200"

if [[ "$fail_count" -gt 0 ]]; then
  printf "\n%d probe(s) failed.\n" "$fail_count" >&2
  exit 1
fi

printf "\nAll probes ok.\n"
exit 0
