#!/usr/bin/env bash
# Per-rehearsal VPS-side "wipe the slate" sequence:
#
#   1. start-matcher.sh    (rebuilds bundles, stops/starts the matcher
#                           daemon to reload the latest vat code,
#                           restores subcluster + URL + baggage-persisted
#                           registry, re-spawns the llm-bridge)
#   2. consumer daemon     (stop + start with --local-relay)
#   3. openclaw gateway    (restart so plugin state resets, including
#                           the demo plugin's $10k wallet and the
#                           discovery plugin's tracked-services cache)
#   4. clear-matcher-registry.sh
#                          (now that the matcher is up with the latest
#                           bundle, wipe any stale registrations from
#                           previous runs; URL stays unchanged)
#
# After this finishes, the operator still needs to (manually):
#   - In `vps-display`: Ctrl-C demo-display and re-run it, to flush
#     stale `wallet.*` events from its event-log buffer.
#   - Hard-refresh the dashboard so the iframe reconnects to ttyd
#     with a fresh openclaw tui session.
#   - On the laptop: re-run rehearsal-start-services.sh.
#
# This is the routine pre-rehearsal command. For cold-start / fresh
# URLs, use reset-everything.sh instead.
#
# Order matters: clear-matcher-registry.sh invokes the matcher vat's
# `clearRegistry` method, which only exists if the vat was launched
# from a recent enough bundle. start-matcher.sh stops+starts the
# daemon, which re-incarnates the vat against the current on-disk
# bundle, so we can clear afterward with confidence.
#
# Usage:
#   rehearsal-restart-matcher.sh [start-matcher-args...]
#
# Any extra arguments are passed through to start-matcher.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OCAP_BIN="$REPO_ROOT/packages/kernel-cli/dist/app.mjs"
CONSUMER_HOME="${OCAP_CONSUMER_HOME:-${HOME}/.ocap-consumer}"

info() { echo "[rehearsal-restart] $*" >&2; }
fail() { echo "[rehearsal-restart] ERROR: $*" >&2; exit 1; }

if [[ ! -f "$OCAP_BIN" ]]; then
  fail "ocap CLI not found at $OCAP_BIN. Run \`yarn workspace @metamask/kernel-cli build\` first."
fi

info "Step 1/4: restarting matcher (rebuild + daemon stop/start)..."
"$SCRIPT_DIR/start-matcher.sh" "$@"

info "Step 2/4: restarting consumer daemon..."
# Stop first (idempotent — succeeds if no daemon is running). The CLI
# prints "Daemon is not running." in that case, which is fine.
node "$OCAP_BIN" --home "$CONSUMER_HOME" daemon stop >&2 || true
# --local-relay tells the consumer to connect to the VPS's local relay
# (the same one the matcher uses), and triggers initRemoteComms as
# part of startup so the daemon comes up fully connected in one step.
node "$OCAP_BIN" --home "$CONSUMER_HOME" daemon start --local-relay >&2 \
  || fail "consumer daemon start failed"

info "Step 3/4: restarting openclaw gateway..."
# `gateway restart` is the published openclaw command. If it isn't
# on PATH something is misconfigured upstream and we should know
# about it rather than silently skipping.
if ! command -v openclaw >/dev/null 2>&1; then
  fail "openclaw CLI not on PATH; cannot restart gateway. Install or fix PATH."
fi
openclaw gateway restart >&2

info "Step 4/4: clearing matcher registry (best-effort)..."
# clear-matcher-registry.sh is best-effort: if for any reason the
# matcher isn't holding a registry yet (first boot, just-purged
# state), it exits non-zero and we move on. The registry would
# already be empty in that case.
if ! "$SCRIPT_DIR/clear-matcher-registry.sh" 2>&1; then
  info "(nothing to clear; continuing)"
fi

info ""
info "VPS side done. Manual follow-ups (see step 5+ of the playbook):"
info "  - vps-display: Ctrl-C and re-run demo-display"
info "  - browser: hard-refresh the dashboard"
info "  - laptop:  ./packages/sample-services/scripts/rehearsal-start-services.sh"
info ""
info "URLs in ~/.ocap/matcher-urls.env (source it in any shell that"
info "doesn't already have MATCHER_OCAP_URL exported)."
