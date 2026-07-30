#!/usr/bin/env bash
# Launch the LLM mediator subcluster in the local ocap daemon.
#
# The mediator exposes a line-delimited JSON-RPC 2.0 interface on a
# Unix-domain socket under $OCAP_HOME (default ~/.ocap). Its two
# methods — `initialize(urls)` and `send(target,method,args)` —
# replace the kernel-cli's `queueMessage` RPC as the LLM tooling's
# path into the kernel, tightening the tool's authority to just the
# capabilities the operator hands it via `initialize`.
#
# Prerequisites: the daemon must already be running. Typical
# orchestration-demo flow is to run start-matcher.sh first (which
# starts the daemon) and then this script.
#
# Usage:
#   start-mediator.sh [--no-build] [--force-reset]

set -euo pipefail

SKIP_BUILD=false
FORCE_RESET=false

usage() {
  cat >&2 <<EOF
Usage: $0 [--no-build] [--force-reset]

  --no-build     Skip building/bundling the mediator vat.
  --force-reset  Force-reset the mediator subcluster if one already
                 exists. Without this, an existing subcluster is
                 reused as-is.
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

info() { echo "[start-mediator] $*" >&2; }
fail() { echo "[start-mediator] ERROR: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PKG_DIR/../.." && pwd)"
OCAP_BIN="$REPO_ROOT/packages/kernel-cli/dist/app.mjs"
BUNDLE_FILE="$PKG_DIR/src/mediator-vat/index.bundle"

OCAP_HOME_DIR="${OCAP_HOME:-${HOME}/.ocap}"
MEDIATOR_SOCKET_PATH="$OCAP_HOME_DIR/llm-mediator.sock"

if [[ ! -f "$OCAP_BIN" ]]; then
  fail "ocap CLI not found at $OCAP_BIN. Run \`yarn workspace @metamask/kernel-cli build\` first."
fi

if $SKIP_BUILD; then
  info "Skipping build (--no-build)"
  [[ -f "$BUNDLE_FILE" ]] || fail "Bundle not found at $BUNDLE_FILE. Remove --no-build or build first."
else
  info "Building llm-mediator-vat package..."
  (cd "$REPO_ROOT" && yarn workspace @ocap/llm-mediator-vat build >&2)
  info "Bundling mediator vat..."
  (cd "$REPO_ROOT" && yarn workspace @ocap/llm-mediator-vat bundle-vat >&2)
fi

daemon_exec() {
  (cd "$REPO_ROOT" && node "$OCAP_BIN" daemon exec "$@")
}

# Fast-fail if the daemon isn't up.
if ! daemon_exec getStatus >/dev/null 2>&1; then
  fail "daemon does not respond to \`daemon exec getStatus\`. Start it first (e.g. \`ocap daemon start\` or start-matcher.sh)."
fi

# Reuse an existing mediator subcluster unless --force-reset was passed.
EXISTING=$(daemon_exec getStatus | node -e "
  const raw = require('fs').readFileSync('/dev/stdin','utf8').trim();
  const data = JSON.parse(raw);
  const subclusters = data.subclusters ?? [];
  const found = subclusters.find(
    (sc) => sc?.config?.bootstrap === 'llmMediator',
  );
  if (found) {
    process.stdout.write('yes');
  }
")

if [[ -n "$EXISTING" && "$FORCE_RESET" == "false" ]]; then
  info "Mediator subcluster already exists; reusing."
  if [[ ! -S "$MEDIATOR_SOCKET_PATH" ]]; then
    fail "Existing mediator subcluster claims to be up but socket $MEDIATOR_SOCKET_PATH is missing."
  fi
  info "Socket: $MEDIATOR_SOCKET_PATH"
  echo "socket: $MEDIATOR_SOCKET_PATH"
  exit 0
fi

CONFIG=$(BUNDLE="file://$BUNDLE_FILE" \
         RESET="$FORCE_RESET" \
         SOCKET="$MEDIATOR_SOCKET_PATH" \
         node -e "
  const config = {
    config: {
      bootstrap: 'llmMediator',
      forceReset: process.env.RESET === 'true',
      services: ['ocapURLRedemptionService'],
      io: {
        socket: { type: 'socket', path: process.env.SOCKET }
      },
      vats: {
        llmMediator: { bundleSpec: process.env.BUNDLE }
      }
    }
  };
  process.stdout.write(JSON.stringify(config));
")

info "Launching mediator subcluster..."
daemon_exec launchSubcluster "$CONFIG" >/dev/null

# Give the vat a moment to open its listener before reporting readiness.
for i in $(seq 1 20); do
  if [[ -S "$MEDIATOR_SOCKET_PATH" ]]; then
    break
  fi
  if [[ "$i" -eq 20 ]]; then
    fail "Socket $MEDIATOR_SOCKET_PATH did not appear after 2s. See daemon logs."
  fi
  sleep 0.1
done

info "Mediator ready."
info "Socket: $MEDIATOR_SOCKET_PATH"
echo "socket: $MEDIATOR_SOCKET_PATH"
