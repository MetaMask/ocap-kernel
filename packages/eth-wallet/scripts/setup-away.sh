#!/usr/bin/env bash
# Setup script for the AWAY wallet device (VPS / agent machine).
#
# Starts the daemon, launches the wallet subcluster, initialises a throwaway
# keyring, connects to the home wallet via the provided OCAP URL, and verifies
# the peer connection.
#
# Usage:
#   ./setup-away.sh --ocap-url "ocap:..." [options]
#
# Required:
#   --ocap-url    The OCAP URL issued by the home device (from setup-home.sh)
#
# Optional:
#   --infura-key  KEY   Infura API key (for direct chain queries)
#   --pimlico-key KEY   Pimlico API key (for bundler / paymaster)
#   --chain-id    ID    Chain ID (default: 11155111 = Sepolia)
#   --no-build          Skip the build step

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

CHAIN_ID=11155111
PIMLICO_KEY=""
OCAP_URL=""
INFURA_KEY=""
SKIP_BUILD=false
DELEGATION_MANAGER="0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

usage() {
  cat <<EOF
Usage: $0 --ocap-url "ocap:..." [--infura-key KEY] [--pimlico-key KEY] [--chain-id ID] [--no-build]

Required:
  --ocap-url       OCAP URL from the home device (output of setup-home.sh)

Optional:
  --infura-key     Infura API key (for direct chain queries)
  --pimlico-key    Pimlico API key (bundler/paymaster)
  --chain-id       Chain ID (default: $CHAIN_ID)
  --no-build       Skip yarn build
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ocap-url)    OCAP_URL="$2"; shift 2 ;;
    --infura-key)  INFURA_KEY="$2"; shift 2 ;;
    --pimlico-key) PIMLICO_KEY="$2"; shift 2 ;;
    --chain-id)    CHAIN_ID="$2"; shift 2 ;;
    --no-build)    SKIP_BUILD=true; shift ;;
    -h|--help)     usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done

if [[ -z "$OCAP_URL" ]]; then
  echo "Error: --ocap-url is required." >&2
  usage
fi

if [[ "$OCAP_URL" != ocap:* ]]; then
  echo "Error: OCAP URL must start with 'ocap:'." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUNDLE_DIR="$SCRIPT_DIR/src/vats"
OCAP_BIN="$REPO_ROOT/node_modules/.bin/ocap"

if [[ ! -x "$OCAP_BIN" ]]; then
  if command -v ocap &>/dev/null; then
    OCAP_BIN=ocap
  else
    echo "Error: ocap CLI not found. Run 'yarn install' from the repo root." >&2
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

info()  { echo "→ $*" >&2; }
ok()    { echo "  ✓ $*" >&2; }
fail()  { echo "  ✗ $*" >&2; exit 1; }

parse_capdata() {
  node -e "
    const raw = require('fs').readFileSync('/dev/stdin', 'utf8').trim();
    const data = JSON.parse(raw);
    const value = JSON.parse(data.body.slice(1));
    process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));
  "
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
# 3. Launch wallet subcluster
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
        "globals": ["TextEncoder", "TextDecoder", "Date"]
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
# 4. Initialize keyring (throwaway)
# ---------------------------------------------------------------------------

info "Initializing throwaway keyring..."
$OCAP_BIN daemon exec queueMessage "[\"$ROOT_KREF\", \"initializeKeyring\", [{\"type\":\"throwaway\"}]]" >/dev/null
ok "Throwaway keyring initialized"

info "Verifying accounts..."
ACCOUNTS_RAW=$($OCAP_BIN daemon exec queueMessage "[\"$ROOT_KREF\", \"getAccounts\", []]")
ACCOUNTS=$(echo "$ACCOUNTS_RAW" | parse_capdata)
ok "Local throwaway account: $ACCOUNTS"

# ---------------------------------------------------------------------------
# 5. Configure provider (optional — only if Infura key provided)
# ---------------------------------------------------------------------------

if [[ -n "$INFURA_KEY" ]]; then
  RPC_URL="https://sepolia.infura.io/v3/${INFURA_KEY}"
  info "Configuring provider (chain $CHAIN_ID)..."

  PROVIDER_PARAMS=$(KREF="$ROOT_KREF" CID="$CHAIN_ID" URL="$RPC_URL" node -e "
    const p = JSON.stringify([process.env.KREF, 'configureProvider', [{ chainId: Number(process.env.CID), rpcUrl: process.env.URL }]]);
    process.stdout.write(p);
  ")

  $OCAP_BIN daemon exec queueMessage "$PROVIDER_PARAMS" >/dev/null
  ok "Provider configured — $RPC_URL"
fi

# ---------------------------------------------------------------------------
# 6. Connect to home wallet
# ---------------------------------------------------------------------------

info "Connecting to home wallet..."

CONNECT_PARAMS=$(KREF="$ROOT_KREF" PEER_URL="$OCAP_URL" node -e "
  const p = JSON.stringify([process.env.KREF, 'connectToPeer', [process.env.PEER_URL]]);
  process.stdout.write(p);
")

$OCAP_BIN daemon exec queueMessage "$CONNECT_PARAMS" >/dev/null
ok "Connected to home wallet"

# ---------------------------------------------------------------------------
# 7. Verify connection
# ---------------------------------------------------------------------------

info "Verifying capabilities..."
CAPS_RAW=$($OCAP_BIN daemon exec queueMessage "[\"$ROOT_KREF\", \"getCapabilities\", []]")
CAPS=$(echo "$CAPS_RAW" | parse_capdata)

HAS_PEER=$(echo "$CAPS" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  process.stdout.write(String(data.hasPeerWallet));
")

if [[ "$HAS_PEER" != "true" ]]; then
  fail "Peer connection verification failed (hasPeerWallet=$HAS_PEER)"
fi
ok "Peer wallet connected and verified"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

cat >&2 <<EOF

══════════════════════════════════════════════
  Away wallet setup complete!

  Coordinator kref : $ROOT_KREF
  Chain ID         : $CHAIN_ID
  Local account    : $ACCOUNTS
  Peer connected   : true

  The away wallet can now forward signing
  requests to the home wallet via CapTP.
══════════════════════════════════════════════

EOF
