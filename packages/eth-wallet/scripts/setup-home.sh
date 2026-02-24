#!/usr/bin/env bash
# Setup script for the HOME wallet device.
#
# Starts the daemon, launches the wallet subcluster, initialises the keyring
# with the provided mnemonic, configures the Ethereum provider, and issues an
# OCAP URL that the away device will use to connect.
#
# Usage:
#   ./setup-home.sh --mnemonic "word1 word2 ..." --infura-key KEY [options]
#
# Required:
#   --mnemonic    The 12-word seed phrase for the master wallet
#   --infura-key  Infura project API key (for Sepolia RPC)
#
# Optional:
#   --pimlico-key KEY   Pimlico API key (for bundler / paymaster)
#   --chain-id    ID    Chain ID (default: 11155111 = Sepolia)
#   --no-build          Skip the build step
#
# Outputs two lines to stdout on success:
#   1. The OCAP URL (pass to setup-away.sh --ocap-url)
#   2. JSON array of listen addresses (pass to setup-away.sh --listen-addrs)

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

CHAIN_ID=11155111
PIMLICO_KEY=""
MNEMONIC=""
INFURA_KEY=""
SKIP_BUILD=false
DELEGATION_MANAGER="0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

usage() {
  cat <<EOF
Usage: $0 --mnemonic "..." --infura-key KEY [--pimlico-key KEY] [--chain-id ID] [--no-build]

Required:
  --mnemonic       12-word seed phrase
  --infura-key     Infura API key

Optional:
  --pimlico-key    Pimlico API key (bundler/paymaster)
  --chain-id       Chain ID (default: $CHAIN_ID)
  --no-build       Skip yarn build
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mnemonic)
      [[ $# -lt 2 ]] && { echo "Error: --mnemonic requires a value" >&2; usage; }
      MNEMONIC="$2"; shift 2 ;;
    --infura-key)
      [[ $# -lt 2 ]] && { echo "Error: --infura-key requires a value" >&2; usage; }
      INFURA_KEY="$2"; shift 2 ;;
    --pimlico-key)
      [[ $# -lt 2 ]] && { echo "Error: --pimlico-key requires a value" >&2; usage; }
      PIMLICO_KEY="$2"; shift 2 ;;
    --chain-id)
      [[ $# -lt 2 ]] && { echo "Error: --chain-id requires a value" >&2; usage; }
      CHAIN_ID="$2"; shift 2 ;;
    --no-build)    SKIP_BUILD=true; shift ;;
    -h|--help)     usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done

if [[ -z "$MNEMONIC" ]]; then
  echo "Error: --mnemonic is required." >&2
  usage
fi

if [[ -z "$INFURA_KEY" ]]; then
  echo "Error: --infura-key is required." >&2
  usage
fi

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------

if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required but not found on PATH." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PKG_ROOT/../.." && pwd)"
BUNDLE_DIR="$PKG_ROOT/src/vats"
OCAP_BIN="$REPO_ROOT/node_modules/.bin/ocap"

if [[ ! -x "$OCAP_BIN" ]]; then
  if command -v ocap &>/dev/null; then
    OCAP_BIN=ocap
  else
    echo "Error: ocap CLI not found. Run 'yarn install' from the repo root." >&2
    exit 1
  fi
fi

RPC_URL="https://sepolia.infura.io/v3/${INFURA_KEY}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

info()  { echo "→ $*" >&2; }
ok()    { echo "  ✓ $*" >&2; }
fail()  { echo "  ✗ $*" >&2; exit 1; }

# Parse the value out of Endo CapData JSON ({"body":"#...","slots":[...]}).
# Simple values only (strings, arrays, objects without slot references).
parse_capdata() {
  node -e "
    const raw = require('fs').readFileSync('/dev/stdin', 'utf8').trim();
    if (!raw) {
      process.stderr.write('parse_capdata: empty input\n');
      process.exit(1);
    }
    let data;
    try { data = JSON.parse(raw); } catch (e) {
      process.stderr.write('parse_capdata: invalid JSON: ' + raw.slice(0, 200) + '\n');
      process.exit(1);
    }
    if (!data.body || typeof data.body !== 'string') {
      process.stderr.write('parse_capdata: missing body field: ' + raw.slice(0, 200) + '\n');
      process.exit(1);
    }
    if (!data.body.startsWith('#')) {
      process.stderr.write('parse_capdata: unexpected body prefix: ' + data.body.slice(0, 200) + '\n');
      process.exit(1);
    }
    if (data.slots && data.slots.length > 0) {
      process.stderr.write('parse_capdata: cannot handle slot references\n');
      process.exit(1);
    }
    let value;
    try { value = JSON.parse(data.body.slice(1)); } catch (e) {
      process.stderr.write('parse_capdata: invalid CapData body: ' + data.body.slice(0, 200) + '\n');
      process.exit(1);
    }
    process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));
  "
}

