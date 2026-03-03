#!/usr/bin/env bash
# Update spending limits by creating a new delegation.
#
# Requires a running daemon with an existing wallet subcluster.
# Reads the current delegation to find the delegate address and chain,
# then creates a new delegation with the updated limits.
#
# Usage:
#   ./update-limits.sh [--kref ko4]
#
# Optional:
#   --kref   Wallet coordinator kernel reference (default: ko4)

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

ROOT_KREF="ko4"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case "$1" in
    --kref)      ROOT_KREF="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--kref ko4]"
      echo ""
      echo "Updates spending limits by creating a new delegation."
      echo "Requires a running daemon with an existing wallet subcluster."
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PKG_ROOT/../.." && pwd)"
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
YELLOW='\033[0;33m'
RESET='\033[0m'

info()  { echo -e "${CYAN}→${RESET} $*" >&2; }
ok()    { echo -e "  ${GREEN}✓${RESET} $*" >&2; }
fail()  { echo -e "  ${RED}✗${RESET} $*" >&2; exit 1; }

parse_capdata() {
  node -e "
    const raw = require('fs').readFileSync('/dev/stdin', 'utf8').trim();
    if (!raw) { process.stderr.write('parse_capdata: empty input\n'); process.exit(1); }
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
      process.stderr.write('parse_capdata: body does not start with #: ' + data.body.slice(0, 100) + '\n');
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
# 1. Read existing delegations
# ---------------------------------------------------------------------------

info "Fetching current delegations..."
DEL_LIST_RAW=$(daemon_exec --quiet queueMessage "[\"$ROOT_KREF\", \"listDelegations\", []]")
DEL_LIST=$(echo "$DEL_LIST_RAW" | parse_capdata)

DEL_COUNT=$(echo "$DEL_LIST" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  process.stdout.write(String(d.length));
")

if [[ "$DEL_COUNT" == "0" ]]; then
  fail "No delegations found. Run setup-home.sh first to create a delegation."
fi

# Show current delegations
echo "$DEL_LIST" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const fmt = (wei) => (Number(BigInt(wei)) / 1e18).toFixed(4);
  process.stderr.write('\n  Current delegations:\n');
  d.forEach((del, i) => {
    process.stderr.write('  ' + (i+1) + '. delegate: ' + del.delegate + ' (chain ' + del.chainId + ', ' + del.status + ')\n');
    if (del.caveats && del.caveats.length > 0) {
      for (const c of del.caveats) {
        if (c.type === 'nativeTokenTransferAmount') {
          const val = BigInt('0x' + c.terms.slice(2).replace(/^0+/, '') || '0');
          process.stderr.write('     total limit: ' + fmt(val) + ' ETH\n');
        } else if (c.type === 'valueLte') {
          const val = BigInt('0x' + c.terms.slice(2).replace(/^0+/, '') || '0');
          process.stderr.write('     per-tx limit: ' + fmt(val) + ' ETH\n');
        } else {
          process.stderr.write('     ' + c.type + '\n');
        }
      }
    } else {
      process.stderr.write('     no spending limits\n');
    }
  });
  process.stderr.write('\n');
" >&2

# Pick the delegate address from the most recent signed delegation
DELEGATE_ADDR=$(echo "$DEL_LIST" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const signed = d.filter(x => x.status === 'signed');
  if (signed.length === 0) { process.stderr.write('No signed delegations found\n'); process.exit(1); }
  process.stdout.write(signed[signed.length - 1].delegate);
")

CHAIN_ID=$(echo "$DEL_LIST" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const signed = d.filter(x => x.status === 'signed');
  process.stdout.write(String(signed[signed.length - 1].chainId));
")

echo -e "  ${DIM}Delegate: $DELEGATE_ADDR (chain $CHAIN_ID)${RESET}" >&2

# ---------------------------------------------------------------------------
# 2. Prompt for new limits
# ---------------------------------------------------------------------------

echo -e "  ${DIM}Enter new spending limits (or Enter to keep unlimited).${RESET}" >&2
echo -e "  ${DIM}Both are enforced on-chain — the agent cannot bypass them.${RESET}" >&2
echo "" >&2
echo -ne "${CYAN}→${RESET} Total ETH spending limit (e.g. 0.5, or Enter for unlimited): " >&2
read -r TOTAL_LIMIT
echo -ne "${CYAN}→${RESET} Max ETH per transaction (e.g. 0.1, or Enter for unlimited): " >&2
read -r TX_LIMIT

CAVEATS_JSON=$(TOTAL="$TOTAL_LIMIT" TX="$TX_LIMIT" node -e "
  const caveats = [];
  const total = (process.env.TOTAL || '').trim();
  const tx = (process.env.TX || '').trim();
  const encode = (v) => {
    const [whole = '0', frac = ''] = v.split('.');
    const paddedFrac = frac.padEnd(18, '0').slice(0, 18);
    const wei = BigInt(whole) * 10n ** 18n + BigInt(paddedFrac);
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

# ---------------------------------------------------------------------------
# 3. Create new delegation
# ---------------------------------------------------------------------------

if [[ "$CAVEATS_JSON" == "[]" ]]; then
  info "Creating new delegation for $DELEGATE_ADDR (no spending limits)..."
else
  info "Creating new delegation for $DELEGATE_ADDR with updated limits..."
  echo -e "  ${DIM}Caveats: $CAVEATS_JSON${RESET}" >&2
fi

DEL_PARAMS=$(KREF="$ROOT_KREF" DEL="$DELEGATE_ADDR" CID="$CHAIN_ID" CAVS="$CAVEATS_JSON" node -e "
  const p = JSON.stringify([process.env.KREF, 'createDelegation', [{ delegate: process.env.DEL, caveats: JSON.parse(process.env.CAVS), chainId: Number(process.env.CID) }]]);
  process.stdout.write(p);
")
DEL_RAW=$(daemon_exec queueMessage "$DEL_PARAMS")
ok "New delegation created"

cat >&2 <<EOF

$(echo -e "${YELLOW}${BOLD}")  Copy this delegation JSON and paste it into the away device:$(echo -e "${RESET}")

  On the away device, run:
    yarn ocap daemon exec queueMessage '["ko4", "receiveDelegation", [<PASTE_JSON>]]'

$(echo -e "${BOLD}")$DEL_RAW$(echo -e "${RESET}")

EOF
