#!/usr/bin/env bash
# Start a service-matcher daemon and print its OCAP URL.
#
# This script is orthogonal to relay startup: it does not start a relay,
# and the relay does not need to know anything about this script. The two
# can be started in either order; whichever one starts second picks up
# the other's state.
#
# The relay's multiaddr is resolved in this order:
#   1. --relay <multiaddr>        (explicit override on the CLI)
#   2. $OCAP_RELAY_MULTIADDR      (environment variable)
#   3. $HOME/.ocap/relay.addr     (file written by `yarn ocap relay`)
# If none of these yields an address the script exits with an error so
# the operator can start the relay first (or pass its address directly).
#
# Usage:
#   start-matcher.sh [--relay MULTIADDR] [--no-build] [--keep-state]
#
# On success the matcher's OCAP URL is printed to stdout on its own
# line — all progress messages go to stderr — so:
#   OCAP_MATCHER_URL=$(start-matcher.sh)
# works as expected.

set -euo pipefail

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

RELAY_ADDR="${OCAP_RELAY_MULTIADDR:-}"
RELAY_FILE="${HOME}/.ocap/relay.addr"
SKIP_BUILD=false
FORCE_RESET=true

usage() {
  cat >&2 <<EOF
Usage: $0 [--relay MULTIADDR] [--no-build] [--keep-state]

  --relay MULTIADDR  Relay multiaddr to connect through. Overrides
                     \$OCAP_RELAY_MULTIADDR and \$HOME/.ocap/relay.addr.
  --no-build         Skip building/bundling the matcher vat.
  --keep-state       Do not purge any existing daemon state before
                     launching the matcher subcluster.
  --help, -h         Show this help.
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --relay)
      [[ $# -lt 2 ]] && { echo "Error: --relay requires a value" >&2; usage; }
      RELAY_ADDR="$2"; shift 2 ;;
    --no-build)
      SKIP_BUILD=true; shift ;;
    --keep-state)
      FORCE_RESET=false; shift ;;
    --help|-h)
      usage ;;
    *)
      echo "Error: unknown argument: $1" >&2; usage ;;
  esac
done

info() { echo "[start-matcher] $*" >&2; }
fail() { echo "[start-matcher] ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Resolve relay address
# ---------------------------------------------------------------------------

if [[ -z "$RELAY_ADDR" && -f "$RELAY_FILE" ]]; then
  RELAY_ADDR="$(tr -d '[:space:]' < "$RELAY_FILE" || true)"
fi
if [[ -z "$RELAY_ADDR" ]]; then
  fail "No relay address supplied. Pass --relay, set \$OCAP_RELAY_MULTIADDR, or start the relay (\`yarn ocap relay\`) to populate $RELAY_FILE."
fi
info "Relay: $RELAY_ADDR"

# ---------------------------------------------------------------------------
# Locate the repo + bin paths
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PKG_DIR/../.." && pwd)"
OCAP_BIN="$REPO_ROOT/packages/kernel-cli/dist/app.mjs"
BUNDLE_FILE="$PKG_DIR/src/matcher-vat/index.bundle"

if [[ ! -f "$OCAP_BIN" ]]; then
  fail "ocap CLI not found at $OCAP_BIN. Run \`yarn workspace @metamask/kernel-cli build\` first."
fi

# ---------------------------------------------------------------------------
# Build & bundle
# ---------------------------------------------------------------------------

if $SKIP_BUILD; then
  info "Skipping build (--no-build)"
  [[ -f "$BUNDLE_FILE" ]] || fail "Bundle not found at $BUNDLE_FILE. Remove --no-build or build first."
else
  info "Building service-matcher package..."
  (cd "$REPO_ROOT" && yarn workspace @metamask/service-matcher build >&2)
  info "Bundling matcher vat..."
  (cd "$REPO_ROOT" && yarn workspace @metamask/service-matcher bundle-vat >&2)
fi

# ---------------------------------------------------------------------------
# Start daemon
# ---------------------------------------------------------------------------

if $FORCE_RESET; then
  info "Purging existing daemon state..."
  (cd "$REPO_ROOT" && node "$OCAP_BIN" daemon purge --force >&2) || true
fi

info "Starting daemon..."
# `daemon start` fails if one is already running; detect and continue.
if ! (cd "$REPO_ROOT" && node "$OCAP_BIN" daemon start >&2); then
  info "daemon start failed — assuming one is already running"
fi

daemon_exec() {
  (cd "$REPO_ROOT" && node "$OCAP_BIN" daemon exec "$@")
}

# ---------------------------------------------------------------------------
# Initialize remote comms
# ---------------------------------------------------------------------------

RELAY_HOST=$(echo "$RELAY_ADDR" | node -e "
  const addr = require('fs').readFileSync('/dev/stdin','utf8').trim();
  const m = addr.match(/\\/(?:ip4|ip6|dns4|dns6)\\/([^\\/]+)/);
  if (m) process.stdout.write(m[1]);
")
COMMS_PARAMS=$(RELAY="$RELAY_ADDR" HOST="$RELAY_HOST" node -e "
  const params = { relays: [process.env.RELAY] };
  if (process.env.HOST) params.allowedWsHosts = [process.env.HOST];
  process.stdout.write(JSON.stringify(params));
")

info "Initializing remote comms..."
daemon_exec initRemoteComms "$COMMS_PARAMS" >/dev/null

info "Waiting for remote comms to connect..."
for i in $(seq 1 30); do
  STATUS=$(daemon_exec getStatus 2>/dev/null) || STATUS=""
  STATE=""
  if [[ -n "$STATUS" ]]; then
    STATE=$(echo "$STATUS" | node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
      process.stdout.write(data.remoteComms?.state ?? 'none');
    ")
  fi
  if [[ "$STATE" == "connected" ]]; then
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    fail "Remote comms did not reach 'connected' state after 30s (current: ${STATE:-unknown})"
  fi
  sleep 1
done
info "Remote comms connected"

# ---------------------------------------------------------------------------
# Launch the matcher subcluster
# ---------------------------------------------------------------------------

CONFIG=$(BUNDLE="file://$BUNDLE_FILE" RESET="$FORCE_RESET" node -e "
  const config = {
    config: {
      bootstrap: 'matcher',
      forceReset: process.env.RESET === 'true',
      services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
      vats: {
        matcher: { bundleSpec: process.env.BUNDLE }
      }
    }
  };
  process.stdout.write(JSON.stringify(config));
")

info "Launching matcher subcluster..."
LAUNCH_RESULT=$(daemon_exec launchSubcluster "$CONFIG")

MATCHER_URL=$(echo "$LAUNCH_RESULT" | node -e "
  const raw = require('fs').readFileSync('/dev/stdin','utf8').trim();
  const data = JSON.parse(raw);
  // bootstrapResult may be CapData { body, slots } or a plain object.
  const br = data.bootstrapResult;
  let url;
  if (br && typeof br === 'object' && typeof br.body === 'string') {
    const body = br.body.replace(/^#/u, '');
    url = JSON.parse(body).matcherUrl;
  } else if (br && typeof br === 'object') {
    url = br.matcherUrl;
  }
  if (!url) {
    process.stderr.write('Could not extract matcherUrl from: ' + raw + '\\n');
    process.exit(1);
  }
  process.stdout.write(url);
")

info "Matcher ready."
echo "$MATCHER_URL"
