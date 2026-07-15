#!/usr/bin/env bash
# Per-rehearsal laptop-side service bring-up:
#
#   1. scp the matcher's csh setenv env file from the VPS
#   2. parse out MATCHER_OCAP_URL / MATCHER_OBSERVER_URL
#   3. ssh-fetch the libp2p relay multiaddr from the VPS
#   4. run start-services.sh with all three values exported
#
# Replaces the four-step paste-and-source dance that step 7 of the
# dry-run playbook used to require. The whole thing is idempotent —
# if the matcher URL is unchanged from the previous run (the routine
# case now that the matcher registry persists), this script reaches
# the same end state.
#
# Required env:
#   VPS_HOST   The ssh target (alias, user@host, or bare hostname)
#              for the VPS. Identical to the value the dry-run
#              playbook tells you to setenv once in your shell rc.
#
# Optional env:
#   OCAP_SERVICES_HOME   Override for the services daemon home
#                        (defaults inside start-services.sh).
#
# Usage:
#   rehearsal-start-services.sh [start-services-args...]
#
# Any extra arguments are passed through to start-services.sh.

set -euo pipefail

if [[ -z "${VPS_HOST:-}" ]]; then
  echo "[rehearsal-start] ERROR: VPS_HOST is not set." >&2
  echo "                  setenv it once in your shell rc — see the dry-run playbook." >&2
  exit 1
fi

info() { echo "[rehearsal-start] $*" >&2; }
fail() { echo "[rehearsal-start] ERROR: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info "Step 1/3: fetching matcher URLs from $VPS_HOST..."
TMP_ENV="$(mktemp -t matcher-urls-XXXXXX.env)"
trap 'rm -f "$TMP_ENV"' EXIT
scp -q "${VPS_HOST}:.ocap/matcher-urls.env" "$TMP_ENV" \
  || fail "scp failed — is the VPS reachable and is the matcher running?"

# matcher-urls.env is csh `setenv FOO 'value'` lines. Parse them with
# a regex rather than sourcing (we're in bash) and export the values.
while IFS= read -r line; do
  [[ "$line" =~ ^setenv[[:space:]]+([A-Z_][A-Z0-9_]*)[[:space:]]+\'(.*)\'[[:space:]]*$ ]] || continue
  key="${BASH_REMATCH[1]}"
  value="${BASH_REMATCH[2]}"
  export "$key=$value"
done < "$TMP_ENV"

if [[ -z "${MATCHER_OCAP_URL:-}" ]]; then
  fail "Could not extract MATCHER_OCAP_URL from $TMP_ENV."
fi
info "  matcher: $MATCHER_OCAP_URL"
info "  observer: ${MATCHER_OBSERVER_URL:-<not set>}"

info "Step 2/3: fetching relay multiaddr..."
RELAY_ADDR="$(ssh "$VPS_HOST" 'cat ~/.libp2p-relay/relay.addr' | tr -d '[:space:]')" \
  || fail "ssh to fetch relay multiaddr failed."
[[ -n "$RELAY_ADDR" ]] || fail "Relay multiaddr came back empty."
export OCAP_RELAY_MULTIADDR="$RELAY_ADDR"
info "  relay: $RELAY_ADDR"

info "Step 3/3: launching services..."
exec "$SCRIPT_DIR/start-services.sh" "$@"