# Run a daemon exec command and log its output to stderr.
# Usage: daemon_exec <method> <params>
daemon_exec() {
  local result
  result=$($OCAP_BIN daemon exec "$@")
  if [[ -n "$result" ]]; then
    echo "  [daemon exec $1] $result" >&2
  fi
  echo "$result"
}

# ---------------------------------------------------------------------------
# 1. Build
# ---------------------------------------------------------------------------

if [[ "$SKIP_BUILD" == false ]]; then
  info "Building packages..."
  (cd "$REPO_ROOT" && yarn workspace @metamask/ocap-kernel build) >&2
  (cd "$REPO_ROOT" && yarn workspace @ocap/nodejs build) >&2
  (cd "$REPO_ROOT" && yarn workspace @ocap/eth-wallet build) >&2
  ok "Build complete"
else
  info "Skipping build (--no-build)"
  if [[ ! -f "$BUNDLE_DIR/coordinator-vat.bundle" ]]; then
    fail "Bundle files not found in $BUNDLE_DIR. Remove --no-build to build first."
  fi
fi

# ---------------------------------------------------------------------------
# 2. Start daemon
# ---------------------------------------------------------------------------

info "Starting daemon..."
$OCAP_BIN daemon start >&2
ok "Daemon running"

# ---------------------------------------------------------------------------
# 3. Initialize remote comms (QUIC transport)
# ---------------------------------------------------------------------------

info "Initializing remote comms..."
daemon_exec initRemoteComms '{"directListenAddresses":["/ip4/0.0.0.0/udp/0/quic-v1"]}' >/dev/null
ok "Remote comms initialized"

