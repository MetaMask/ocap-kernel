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
ACCOUNTS_RAW=$(daemon_exec --quiet queueMessage "[\"$ROOT_KREF\", \"getAccounts\", []]")
ACCOUNTS=$(echo "$ACCOUNTS_RAW" | parse_capdata)
DEL_LIST_RAW=$(daemon_exec --quiet queueMessage "[\"$ROOT_KREF\", \"listDelegations\", []]")
DEL_LIST=$(echo "$DEL_LIST_RAW" | parse_capdata)

# Show only active (signed) delegations issued by this device
ACTIVE_INFO=$(ACCTS="$ACCOUNTS" node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const accounts = JSON.parse(process.env.ACCTS).map(a => a.toLowerCase());
  const fmt = (wei) => (Number(BigInt(wei)) / 1e18).toFixed(4);

  // Signed delegations where we are the delegator (issued by us)
  const issued = d.filter(del =>
    del.status === 'signed' && accounts.includes(del.delegator.toLowerCase())
  );

  if (issued.length === 0) {
    process.stderr.write('\n  No active delegations issued by this device.\n\n');
    process.stdout.write(JSON.stringify({ count: 0 }));
    process.exit(0);
  }

  process.stderr.write('\n  Active delegations:\n');
  issued.forEach((del, i) => {
    process.stderr.write('  ' + (i+1) + '. delegate: ' + del.delegate + ' (chain ' + del.chainId + ')\n');
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

  const last = issued[issued.length - 1];
  process.stdout.write(JSON.stringify({
    count: issued.length,
    delegate: last.delegate,
    chainId: last.chainId,
    ids: issued.map(del => del.id),
  }));
" <<< "$DEL_LIST")

ACTIVE_COUNT=$(echo "$ACTIVE_INFO" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  process.stdout.write(String(d.count));
")

if [[ "$ACTIVE_COUNT" == "0" ]]; then
  fail "No active delegations found. Run setup-home.sh first to create a delegation."
fi

DELEGATE_ADDR=$(echo "$ACTIVE_INFO" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  process.stdout.write(d.delegate);
")

CHAIN_ID=$(echo "$ACTIVE_INFO" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  process.stdout.write(String(d.chainId));
")

echo -e "  ${DIM}Delegate: $DELEGATE_ADDR (chain $CHAIN_ID)${RESET}" >&2

# ---------------------------------------------------------------------------
# 2. Prompt for new limits
# ---------------------------------------------------------------------------

echo -e "  ${DIM}This creates a new delegation — the cumulative spending counter resets to zero.${RESET}" >&2
echo -e "  ${DIM}Both limits are enforced on-chain — the agent cannot bypass them.${RESET}" >&2
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
# 3. Revoke old delegations and create new one
# ---------------------------------------------------------------------------

# Revoke all active delegations for this delegate
OLD_IDS=$(echo "$ACTIVE_INFO" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  process.stdout.write(JSON.stringify(d.ids));
")

info "Revoking old delegation(s) on-chain..."
echo -e "  ${DIM}Each revocation submits a UserOp and waits for on-chain confirmation.${RESET}" >&2
REVOKE_FAILED=0
while read -r DEL_ID; do
  echo -e "  ${DIM}Revoking $DEL_ID...${RESET}" >&2
  REVOKE_OUTPUT=$(daemon_exec --quiet queueMessage "[\"$ROOT_KREF\", \"revokeDelegation\", [\"$DEL_ID\"]]" --timeout 120) || {
    echo -e "  ${RED}✗${RESET} Failed to revoke delegation $DEL_ID" >&2
    if [[ -n "$REVOKE_OUTPUT" ]]; then
      echo -e "  ${DIM}Reason: $REVOKE_OUTPUT${RESET}" >&2
    fi
    REVOKE_FAILED=$((REVOKE_FAILED + 1))
    continue
  }
  # Check if the daemon returned a CapData-wrapped error (exit code is still 0).
  # Inside JSON, the inner quotes are escaped as \" so we grep for the escaped form.
  if echo "$REVOKE_OUTPUT" | grep -q '#error'; then
    ERR_MSG=$(echo "$REVOKE_OUTPUT" | parse_capdata 2>/dev/null | node -e "
      const raw = require('fs').readFileSync('/dev/stdin','utf8').trim();
      try {
        const d = JSON.parse(raw);
        process.stdout.write(d['#error'] || raw);
      } catch { process.stdout.write(raw); }
    " 2>/dev/null) || ERR_MSG="Unknown error"
    echo -e "  ${RED}✗${RESET} Failed to revoke delegation $DEL_ID" >&2
    echo -e "     ${DIM}Reason: $ERR_MSG${RESET}" >&2
    REVOKE_FAILED=$((REVOKE_FAILED + 1))
    continue
  fi
  # Extract userOpHash from CapData and print explorer link
  USER_OP_HASH=$(echo "$REVOKE_OUTPUT" | parse_capdata 2>/dev/null) || USER_OP_HASH=""
  if [[ -n "$USER_OP_HASH" && "$USER_OP_HASH" == 0x* ]]; then
    if [[ "$CHAIN_ID" == "1" ]]; then
      JIFFYSCAN_URL="https://jiffyscan.xyz/userOpHash/${USER_OP_HASH}"
    else
      JIFFYSCAN_URL="https://sepolia.jiffyscan.xyz/userOpHash/${USER_OP_HASH}"
    fi
    ok "Revoked $DEL_ID"
    echo -e "     ${DIM}${JIFFYSCAN_URL}${RESET}" >&2
  else
    ok "Revoked $DEL_ID"
  fi
done < <(echo "$OLD_IDS" | node -e "
  const ids = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  for (const id of ids) { console.log(id); }
")

if [[ "$REVOKE_FAILED" -gt 0 ]]; then
  fail "Failed to revoke $REVOKE_FAILED delegation(s) on-chain. Aborting to avoid duplicate active delegations."
fi
ok "Revoked $ACTIVE_COUNT old delegation(s) on-chain"

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
DEL_JSON=$(echo "$DEL_RAW" | parse_capdata)
ok "New delegation created"

# ---------------------------------------------------------------------------
# 4. Push delegation to away device (or fall back to manual copy-paste)
# ---------------------------------------------------------------------------

# Check if the away device has registered a back-channel
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
  info "Pushing delegation to away device over QUIC..."
  PUSH_PARAMS=$(KREF="$ROOT_KREF" DEL="$DEL_JSON" OLD="$OLD_IDS" node -e "
    const p = JSON.stringify([process.env.KREF, 'pushDelegationToAway', [JSON.parse(process.env.DEL), JSON.parse(process.env.OLD)]]);
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
  AWAY_CMDS=$(DEL="$DEL_JSON" KREF="$ROOT_KREF" IDS="$OLD_IDS" node -e "
    const kref = process.env.KREF;
    const ids = JSON.parse(process.env.IDS);
    const lines = [];
    for (const id of ids) {
      const args = JSON.stringify([kref, 'revokeDelegationLocally', [id]]);
      const escaped = args.replace(/'/g, \"'\\\\''\" );
      lines.push('yarn ocap daemon exec queueMessage ' + \"'\" + escaped + \"'\");
    }
    const recvArgs = JSON.stringify([kref, 'receiveDelegation', [JSON.parse(process.env.DEL)]]);
    const recvEscaped = recvArgs.replace(/'/g, \"'\\\\''\" );
    lines.push('yarn ocap daemon exec queueMessage ' + \"'\" + recvEscaped + \"'\");
    process.stdout.write(lines.join('\n'));
  ")

  cat >&2 <<EOF

$(echo -e "${YELLOW}${BOLD}")  Run these commands on the away device to apply the new delegation:$(echo -e "${RESET}")

$(echo -e "${BOLD}")$AWAY_CMDS$(echo -e "${RESET}")

EOF
fi
