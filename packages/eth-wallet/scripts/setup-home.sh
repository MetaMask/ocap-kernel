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
RELAY_ADDR=""
SKIP_BUILD=false
QUIC_PORT=4002
DELEGATION_MANAGER="0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

usage() {
  cat <<EOF
Usage: $0 --mnemonic "..." --infura-key KEY [--pimlico-key KEY] [--relay MULTIADDR] [--chain-id ID] [--quic-port PORT] [--no-build]

Required:
  --mnemonic       12-word seed phrase
  --infura-key     Infura API key

Optional:
  --pimlico-key    Pimlico API key (bundler/paymaster)
  --relay          Relay multiaddr (e.g. /ip4/HOST/tcp/9002/p2p/PEER_ID)
  --chain-id       Chain ID (default: $CHAIN_ID)
  --quic-port      UDP port for QUIC transport (default: $QUIC_PORT)
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

RPC_URL="https://sepolia.infura.io/v3/${INFURA_KEY}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RESET='\033[0m'

info()  { echo -e "${CYAN}→${RESET} $*" >&2; }
ok()    { echo -e "  ${GREEN}✓${RESET} $*" >&2; }
fail()  { echo -e "  ${RED}✗${RESET} $*" >&2; exit 1; }

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
  result=$(node "$OCAP_BIN" daemon exec "$@")
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

info "Initializing remote comms (QUIC port $QUIC_PORT)..."
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
# 4. Launch wallet subcluster
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

# Strip trailing comma (kernel emits ocap:...@peerId, when no relays are known)
OCAP_URL="${OCAP_URL%,}"

if [[ -z "$OCAP_URL" || "$OCAP_URL" != ocap:* ]]; then
  fail "Failed to issue OCAP URL"
fi
ok "OCAP URL issued"

# ---------------------------------------------------------------------------
# 8. Extract listen addresses for the away device
# ---------------------------------------------------------------------------

info "Extracting listen addresses..."
STATUS=$(node "$OCAP_BIN" daemon exec getStatus)
LISTEN_ADDRS=$(echo "$STATUS" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  const addrs = data.remoteComms?.listenAddresses ?? [];
  process.stdout.write(JSON.stringify(addrs));
")

if [[ "$LISTEN_ADDRS" == "[]" ]]; then
  fail "No listen addresses found. Remote comms may not be fully connected."
fi

# Detect public IP and add a public multiaddr so remote peers can connect.
PEER_ID=$(echo "$LISTEN_ADDRS" | node -e "
  const addrs = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  const match = addrs.find(a => a.includes('/p2p/'));
  if (match) process.stdout.write(match.split('/p2p/').pop());
")

PUBLIC_IP=$(curl -s -4 --max-time 5 https://ifconfig.me || true)
if [[ -n "$PUBLIC_IP" && -n "$PEER_ID" ]]; then
  PUBLIC_ADDR="/ip4/${PUBLIC_IP}/udp/${QUIC_PORT}/quic-v1/p2p/${PEER_ID}"
  LISTEN_ADDRS=$(echo "$LISTEN_ADDRS" | node -e "
    const addrs = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    addrs.unshift('${PUBLIC_ADDR}');
    process.stdout.write(JSON.stringify(addrs));
  ")
  ok "Public address: $PUBLIC_ADDR"
fi
ok "Listen addresses: $LISTEN_ADDRS"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

cat >&2 <<EOF

$(echo -e "${GREEN}${BOLD}")══════════════════════════════════════════════
  Home wallet setup complete!
══════════════════════════════════════════════$(echo -e "${RESET}")

  $(echo -e "${DIM}")Coordinator kref :$(echo -e "${RESET}") $ROOT_KREF
  $(echo -e "${DIM}")Chain ID         :$(echo -e "${RESET}") $CHAIN_ID
  $(echo -e "${DIM}")RPC URL          :$(echo -e "${RESET}") $RPC_URL
  $(echo -e "${DIM}")Accounts         :$(echo -e "${RESET}") $ACCOUNTS

$(echo -e "${YELLOW}${BOLD}")  Copy these values to setup-away.sh on the away device:$(echo -e "${RESET}")

  $(echo -e "${DIM}")--ocap-url$(echo -e "${RESET}")
  $(echo -e "${BOLD}")$OCAP_URL$(echo -e "${RESET}")

  $(echo -e "${DIM}")--listen-addrs$(echo -e "${RESET}")
  $(echo -e "${BOLD}")'$LISTEN_ADDRS'$(echo -e "${RESET}")

  $(echo -e "${DIM}")tail -f ~/.ocap/daemon.log$(echo -e "${RESET}")       watch daemon logs
  $(echo -e "${DIM}")node $OCAP_BIN daemon stop$(echo -e "${RESET}")  stop the daemon

EOF

echo "$OCAP_URL"
echo "$LISTEN_ADDRS"
