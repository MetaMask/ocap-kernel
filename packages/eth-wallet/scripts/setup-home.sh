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
# Outputs the OCAP URL to stdout on success. Pass it to setup-away.sh.

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
    --mnemonic)    MNEMONIC="$2"; shift 2 ;;
    --infura-key)  INFURA_KEY="$2"; shift 2 ;;
    --pimlico-key) PIMLICO_KEY="$2"; shift 2 ;;
    --chain-id)    CHAIN_ID="$2"; shift 2 ;;
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
# 4. Initialize keyring
# ---------------------------------------------------------------------------

info "Initializing keyring with SRP..."

INIT_PARAMS=$(KREF="$ROOT_KREF" SRP="$MNEMONIC" node -e "
  const p = JSON.stringify([process.env.KREF, 'initializeKeyring', [{ type: 'srp', mnemonic: process.env.SRP }]]);
  process.stdout.write(p);
")

$OCAP_BIN daemon exec queueMessage "$INIT_PARAMS" >/dev/null
ok "Keyring initialized"

info "Verifying accounts..."
ACCOUNTS_RAW=$($OCAP_BIN daemon exec queueMessage "[\"$ROOT_KREF\", \"getAccounts\", []]")
ACCOUNTS=$(echo "$ACCOUNTS_RAW" | parse_capdata)
ok "Accounts: $ACCOUNTS"

# ---------------------------------------------------------------------------
# 5. Configure provider
# ---------------------------------------------------------------------------

info "Configuring provider (chain $CHAIN_ID)..."

PROVIDER_PARAMS=$(KREF="$ROOT_KREF" CID="$CHAIN_ID" URL="$RPC_URL" node -e "
  const p = JSON.stringify([process.env.KREF, 'configureProvider', [{ chainId: Number(process.env.CID), rpcUrl: process.env.URL }]]);
  process.stdout.write(p);
")

$OCAP_BIN daemon exec queueMessage "$PROVIDER_PARAMS" >/dev/null
ok "Provider configured — $RPC_URL"

# ---------------------------------------------------------------------------
# 6. Issue OCAP URL
# ---------------------------------------------------------------------------

info "Issuing OCAP URL for the away device..."
OCAP_URL_RAW=$($OCAP_BIN daemon exec queueMessage "[\"$ROOT_KREF\", \"issueOcapUrl\", []]")
OCAP_URL=$(echo "$OCAP_URL_RAW" | parse_capdata)

if [[ -z "$OCAP_URL" || "$OCAP_URL" != ocap:* ]]; then
  fail "Failed to issue OCAP URL"
fi
ok "OCAP URL issued"

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

  Pass the OCAP URL below to setup-away.sh
  on the away device.
══════════════════════════════════════════════

EOF

echo "$OCAP_URL"