# Wait for remote comms to reach 'connected' state
info "Waiting for remote comms to connect..."
for i in $(seq 1 30); do
  STATUS=$($OCAP_BIN daemon exec getStatus)
  STATE=$(echo "$STATUS" | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    process.stdout.write(data.remoteComms?.state ?? 'none');
  ")
  if [[ "$STATE" == "connected" ]]; then
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    fail "Remote comms did not reach 'connected' state after 30s (current: $STATE)"
  fi
  sleep 1
done
ok "Remote comms connected"

# ---------------------------------------------------------------------------
# 4. Launch wallet subcluster
# ---------------------------------------------------------------------------

info "Launching wallet subcluster..."

ALLOWED_HOSTS='["sepolia.infura.io", "api.pimlico.io"]'

CONFIG=$(cat <<ENDJSON
{
  "config": {
    "bootstrap": "coordinator",
    "forceReset": true,
    "services": ["ocapURLIssuerService", "ocapURLRedemptionService"],
    "vats": {
      "coordinator": {
        "bundleSpec": "$BUNDLE_DIR/coordinator-vat.bundle",
        "globals": ["TextEncoder", "TextDecoder", "Date", "setTimeout"]
      },
      "keyring": {
        "bundleSpec": "$BUNDLE_DIR/keyring-vat.bundle",
        "globals": ["TextEncoder", "TextDecoder"]
      },
      "provider": {
        "bundleSpec": "$BUNDLE_DIR/provider-vat.bundle",
        "globals": ["TextEncoder", "TextDecoder"],
        "platformConfig": { "fetch": { "allowedHosts": $ALLOWED_HOSTS } }
      },
      "delegation": {
        "bundleSpec": "$BUNDLE_DIR/delegation-vat.bundle",
        "globals": ["TextEncoder", "TextDecoder"],
        "parameters": { "delegationManagerAddress": "$DELEGATION_MANAGER" }
      }
    }
  }
}
ENDJSON
)

LAUNCH_RESULT=$($OCAP_BIN daemon exec launchSubcluster "$CONFIG")
ROOT_KREF=$(echo "$LAUNCH_RESULT" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8').trim());
  process.stdout.write(data.rootKref);
")

if [[ -z "$ROOT_KREF" ]]; then
  fail "Failed to extract rootKref from launch result"
fi
ok "Subcluster launched — coordinator: $ROOT_KREF"

# ---------------------------------------------------------------------------
# 5. Initialize keyring
# ---------------------------------------------------------------------------

info "Initializing keyring with SRP..."

INIT_PARAMS=$(KREF="$ROOT_KREF" SRP="$MNEMONIC" node -e "
  const p = JSON.stringify([process.env.KREF, 'initializeKeyring', [{ type: 'srp', mnemonic: process.env.SRP }]]);
  process.stdout.write(p);
")

daemon_exec queueMessage "$INIT_PARAMS" >/dev/null
ok "Keyring initialized"

info "Verifying accounts..."
ACCOUNTS_RAW=$(daemon_exec queueMessage "[\"$ROOT_KREF\", \"getAccounts\", []]")
ACCOUNTS=$(echo "$ACCOUNTS_RAW" | parse_capdata)
ok "Accounts: $ACCOUNTS"

# ---------------------------------------------------------------------------
# 6. Configure provider
# ---------------------------------------------------------------------------

info "Configuring provider (chain $CHAIN_ID)..."

PROVIDER_PARAMS=$(KREF="$ROOT_KREF" CID="$CHAIN_ID" URL="$RPC_URL" node -e "
  const p = JSON.stringify([process.env.KREF, 'configureProvider', [{ chainId: Number(process.env.CID), rpcUrl: process.env.URL }]]);
  process.stdout.write(p);
")

daemon_exec queueMessage "$PROVIDER_PARAMS" >/dev/null
ok "Provider configured — $RPC_URL"

# ---------------------------------------------------------------------------
# 6b. Configure bundler (requires Pimlico key)
# ---------------------------------------------------------------------------

if [[ -n "$PIMLICO_KEY" ]]; then
  BUNDLER_URL="https://api.pimlico.io/v2/${CHAIN_ID}/rpc?apikey=${PIMLICO_KEY}"
  info "Configuring bundler (Pimlico)..."

  BUNDLER_PARAMS=$(KREF="$ROOT_KREF" CID="$CHAIN_ID" BURL="$BUNDLER_URL" node -e "
    const p = JSON.stringify([process.env.KREF, 'configureBundler', [{ bundlerUrl: process.env.BURL, chainId: Number(process.env.CID), usePaymaster: true }]]);
    process.stdout.write(p);
  ")

  daemon_exec queueMessage "$BUNDLER_PARAMS" >/dev/null
  ok "Bundler configured — Pimlico (chain $CHAIN_ID)"
else
  info "Skipping bundler config (no --pimlico-key). UserOp submission will not work."
fi

# ---------------------------------------------------------------------------
# 7. Issue OCAP URL
# ---------------------------------------------------------------------------

info "Issuing OCAP URL for the away device..."
OCAP_URL_RAW=$(daemon_exec queueMessage "[\"$ROOT_KREF\", \"issueOcapUrl\", []]")
OCAP_URL=$(echo "$OCAP_URL_RAW" | parse_capdata)

if [[ -z "$OCAP_URL" || "$OCAP_URL" != ocap:* ]]; then
  fail "Failed to issue OCAP URL"
fi
ok "OCAP URL issued"

# ---------------------------------------------------------------------------
# 8. Extract listen addresses for the away device
# ---------------------------------------------------------------------------

info "Extracting listen addresses..."
STATUS=$($OCAP_BIN daemon exec getStatus)
LISTEN_ADDRS=$(echo "$STATUS" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  const addrs = data.remoteComms?.listenAddresses ?? [];
  process.stdout.write(JSON.stringify(addrs));
")

if [[ "$LISTEN_ADDRS" == "[]" ]]; then
  fail "No listen addresses found. Remote comms may not be fully connected."
fi
ok "Listen addresses: $LISTEN_ADDRS"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

cat >&2 <<EOF

══════════════════════════════════════════════
  Home wallet setup complete!

  Coordinator kref : $ROOT_KREF
  Chain ID         : $CHAIN_ID
  RPC URL          : $RPC_URL
  Accounts         : $ACCOUNTS
  Listen addresses : $LISTEN_ADDRS

  Pass the OCAP URL and listen addresses
  below to setup-away.sh on the away device.
══════════════════════════════════════════════

EOF

echo "$OCAP_URL"
echo "$LISTEN_ADDRS"
