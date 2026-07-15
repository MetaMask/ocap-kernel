#!/usr/bin/env bash
# Start (or reuse) the orchestration-demo wallet vat as a subcluster
# inside the consumer daemon (~/.ocap-consumer by default). The
# demo's openclaw plugin redeems the wallet's OCAP URL to invoke
# balance / deposit / withdraw against a real vat-hosted balance,
# replacing the plugin's earlier process-local mock.
#
# Prereqs: the consumer daemon must already be running with remote
# comms initialised. `rehearsal-restart-matcher.sh` step 2 sets that
# up; this script is invoked from step 2a immediately after.
#
# Usage:
#   start-wallet.sh [--no-build]
#
#   --no-build   Skip building the orchestration-demo-vats package and
#                bundling the wallet vat. The bundle must already
#                exist on disk.
#
# On success one labeled line is printed to stdout (progress messages
# go to stderr):
#   wallet:  <wallet OCAP URL>
# and the URL is written to $CONSUMER_HOME/wallet-url.env as a csh
# setenv line so downstream steps can `source` it.

set -euo pipefail

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

SKIP_BUILD=false

usage() {
  cat >&2 <<EOF
Usage: $0 [--no-build]

  --no-build   Skip building the orchestration-demo-vats package and
               bundling the wallet vat.
  --help, -h   Show this help.
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)
      SKIP_BUILD=true; shift ;;
    --help|-h)
      usage ;;
    *)
      echo "Error: unknown argument: $1" >&2; usage ;;
  esac
done

