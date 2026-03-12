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
KEYRING_PASSWORD=""

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

usage() {
  cat <<EOF
Usage: $0 --mnemonic "..." --infura-key KEY [--pimlico-key KEY] [--relay MULTIADDR] [--chain-id ID] [--quic-port PORT] [--password PW] [--no-build]

Required:
  --mnemonic       12-word seed phrase
  --infura-key     Infura API key

Optional:
  --pimlico-key    Pimlico API key (bundler/paymaster)
  --relay          Relay multiaddr (e.g. /ip4/HOST/tcp/9001/ws/p2p/PEER_ID)
  --chain-id       Chain ID (default: $CHAIN_ID)
  --quic-port      UDP port for QUIC transport (default: $QUIC_PORT)
  --password       Password to encrypt the mnemonic at rest
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
    --password)
      [[ $# -lt 2 ]] && { echo "Error: --password requires a value" >&2; usage; }
      KEYRING_PASSWORD="$2"; shift 2 ;;
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
# Usage: daemon_exec [--quiet] <method> <params>
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
# 3. Initialize remote comms (libp2p)
# ---------------------------------------------------------------------------

if [[ -n "$RELAY_ADDR" ]]; then
  info "Initializing remote comms (relay: ${RELAY_ADDR})..."
else
  info "Initializing remote comms (direct QUIC on port $QUIC_PORT)..."
fi
COMMS_PARAMS="{\"directListenAddresses\":[\"/ip4/0.0.0.0/udp/${QUIC_PORT}/quic-v1\"]"
if [[ -n "$RELAY_ADDR" ]]; then
  COMMS_PARAMS="${COMMS_PARAMS},\"relays\":[\"${RELAY_ADDR}\"]"
  # Extract the relay host (IP or hostname) for the ws:// allowlist.
  # Plain ws:// to public IPs is denied by default; allowedWsHosts permits it.
  RELAY_HOST=$(echo "$RELAY_ADDR" | node -e "
    const addr = require('fs').readFileSync('/dev/stdin','utf8').trim();
    const m = addr.match(/\\/(?:ip4|ip6|dns4|dns6)\\/([^\\/]+)/);
    if (m) process.stdout.write(m[1]);
  ")
  if [[ -n "$RELAY_HOST" ]]; then
    COMMS_PARAMS="${COMMS_PARAMS},\"allowedWsHosts\":[\"${RELAY_HOST}\"]"
  fi
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

# If a relay is configured, verify the relay reservation is actually active
# by waiting for circuit relay addresses to appear in getMultiaddrs().
if [[ -n "$RELAY_ADDR" ]]; then
  info "Verifying relay reservation..."
  RELAY_OK=false
  for i in $(seq 1 30); do
    STATUS=$(node "$OCAP_BIN" daemon exec getStatus 2>/dev/null) || STATUS=""
    if [[ -n "$STATUS" ]]; then
      HAS_CIRCUIT=$(echo "$STATUS" | node -e "
        const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
        const addrs = data.remoteComms?.listenAddresses ?? [];
        process.stdout.write(String(addrs.some(a => a.includes('/p2p-circuit/'))));
      ")
      if [[ "$HAS_CIRCUIT" == "true" ]]; then
        RELAY_OK=true
        break
      fi
    fi
    sleep 1
  done
  if [[ "$RELAY_OK" == "true" ]]; then
    ok "Relay reservation active"
  else
    fail "Relay reservation not established after 30s. Is the relay running? Check: ssh VPS 'sudo systemctl status ocap-relay.service'"
  fi
fi

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
          platformConfig: { fetch: { allowedHosts: ['sepolia.infura.io', 'api.pimlico.io', 'swap.api.cx.metamask.io'] } }
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

if [[ -n "$KEYRING_PASSWORD" ]]; then
  info "Initializing keyring with SRP (encrypted)..."
else
  info "Initializing keyring with SRP..."
fi

INIT_PARAMS=$(KREF="$ROOT_KREF" SRP="$MNEMONIC" PW="$KEYRING_PASSWORD" node -e "
  const opts = { type: 'srp', mnemonic: process.env.SRP };
  if (process.env.PW) {
    opts.password = process.env.PW;
    opts.salt = require('crypto').randomBytes(16).toString('hex');
  }
  const p = JSON.stringify([process.env.KREF, 'initializeKeyring', [opts]]);
  process.stdout.write(p);
")

daemon_exec --quiet queueMessage "$INIT_PARAMS" >/dev/null
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

  # Promote the EOA to a smart account via EIP-7702 authorization.
  # The EOA's address stays the same — no separate contract, no funding needed.
  info "Setting up smart account (EIP-7702 stateless)..."
  SA_PARAMS=$(KREF="$ROOT_KREF" CID="$CHAIN_ID" node -e "
    const p = JSON.stringify([process.env.KREF, 'createSmartAccount', [{ chainId: Number(process.env.CID), implementation: 'stateless7702' }]]);
    process.stdout.write(p);
  ")
  SA_RAW=$(daemon_exec queueMessage "$SA_PARAMS" --timeout 60)
  HOME_SMART_ACCOUNT=$(echo "$SA_RAW" | parse_capdata | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    process.stdout.write(d.address || '');
  " 2>/dev/null || echo "")

  if [[ -z "$HOME_SMART_ACCOUNT" ]]; then
    fail "Failed to create smart account"
  fi
  ok "Smart account: $HOME_SMART_ACCOUNT (EIP-7702, same as EOA)"
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
  LISTEN_ADDRS=$(PUBLIC_ADDR="$PUBLIC_ADDR" node -e "
    const addrs = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    addrs.unshift(process.env.PUBLIC_ADDR);
    process.stdout.write(JSON.stringify(addrs));
  " <<< "$LISTEN_ADDRS")
  ok "Public address: $PUBLIC_ADDR"
fi

# Ensure relay circuit addresses are included even if the relay reservation
# hasn't been established yet (getMultiaddrs() only reports them after the
# async reservation completes). These are essential for the away device to
# reach this node through the relay.
if [[ -n "$RELAY_ADDR" && -n "$PEER_ID" ]]; then
  LISTEN_ADDRS=$(RELAY="$RELAY_ADDR" PID="$PEER_ID" node -e "
    const addrs = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    const relay = process.env.RELAY;
    const peerId = process.env.PID;
    const circuitWebrtc = relay + '/p2p-circuit/webrtc/p2p/' + peerId;
    const circuitDirect = relay + '/p2p-circuit/p2p/' + peerId;
    if (!addrs.includes(circuitWebrtc)) addrs.push(circuitWebrtc);
    if (!addrs.includes(circuitDirect)) addrs.push(circuitDirect);
    process.stdout.write(JSON.stringify(addrs));
  " <<< "$LISTEN_ADDRS")
  ok "Relay circuit addresses added"
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

$(echo -e "${YELLOW}${BOLD}")  Run this on the away device (VPS):$(echo -e "${RESET}")

$(echo -e "${BOLD}")  ./packages/eth-wallet/scripts/setup-away.sh \\
    --ocap-url "$OCAP_URL" \\
    --listen-addrs '$LISTEN_ADDRS'$(
      [[ -n "$INFURA_KEY" ]] && echo " \\
    --infura-key $INFURA_KEY"
    )$(
      [[ -n "$PIMLICO_KEY" ]] && echo " \\
    --pimlico-key $PIMLICO_KEY"
    )$(
      [[ -n "$RELAY_ADDR" ]] && echo " \\
    --relay \"$RELAY_ADDR\""
    )$(echo -e "${RESET}")

EOF

# ---------------------------------------------------------------------------
# 9. Create delegation (interactive — waits for away device delegate address)
# ---------------------------------------------------------------------------

# Poll for the delegate address from the away device (sent over libp2p/CapTP).
# The away device calls sendDelegateAddressToPeer after connecting.
DELEGATE_ADDR=""
info "Waiting for delegate address from away device (up to 10 min)..."
echo -e "  ${DIM}Run setup-away.sh on the away device now if you haven't already.${RESET}" >&2
echo -e "  ${DIM}Or paste the delegate address here to skip waiting.${RESET}" >&2

POLL_FAILURES=0
for i in $(seq 1 300); do
  DELEGATE_RAW=$(daemon_exec --quiet queueMessage "[\"$ROOT_KREF\", \"getDelegateAddress\", []]" 2>/dev/null) || DELEGATE_RAW=""
  if [[ -n "$DELEGATE_RAW" ]]; then
    POLL_FAILURES=0
    DELEGATE_ADDR=$(echo "$DELEGATE_RAW" | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8').trim());
      if (!d.body || !d.body.startsWith('#')) { process.exit(0); }
      const v = JSON.parse(d.body.slice(1));
      if (v && typeof v === 'string' && /^0x[\da-fA-F]{40}$/.test(v)) {
        process.stdout.write(v);
      }
    " 2>/dev/null || echo "")
    if [[ -n "$DELEGATE_ADDR" ]]; then
      ok "Delegate address received from away device: $DELEGATE_ADDR"
      break
    fi
  else
    POLL_FAILURES=$((POLL_FAILURES + 1))
    if [[ "$POLL_FAILURES" -ge 5 ]]; then
      fail "Daemon appears to be down (5 consecutive failed polls). Check: tail -f ~/.ocap/daemon.log"
    fi
  fi
  if [[ "$i" -eq 300 ]]; then
    echo "" >&2
    echo -e "  ${YELLOW}Timed out waiting. Falling back to manual input.${RESET}" >&2
    echo -ne "${CYAN}→${RESET} Paste the delegate address: " >&2
    read -r DELEGATE_ADDR

    if [[ -z "$DELEGATE_ADDR" ]]; then
      echo -e "\n  ${DIM}No delegate address provided. You can create the delegation manually later:${RESET}" >&2
      echo -e "  ${DIM}yarn ocap daemon exec queueMessage '[\"$ROOT_KREF\", \"createDelegation\", [{\"delegate\": \"0xADDRESS\", \"caveats\": [{\"type\":\"nativeTokenTransferAmount\",\"enforcer\":\"0xF71af580b9c3078fbc2BBF16FbB8EEd82b330320\",\"terms\":\"0x...\"}], \"chainId\": $CHAIN_ID}]]'${RESET}\n" >&2
      exit 0
    fi
    break
  fi
  # read -t 2 doubles as the sleep — if the user pastes an address it breaks immediately
  if read -t 2 -r MANUAL_ADDR 2>/dev/null && [[ -n "$MANUAL_ADDR" ]]; then
    DELEGATE_ADDR="$MANUAL_ADDR"
    ok "Delegate address entered manually: $DELEGATE_ADDR"
    break
  fi
done

if ! echo "$DELEGATE_ADDR" | grep -qiE '^0x[0-9a-f]{40}$'; then
  fail "Invalid Ethereum address: $DELEGATE_ADDR"
fi

# Prompt for optional spending limits
echo "" >&2
echo -e "  ${DIM}Spending limits restrict how much ETH the agent can spend.${RESET}" >&2
echo -e "  ${DIM}Both are enforced on-chain — the agent cannot bypass them.${RESET}" >&2
echo "" >&2
echo -ne "${CYAN}→${RESET} Total ETH spending limit (e.g. 0.1, or Enter for unlimited): " >&2
read -r TOTAL_LIMIT
echo -ne "${CYAN}→${RESET} Max ETH per transaction (e.g. 0.01, or Enter for unlimited): " >&2
read -r TX_LIMIT

CAVEATS_JSON=$(TOTAL="$TOTAL_LIMIT" TX="$TX_LIMIT" node -e "
  const caveats = [];
  const total = (process.env.TOTAL || '').trim();
  const tx = (process.env.TX || '').trim();
  const encode = (v) => {
    const wei = BigInt(Math.round(parseFloat(v) * 1e18));
    return '0x' + wei.toString(16).padStart(64, '0');
  };
  if (total) caveats.push({
    type: 'nativeTokenTransferAmount',
    enforcer: '0xF71af580b9c3078fbc2BBF16FbB8EEd82b330320',
    terms: encode(total)
  });
  if (tx) caveats.push({
    type: 'valueLte',
    enforcer: '0x92Bf12322527cAA612fd31a0e810472BBB106A8F',
    terms: encode(tx)
  });
  process.stdout.write(JSON.stringify(caveats));
")

if [[ "$CAVEATS_JSON" == "[]" ]]; then
  info "Creating delegation for $DELEGATE_ADDR (no spending limits)..."
else
  info "Creating delegation for $DELEGATE_ADDR with spending limits..."
  echo -e "  ${DIM}Caveats: $CAVEATS_JSON${RESET}" >&2
fi

DEL_PARAMS=$(KREF="$ROOT_KREF" DEL="$DELEGATE_ADDR" CID="$CHAIN_ID" CAVS="$CAVEATS_JSON" node -e "
  const p = JSON.stringify([process.env.KREF, 'createDelegation', [{ delegate: process.env.DEL, caveats: JSON.parse(process.env.CAVS), chainId: Number(process.env.CID) }]]);
  process.stdout.write(p);
")
DEL_RAW=$(daemon_exec queueMessage "$DEL_PARAMS")
DEL_INNER=$(echo "$DEL_RAW" | parse_capdata)
ok "Delegation created"

# ---------------------------------------------------------------------------
# Push delegation to away device (or fall back to manual copy-paste)
# ---------------------------------------------------------------------------

HAS_AWAY="false"
CAPS_RAW=$(daemon_exec --quiet queueMessage "[\"$ROOT_KREF\", \"getCapabilities\", []]" 2>/dev/null) || CAPS_RAW=""
if [[ -n "$CAPS_RAW" ]]; then
  HAS_AWAY=$(echo "$CAPS_RAW" | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8').trim());
    const v = JSON.parse(d.body.slice(1));
    process.stdout.write(String(v.hasAwayWallet === true));
  " 2>&1) || {
    echo -e "  ${YELLOW}Warning: Failed to parse capabilities — cannot auto-push delegation${RESET}" >&2
    HAS_AWAY="false"
  }
else
  echo -e "  ${YELLOW}Warning: Failed to query capabilities — cannot auto-push delegation${RESET}" >&2
fi

if [[ "$HAS_AWAY" == "true" ]]; then
  info "Pushing delegation to away device..."
  PUSH_PARAMS=$(KREF="$ROOT_KREF" DEL="$DEL_INNER" node -e "
    const p = JSON.stringify([process.env.KREF, 'pushDelegationToAway', [JSON.parse(process.env.DEL)]]);
    process.stdout.write(p);
  ")
  PUSH_OUTPUT=$(daemon_exec --quiet queueMessage "$PUSH_PARAMS" --timeout 30 2>&1) && {
    ok "Delegation pushed to away device"
  } || {
    echo -e "  ${RED}✗${RESET} Push failed — falling back to manual transfer" >&2
    if [[ -n "$PUSH_OUTPUT" ]]; then
      echo -e "  ${DIM}Reason: $PUSH_OUTPUT${RESET}" >&2
    fi
    HAS_AWAY="false"
  }
fi

if [[ "$HAS_AWAY" != "true" ]]; then
  cat >&2 <<EOF

$(echo -e "${YELLOW}${BOLD}")  Copy this delegation JSON and paste it into the away device
  script when prompted:$(echo -e "${RESET}")

$(echo -e "${BOLD}")$DEL_RAW$(echo -e "${RESET}")

EOF
fi

cat >&2 <<EOF

  Watch daemon logs: $(echo -e "${DIM}")tail -f ~/.ocap/daemon.log$(echo -e "${RESET}")
  Stop the daemon:   $(echo -e "${DIM}")yarn ocap daemon stop$(echo -e "${RESET}")
  Purge all state:   $(echo -e "${DIM}")yarn ocap daemon purge --force$(echo -e "${RESET}")

EOF
