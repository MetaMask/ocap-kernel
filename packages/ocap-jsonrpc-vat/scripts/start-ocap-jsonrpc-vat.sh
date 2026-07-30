#!/usr/bin/env bash
# Launch the ocap JSON-RPC subcluster in the local ocap daemon.
#
# The vat exposes a line-delimited JSON-RPC 2.0 interface on a
# Unix-domain socket under $OCAP_HOME (default ~/.ocap). Its two
# methods — `redeemURL(url)` and `send(target,method,args)` — are
# intended as the routine path by which local, non-vat processes
# reach kernel objects, replacing ad-hoc use of the kernel-cli's
# `queueMessage` RPC.
#
# Prerequisites: the daemon must already be running. Typical
# orchestration-demo flow is to run start-matcher.sh first (which
# starts the daemon) and then this script.
#
# Usage:
#   start-ocap-jsonrpc-vat.sh [--no-build] [--force-reset]

set -euo pipefail

SKIP_BUILD=false
FORCE_RESET=false

usage() {
  cat >&2 <<EOF
Usage: $0 [--no-build] [--force-reset]

  --no-build     Skip building/bundling the ocap JSON-RPC vat.
  --force-reset  Force-reset the subcluster if one already exists.
                 Without this, an existing subcluster is reused as-is.
  --help, -h     Show this help.
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) SKIP_BUILD=true; shift ;;
    --force-reset) FORCE_RESET=true; shift ;;
    --help|-h) usage ;;
    *) echo "Error: unknown argument: $1" >&2; usage ;;
  esac
done

info() { echo "[start-ocap-jsonrpc-vat] $*" >&2; }
fail() { echo "[start-ocap-jsonrpc-vat] ERROR: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PKG_DIR/../.." && pwd)"
OCAP_BIN="$REPO_ROOT/packages/kernel-cli/dist/app.mjs"
BUNDLE_FILE="$PKG_DIR/src/vat/index.bundle"

OCAP_HOME_DIR="${OCAP_HOME:-${HOME}/.ocap}"
SOCKET_PATH="$OCAP_HOME_DIR/ocap-jsonrpc.sock"

if [[ ! -f "$OCAP_BIN" ]]; then
  fail "ocap CLI not found at $OCAP_BIN. Run \`yarn workspace @metamask/kernel-cli build\` first."
fi

if $SKIP_BUILD; then
  info "Skipping build (--no-build)"
  [[ -f "$BUNDLE_FILE" ]] || fail "Bundle not found at $BUNDLE_FILE. Remove --no-build or build first."
else
  info "Building ocap-jsonrpc-vat package..."
  (cd "$REPO_ROOT" && yarn workspace @ocap/ocap-jsonrpc-vat build >&2)
  info "Bundling vat..."
  (cd "$REPO_ROOT" && yarn workspace @ocap/ocap-jsonrpc-vat bundle-vat >&2)
fi

daemon_exec() {
  (cd "$REPO_ROOT" && node "$OCAP_BIN" daemon exec "$@")
}

# Fast-fail if the daemon isn't up.
if ! daemon_exec getStatus >/dev/null 2>&1; then
  fail "daemon does not respond to \`daemon exec getStatus\`. Start it first (e.g. \`ocap daemon start\` or start-matcher.sh)."
fi

# Reuse an existing subcluster unless --force-reset was passed.
EXISTING=$(daemon_exec getStatus | node -e "
  const raw = require('fs').readFileSync('/dev/stdin','utf8').trim();
  const data = JSON.parse(raw);
  const subclusters = data.subclusters ?? [];
  const found = subclusters.find(
    (sc) => sc?.config?.bootstrap === 'ocapJsonrpcVat',
  );
  if (found) {
    process.stdout.write('yes');
  }
")

if [[ -n "$EXISTING" && "$FORCE_RESET" == "false" ]]; then
  info "Subcluster already exists; reusing."
  if [[ ! -S "$SOCKET_PATH" ]]; then
    fail "Existing subcluster claims to be up but socket $SOCKET_PATH is missing."
  fi
  info "Socket: $SOCKET_PATH"
  echo "socket: $SOCKET_PATH"
  exit 0
fi

CONFIG=$(BUNDLE="file://$BUNDLE_FILE" \
         RESET="$FORCE_RESET" \
         SOCKET="$SOCKET_PATH" \
         node -e "
  const config = {
    config: {
      bootstrap: 'ocapJsonrpcVat',
      forceReset: process.env.RESET === 'true',
      services: ['ocapURLRedemptionService'],
      io: {
        socket: { type: 'socket', path: process.env.SOCKET }
      },
      vats: {
        ocapJsonrpcVat: { bundleSpec: process.env.BUNDLE }
      }
    }
  };
  process.stdout.write(JSON.stringify(config));
")

info "Launching subcluster..."
daemon_exec launchSubcluster "$CONFIG" >/dev/null

# Give the vat a moment to open its listener before reporting readiness.
for i in $(seq 1 20); do
  if [[ -S "$SOCKET_PATH" ]]; then
    break
  fi
  if [[ "$i" -eq 20 ]]; then
    fail "Socket $SOCKET_PATH did not appear after 2s. See daemon logs."
  fi
  sleep 0.1
done

info "Vat ready."
info "Socket: $SOCKET_PATH"
echo "socket: $SOCKET_PATH"
