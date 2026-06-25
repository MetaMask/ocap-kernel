#!/usr/bin/env bash
# Clear the running matcher's service registry without touching the
# kernel database, so the matcher's OCAP URL stays valid and every
# downstream consumer (openclaw discovery plugin, .metamaskrc, the
# demo-display, the cast list, the SSH tunnel) keeps working unchanged.
#
# Intended for the pre-demo "wipe the slate" workflow: kill stale
# registrations from earlier rehearsals, then start the day's services
# fresh, all without reissuing URLs.
#
# How it works:
#   1. Ask the daemon for its subcluster list.
#   2. Find the matcher subcluster (config.bootstrap === 'matcher').
#   3. Look up its root kref via executeDBQuery on the kernel kv table.
#   4. queueMessage clearRegistry to that root kref.
# The matcher vat's clearRegistry method empties both its in-memory
# map and its baggage-persisted entries in one shot, and arms a
# lazy-reingest flag so the next findServices call would re-feed the
# bridge (which, post-clear, has nothing to feed).
#
# Usage:
#   clear-matcher-registry.sh [--home DAEMON_HOME]
#
#   --home DAEMON_HOME   The daemon home directory whose matcher to
#                        clear. Defaults to ~/.ocap.
#
# Exit status is non-zero if no matcher subcluster is running.

set -euo pipefail

DAEMON_HOME="${HOME}/.ocap"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --home)
      [[ $# -lt 2 ]] && { echo "Error: --home requires a value" >&2; exit 1; }
      DAEMON_HOME="$2"; shift 2 ;;
    --help|-h)
      sed -n '2,/^$/p' "$0" >&2; exit 0 ;;
    *)
      echo "Error: unknown argument: $1" >&2; exit 1 ;;
  esac
done

info() { echo "[clear-registry] $*" >&2; }
fail() { echo "[clear-registry] ERROR: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OCAP_BIN="$REPO_ROOT/packages/kernel-cli/dist/app.mjs"

if [[ ! -f "$OCAP_BIN" ]]; then
  fail "ocap CLI not found at $OCAP_BIN. Run \`yarn workspace @metamask/kernel-cli build\` first."
fi

daemon_exec() {
  node "$OCAP_BIN" --home "$DAEMON_HOME" daemon exec "$@"
}

daemon_queue() {
  node "$OCAP_BIN" --home "$DAEMON_HOME" daemon queueMessage "$@"
}

info "Locating matcher subcluster (daemon home: $DAEMON_HOME)..."
STATUS_JSON="$(daemon_exec getStatus 2>/dev/null)" || \
  fail "Daemon at $DAEMON_HOME is not responding. Start it first."

MATCHER_VAT_ID="$(echo "$STATUS_JSON" | node -e "
  const raw = require('fs').readFileSync('/dev/stdin','utf8').trim();
  const data = JSON.parse(raw);
  const subclusters = data.subclusters ?? [];
  const matcher = subclusters.find(
    (sc) => sc?.config?.bootstrap === 'matcher',
  );
  if (matcher && matcher.vats && typeof matcher.vats.matcher === 'string') {
    process.stdout.write(matcher.vats.matcher);
  }
")"

if [[ -z "$MATCHER_VAT_ID" ]]; then
  fail "No matcher subcluster found in this daemon. Nothing to clear."
fi

# Pull the root kref from the kernel kv table; same key form as
# start-matcher.sh uses for the keep-state reuse path.
ROOT_QUERY_JSON="$(SQL="SELECT value FROM kv WHERE key = '${MATCHER_VAT_ID}.c.o+0'" \
  node -e "process.stdout.write(JSON.stringify({ sql: process.env.SQL }));")"
ROOT_KREF="$(daemon_exec executeDBQuery "$ROOT_QUERY_JSON" | node -e "
  const raw = require('fs').readFileSync('/dev/stdin','utf8').trim();
  const rows = JSON.parse(raw);
  if (Array.isArray(rows) && rows[0] && typeof rows[0].value === 'string') {
    process.stdout.write(rows[0].value);
  }
")"

if [[ -z "$ROOT_KREF" ]]; then
  fail "Could not resolve matcher root kref (vat $MATCHER_VAT_ID). Kernel database may be corrupted."
fi

info "Matcher vat: $MATCHER_VAT_ID (root $ROOT_KREF)"
info "Clearing registry..."
CLEAR_RESULT="$(daemon_queue "$ROOT_KREF" clearRegistry)"
CLEARED="$(echo "$CLEAR_RESULT" | node -e "
  const raw = require('fs').readFileSync('/dev/stdin','utf8').trim();
  const result = JSON.parse(raw);
  // queueMessage decodes CapData by default, so result should already
  // be the plain object { cleared: <n> }.
  if (result && typeof result === 'object' && typeof result.cleared === 'number') {
    process.stdout.write(String(result.cleared));
  } else {
    process.stderr.write('Unexpected clearRegistry result: ' + raw + '\\n');
    process.exit(1);
  }
")"

info "Registry cleared: $CLEARED entr$( [[ "$CLEARED" == "1" ]] && echo 'y' || echo 'ies' ) removed."
info "Matcher URL is unchanged; downstream consumers do not need to be updated."