info() { echo "[start-wallet] $*" >&2; }
fail() { echo "[start-wallet] ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Locate the repo + bin paths
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PKG_DIR/../.." && pwd)"
OCAP_BIN="$REPO_ROOT/packages/kernel-cli/dist/app.mjs"
WALLET_BUNDLE="$PKG_DIR/src/wallet/index.bundle"

# The wallet vat lives inside the consumer daemon on the VPS — same
# daemon the openclaw discovery plugin already talks to. Keeping
# them co-resident avoids adding a fourth daemon home and lets the
# demo plugin reach the wallet through the same relay-facing
# transport the discovery plugin already uses.
CONSUMER_HOME="${OCAP_CONSUMER_HOME:-${HOME}/.ocap-consumer}"

if [[ ! -f "$OCAP_BIN" ]]; then
  fail "ocap CLI not found at $OCAP_BIN. Run \`yarn workspace @metamask/kernel-cli build\` first."
fi

# ---------------------------------------------------------------------------
# Build & bundle
# ---------------------------------------------------------------------------

if $SKIP_BUILD; then
  info "Skipping build (--no-build)"
  [[ -f "$WALLET_BUNDLE" ]] || fail "Bundle not found at $WALLET_BUNDLE. Remove --no-build or bundle first."
else
  info "Building orchestration-demo-vats package..."
  (cd "$REPO_ROOT" && yarn workspace @ocap/orchestration-demo-vats build >&2)
  info "Bundling orchestration-demo-vats..."
  (cd "$REPO_ROOT" && yarn workspace @ocap/orchestration-demo-vats bundle-vats >&2)
fi

daemon_exec() {
  (cd "$REPO_ROOT" && node "$OCAP_BIN" --home "$CONSUMER_HOME" daemon exec "$@")
}

daemon_queue() {
  (cd "$REPO_ROOT" && node "$OCAP_BIN" --home "$CONSUMER_HOME" daemon queueMessage "$@")
}

# ---------------------------------------------------------------------------
# Verify the daemon is up and connected
# ---------------------------------------------------------------------------

info "Checking consumer daemon status..."
STATUS_JSON="$(daemon_exec getStatus 2>/dev/null)" \
  || fail "Consumer daemon at $CONSUMER_HOME is not responding. Run rehearsal-restart-matcher.sh first (step 2 brings it up)."

REMOTE_STATE=$(echo "$STATUS_JSON" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  process.stdout.write(data.remoteComms?.state ?? 'none');
")
if [[ "$REMOTE_STATE" != "connected" ]]; then
  fail "Consumer daemon's remote comms are in state '$REMOTE_STATE' (need 'connected'). Restart with rehearsal-restart-matcher.sh step 2."
fi

# ---------------------------------------------------------------------------
# Locate an existing wallet subcluster, or launch a fresh one
#
# The consumer daemon's kernel state may already hold a wallet
# subcluster from a prior run; relaunching unconditionally would
# create a second one with a different URL. Same smart-reuse
# pattern as start-matcher.sh.
# ---------------------------------------------------------------------------

EXISTING_WALLET_VAT_ID=$(echo "$STATUS_JSON" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const subclusters = data.subclusters ?? [];
  const wallet = subclusters.find(
    (sc) => sc?.config?.bootstrap === 'wallet',
  );
  if (wallet && wallet.vats && typeof wallet.vats.wallet === 'string') {
    process.stdout.write(wallet.vats.wallet);
  }
")

if [[ -n "$EXISTING_WALLET_VAT_ID" ]]; then
  info "Found existing wallet subcluster (vat $EXISTING_WALLET_VAT_ID); reusing it."
  ROOT_QUERY_SQL="SELECT value FROM kv WHERE key = '${EXISTING_WALLET_VAT_ID}.c.o+0'"
  ROOT_QUERY_JSON=$(SQL="$ROOT_QUERY_SQL" node -e "
    process.stdout.write(JSON.stringify({ sql: process.env.SQL }));
  ")
  WALLET_ROOT_KREF=$(daemon_exec executeDBQuery "$ROOT_QUERY_JSON" | node -e "
    const raw = require('fs').readFileSync('/dev/stdin','utf8').trim();
    const rows = JSON.parse(raw);
    if (Array.isArray(rows) && rows[0] && typeof rows[0].value === 'string') {
      process.stdout.write(rows[0].value);
    }
  ")
  if [[ -z "$WALLET_ROOT_KREF" ]]; then
    fail "Existing wallet subcluster has no root object kref — kernel database may be corrupted."
  fi
  info "Wallet root kref: $WALLET_ROOT_KREF"
  WALLET_URL=$(daemon_queue "$WALLET_ROOT_KREF" getWalletUrl --raw | node -e "
    const raw = require('fs').readFileSync('/dev/stdin','utf8').trim();
    const result = JSON.parse(raw);
    if (result && typeof result === 'object' && typeof result.body === 'string') {
      process.stdout.write(JSON.parse(result.body.replace(/^#/u, '')));
    } else if (typeof result === 'string') {
      process.stdout.write(result);
    }
  ")
  if [[ -z "$WALLET_URL" ]]; then
    fail "Could not retrieve persisted wallet URL from vat root."
  fi
else
  CONFIG=$(BUNDLE="file://$WALLET_BUNDLE" node -e "
    const config = {
      config: {
        bootstrap: 'wallet',
        services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
        vats: {
          wallet: { bundleSpec: process.env.BUNDLE }
        }
      }
    };
    process.stdout.write(JSON.stringify(config));
  ")

  info "Launching wallet subcluster..."
  LAUNCH_RESULT=$(daemon_exec launchSubcluster "$CONFIG")

  WALLET_URL=$(echo "$LAUNCH_RESULT" | node -e "
    const raw = require('fs').readFileSync('/dev/stdin','utf8').trim();
    const data = JSON.parse(raw);
    const br = data.bootstrapResult;
    let body;
    if (br && typeof br === 'object' && typeof br.body === 'string') {
      body = JSON.parse(br.body.replace(/^#/u, ''));
    } else if (br && typeof br === 'object') {
      body = br;
    } else {
      process.stderr.write('Bootstrap result not an object: ' + raw + '\\n');
      process.exit(1);
    }
    if (!body.walletUrl) {
      process.stderr.write('Could not extract walletUrl from: ' + raw + '\\n');
      process.exit(1);
    }
    process.stdout.write(body.walletUrl);
  ")
fi

info "Wallet URL: $WALLET_URL"

# ---------------------------------------------------------------------------
# Write the URL to a sourceable env file. csh setenv form because the
# operator's interactive shell is csh.
# ---------------------------------------------------------------------------

URLS_FILE="$CONSUMER_HOME/wallet-url.env"
cat > "$URLS_FILE" <<EOF
setenv WALLET_OCAP_URL '$WALLET_URL'
EOF
info "URL written to $URLS_FILE (source from csh)."

info "Wallet ready."
echo "wallet:  $WALLET_URL"
