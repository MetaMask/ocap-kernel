#!/usr/bin/env bash
# Setup script for the AWAY wallet device (VPS / agent machine).
#
# Starts the daemon, launches the wallet subcluster, initialises a throwaway
# keyring, connects to the home wallet via the provided OCAP URL, and verifies
# the peer connection.
#
# Usage:
#   ./setup-away.sh --ocap-url "ocap:..." --listen-addrs '["/ip4/..."]' [options]
#
# Required:
#   --ocap-url      The OCAP URL issued by the home device (from setup-home.sh)
#   --listen-addrs  JSON array of home device listen addresses (from setup-home.sh)
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
LISTEN_ADDRS=""
RELAY_ADDR=""
SKIP_BUILD=false
QUIC_PORT=4002
DELEGATION_MANAGER="0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

usage() {
  cat <<EOF
Usage: $0 --ocap-url "ocap:..." --listen-addrs '["/ip4/..."]' [--infura-key KEY] [--pimlico-key KEY] [--chain-id ID] [--quic-port PORT] [--no-build]

Required:
  --ocap-url       OCAP URL from the home device (output of setup-home.sh)
  --listen-addrs   JSON array of home device listen addresses (output of setup-home.sh)

Optional:
  --infura-key     Infura API key (for direct chain queries)
  --pimlico-key    Pimlico API key (bundler/paymaster)
  --relay          Relay multiaddr (e.g. /ip4/HOST/tcp/9001/ws/p2p/PEER_ID)
  --chain-id       Chain ID (default: $CHAIN_ID)
  --quic-port      UDP port for QUIC transport (default: $QUIC_PORT)
  --no-build       Skip yarn build
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ocap-url)
      [[ $# -lt 2 ]] && { echo "Error: --ocap-url requires a value" >&2; usage; }
      OCAP_URL="$2"; shift 2 ;;
    --listen-addrs)
      [[ $# -lt 2 ]] && { echo "Error: --listen-addrs requires a value" >&2; usage; }
      LISTEN_ADDRS="$2"; shift 2 ;;
    --infura-key)
      [[ $# -lt 2 ]] && { echo "Error: --infura-key requires a value" >&2; usage; }
      INFURA_KEY="$2"; shift 2 ;;
    --pimlico-key)
      [[ $# -lt 2 ]] && { echo "Error: --pimlico-key requires a value" >&2; usage; }
      PIMLICO_KEY="$2"; shift 2 ;;
    --chain-id)
      [[ $# -lt 2 ]] && { echo "Error: --chain-id requires a value" >&2; usage; }
      CHAIN_ID="$2"; shift 2 ;;
    --relay)
      [[ $# -lt 2 ]] && { echo "Error: --relay requires a value" >&2; usage; }
      RELAY_ADDR="$2"; shift 2 ;;
    --quic-port)
      [[ $# -lt 2 ]] && { echo "Error: --quic-port requires a value" >&2; usage; }
      QUIC_PORT="$2"; shift 2 ;;
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

if [[ -z "$LISTEN_ADDRS" ]]; then
  echo "Error: --listen-addrs is required." >&2
  usage
fi

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------

if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required but not found on PATH." >&2
  exit 1
fi

if ! command -v yarn &>/dev/null; then
  echo "Error: yarn is required but not found on PATH. Run: npm install -g yarn" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PKG_ROOT/../.." && pwd)"
BUNDLE_DIR="$PKG_ROOT/src/vats"
OCAP_BIN="$REPO_ROOT/packages/cli/dist/app.mjs"

if [[ ! -f "$OCAP_BIN" ]]; then
  echo "Error: ocap CLI not found at $OCAP_BIN. Run 'yarn workspace @ocap/cli build' first." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

info()  { echo -e "${CYAN}→${RESET} $*" >&2; }
ok()    { echo -e "  ${GREEN}✓${RESET} $*" >&2; }
fail()  { echo -e "  ${RED}✗${RESET} $*" >&2; exit 1; }

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
# Usage: daemon_exec [--quiet] <method> <params> [--timeout <seconds>]
# Pass --quiet to suppress the stderr log line (for sensitive params).
daemon_exec() {
  local quiet=false
  if [[ "${1:-}" == "--quiet" ]]; then
    quiet=true
    shift
  fi
  local result
  result=$(node "$OCAP_BIN" daemon exec "$@")
  if [[ -n "$result" && "$quiet" == false ]]; then
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
  (cd "$REPO_ROOT" && yarn workspace @ocap/cli build) >&2
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
node "$OCAP_BIN" daemon start >&2
ok "Daemon running"

# ---------------------------------------------------------------------------
# 3. Initialize remote comms (QUIC transport)
# ---------------------------------------------------------------------------

if [[ -n "$RELAY_ADDR" ]]; then
  info "Initializing remote comms (QUIC port $QUIC_PORT + relay)..."
else
  info "Initializing remote comms (QUIC port $QUIC_PORT)..."
fi
COMMS_PARAMS="{\"directListenAddresses\":[\"/ip4/0.0.0.0/udp/${QUIC_PORT}/quic-v1\"]"
if [[ -n "$RELAY_ADDR" ]]; then
  COMMS_PARAMS="${COMMS_PARAMS},\"relays\":[\"${RELAY_ADDR}\"]"
fi
COMMS_PARAMS="${COMMS_PARAMS}}"
daemon_exec initRemoteComms "$COMMS_PARAMS" >/dev/null
ok "Remote comms initialized"

# Wait for remote comms to reach 'connected' state
info "Waiting for remote comms to connect..."
for i in $(seq 1 30); do
  STATUS=$(node "$OCAP_BIN" daemon exec getStatus 2>/dev/null) || STATUS=""
  if [[ -z "$STATUS" ]]; then
    sleep 1
    continue
  fi
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
# 4. Register home device location hints
# ---------------------------------------------------------------------------

info "Registering home device location hints..."

# OCAP URL format: ocap:<oid>@<peerId>,<hint1>,<hint2>,...
HOME_PEER_ID=$(echo "$OCAP_URL" | node -e "
  const url = require('fs').readFileSync('/dev/stdin', 'utf8').trim();
  const withoutScheme = url.replace(/^ocap:/, '');
  const afterAt = withoutScheme.split('@')[1];
  if (!afterAt) {
    process.stderr.write('Failed to parse OCAP URL: no @ separator found in: ' + url.slice(0, 100) + '\n');
    process.exit(1);
  }
  const peerId = afterAt.split(',')[0];
  if (!peerId) {
    process.stderr.write('Failed to parse OCAP URL: no peer ID found after @ in: ' + url.slice(0, 100) + '\n');
    process.exit(1);
  }
  process.stdout.write(peerId);
")

if [[ -z "$HOME_PEER_ID" ]]; then
  fail "Failed to extract peer ID from OCAP URL"
fi

HINTS_PARAMS=$(PEER="$HOME_PEER_ID" ADDRS="$LISTEN_ADDRS" node -e "
  const p = JSON.stringify({ peerId: process.env.PEER, hints: JSON.parse(process.env.ADDRS) });
  process.stdout.write(p);
")

daemon_exec registerLocationHints "$HINTS_PARAMS" >/dev/null
ok "Location hints registered for peer $HOME_PEER_ID"

# ---------------------------------------------------------------------------
# 5. Launch wallet subcluster
# ---------------------------------------------------------------------------

info "Launching wallet subcluster..."

CONFIG=$(BUNDLE_DIR="$BUNDLE_DIR" DM="$DELEGATION_MANAGER" node -e "
  const bd = process.env.BUNDLE_DIR;
  const dm = process.env.DM;
  const config = {
    config: {
      bootstrap: 'coordinator',
      forceReset: true,
      services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
      vats: {
        coordinator: {
          bundleSpec: bd + '/coordinator-vat.bundle',
          globals: ['TextEncoder', 'TextDecoder', 'Date', 'setTimeout']
        },
        keyring: {
          bundleSpec: bd + '/keyring-vat.bundle',
          globals: ['TextEncoder', 'TextDecoder']
        },
        provider: {
          bundleSpec: bd + '/provider-vat.bundle',
          globals: ['TextEncoder', 'TextDecoder'],
          platformConfig: { fetch: { allowedHosts: ['sepolia.infura.io', 'api.pimlico.io'] } }
        },
        delegation: {
          bundleSpec: bd + '/delegation-vat.bundle',
          globals: ['TextEncoder', 'TextDecoder'],
          parameters: { delegationManagerAddress: dm }
        }
      }
    }
  };
  process.stdout.write(JSON.stringify(config));
")

LAUNCH_RESULT=$(node "$OCAP_BIN" daemon exec launchSubcluster "$CONFIG")
ROOT_KREF=$(echo "$LAUNCH_RESULT" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8').trim());
  process.stdout.write(data.rootKref);
")

if [[ -z "$ROOT_KREF" ]]; then
  fail "Failed to extract rootKref from launch result"
fi
ok "Subcluster launched — coordinator: $ROOT_KREF"

# ---------------------------------------------------------------------------
# 6. Initialize keyring (throwaway)
# ---------------------------------------------------------------------------

info "Initializing throwaway keyring..."
# Generate 32 bytes of entropy outside the SES compartment (crypto.getRandomValues
# is unavailable inside vats). The entropy is passed to the keyring vat which uses
# it as the private key for the throwaway account.
ENTROPY="0x$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
daemon_exec --quiet queueMessage "[\"$ROOT_KREF\", \"initializeKeyring\", [{\"type\":\"throwaway\",\"entropy\":\"$ENTROPY\"}]]" >/dev/null
ok "Throwaway keyring initialized"

info "Verifying accounts..."
ACCOUNTS_RAW=$(daemon_exec queueMessage "[\"$ROOT_KREF\", \"getAccounts\", []]")
ACCOUNTS=$(echo "$ACCOUNTS_RAW" | parse_capdata)
ok "Local throwaway account: $ACCOUNTS"

# ---------------------------------------------------------------------------
# 7. Configure provider (optional — only if Infura key provided)
# ---------------------------------------------------------------------------

if [[ -n "$INFURA_KEY" ]]; then
  RPC_URL="https://sepolia.infura.io/v3/${INFURA_KEY}"
  info "Configuring provider (chain $CHAIN_ID)..."

  PROVIDER_PARAMS=$(KREF="$ROOT_KREF" CID="$CHAIN_ID" URL="$RPC_URL" node -e "
    const p = JSON.stringify([process.env.KREF, 'configureProvider', [{ chainId: Number(process.env.CID), rpcUrl: process.env.URL }]]);
    process.stdout.write(p);
  ")

  daemon_exec queueMessage "$PROVIDER_PARAMS" >/dev/null
  ok "Provider configured — $RPC_URL"
fi

# ---------------------------------------------------------------------------
# 7b. Configure bundler (requires Pimlico key)
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

  # NOTE: The away device does NOT create a smart account. The throwaway
  # EOA has no ETH to pay for an on-chain EIP-7702 authorization tx.
  # Instead, the throwaway address is used directly as the delegation
  # delegate, and delegations are redeemed via paymaster-sponsored UserOps.
else
  info "Skipping bundler config (no --pimlico-key). UserOp submission will not work."
fi

# ---------------------------------------------------------------------------
# 8. Connect to home wallet
# ---------------------------------------------------------------------------

info "Connecting to home wallet..."

CONNECT_PARAMS=$(KREF="$ROOT_KREF" PEER_URL="$OCAP_URL" node -e "
  const p = JSON.stringify([process.env.KREF, 'connectToPeer', [process.env.PEER_URL]]);
  process.stdout.write(p);
")

daemon_exec queueMessage "$CONNECT_PARAMS" --timeout 120 >/dev/null

# ---------------------------------------------------------------------------
# 9. Wait for peer wallet connection
# ---------------------------------------------------------------------------

info "Waiting for peer wallet connection (up to 60s)..."
for i in $(seq 1 60); do
  CAPS_RAW=$(daemon_exec --quiet queueMessage "[\"$ROOT_KREF\", \"getCapabilities\", []]" 2>/dev/null) || CAPS_RAW=""
  if [[ -n "$CAPS_RAW" ]]; then
    HAS_PEER=$(echo "$CAPS_RAW" | node -e "
      try {
        const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8').trim());
        const v = JSON.parse(d.body.slice(1));
        process.stdout.write(String(v.hasPeerWallet));
      } catch { process.stdout.write('false'); }
    " 2>/dev/null || echo "false")
    if [[ "$HAS_PEER" == "true" ]]; then
      break
    fi
  fi
  if [[ "$i" -eq 60 ]]; then
    fail "Peer wallet not connected after 60s"
  fi
  sleep 1
done
ok "Peer wallet connected and verified"

# ---------------------------------------------------------------------------
# 10. Delegate authority (interactive)
# ---------------------------------------------------------------------------

# The delegate address is the throwaway EOA
DELEGATE_ADDR=$(echo "$ACCOUNTS" | node -e "
  const arr = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  process.stdout.write(arr[0]);
")

cat >&2 <<EOF

$(echo -e "${GREEN}${BOLD}")══════════════════════════════════════════════
  Away wallet ready — delegation needed
══════════════════════════════════════════════$(echo -e "${RESET}")

  $(echo -e "${DIM}")Coordinator kref :$(echo -e "${RESET}") $ROOT_KREF
  $(echo -e "${DIM}")Chain ID         :$(echo -e "${RESET}") $CHAIN_ID
  $(echo -e "${DIM}")Delegate address :$(echo -e "${RESET}") $DELEGATE_ADDR
  $(echo -e "${DIM}")Peer connected   :$(echo -e "${RESET}") $(echo -e "${GREEN}")true$(echo -e "${RESET}")

$(echo -e "${YELLOW}${BOLD}")  Paste this delegate address into the HOME device script:$(echo -e "${RESET}")

$(echo -e "${BOLD}")  $DELEGATE_ADDR$(echo -e "${RESET}")

  $(echo -e "${DIM}")The home script will create the delegation and show the JSON to paste back here.$(echo -e "${RESET}")

EOF

echo -e "${CYAN}→${RESET} Paste the delegation JSON from the home device (press Ctrl+D when done):" >&2
DELEGATION_JSON=$(cat)

if [[ -z "$DELEGATION_JSON" ]]; then
  fail "No delegation JSON provided"
fi

# Extract the inner delegation object from CapData if needed
DELEGATION_INNER=$(echo "$DELEGATION_JSON" | node -e "
  const raw = require('fs').readFileSync('/dev/stdin', 'utf8').trim();
  let data;
  try { data = JSON.parse(raw); } catch {
    process.stderr.write('Invalid JSON\n');
    process.exit(1);
  }
  // If it's CapData, unwrap it
  if (data.body && typeof data.body === 'string' && data.body.startsWith('#')) {
    try {
      const inner = JSON.parse(data.body.slice(1));
      process.stdout.write(JSON.stringify(inner));
    } catch {
      process.stderr.write('Failed to parse CapData body\n');
      process.exit(1);
    }
  } else {
    // Already a plain delegation object
    process.stdout.write(JSON.stringify(data));
  }
")

info "Receiving delegation..."
RECEIVE_PARAMS=$(KREF="$ROOT_KREF" DEL="$DELEGATION_INNER" node -e "
  const p = JSON.stringify([process.env.KREF, 'receiveDelegation', [JSON.parse(process.env.DEL)]]);
  process.stdout.write(p);
")
daemon_exec queueMessage "$RECEIVE_PARAMS" >/dev/null
ok "Delegation received"

# Verify
CAPS_FINAL_RAW=$(daemon_exec --quiet queueMessage "[\"$ROOT_KREF\", \"getCapabilities\", []]" 2>/dev/null) || CAPS_FINAL_RAW=""
DEL_COUNT=$(echo "$CAPS_FINAL_RAW" | node -e "
  try {
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8').trim());
    const v = JSON.parse(d.body.slice(1));
    process.stdout.write(String(v.delegationCount));
  } catch { process.stdout.write('0'); }
" 2>/dev/null || echo "0")
ok "Delegation count: $DEL_COUNT"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

cat >&2 <<EOF

$(echo -e "${GREEN}${BOLD}")══════════════════════════════════════════════
  Away wallet setup complete!
══════════════════════════════════════════════$(echo -e "${RESET}")

  $(echo -e "${DIM}")Coordinator kref :$(echo -e "${RESET}") $ROOT_KREF
  $(echo -e "${DIM}")Delegate address :$(echo -e "${RESET}") $DELEGATE_ADDR
  $(echo -e "${DIM}")Delegations      :$(echo -e "${RESET}") $DEL_COUNT
  $(echo -e "${DIM}")Peer connected   :$(echo -e "${RESET}") $(echo -e "${GREEN}")true$(echo -e "${RESET}")

  The wallet is ready. To install the OpenClaw plugin:

  $(echo -e "${DIM}")cd $REPO_ROOT
  openclaw plugins install -l ./packages/eth-wallet/openclaw-plugin
  openclaw plugins enable wallet
  openclaw config set tools.allow '["wallet"]'
  openclaw gateway restart
  openclaw plugins list$(echo -e "${RESET}")

  Watch daemon logs: $(echo -e "${DIM}")tail -f ~/.ocap/daemon.log$(echo -e "${RESET}")
  Stop the daemon:   $(echo -e "${DIM}")yarn ocap daemon stop$(echo -e "${RESET}")

EOF
