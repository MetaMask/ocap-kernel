#!/usr/bin/env bash
# Per-rehearsal "wipe the slate + reuse the matcher" sequence:
#
#   1. start-matcher.sh    (rebuilds bundles, restarts daemon to load
#                           the new code, restores subcluster + URL +
#                           baggage-persisted registry)
#   2. clear-matcher-registry.sh
#                          (now that the daemon is running with the
#                           latest matcher-vat bundle, ask it to
#                           empty its registry; URL stays)
#
# After this finishes, the operator just needs to source
# ~/.ocap/matcher-urls.env in any shell that doesn't already have
# the URLs in its environment.
#
# This is the routine pre-rehearsal command. For cold-start / fresh
# URLs, use reset-everything.sh instead.
#
# Order matters: clear-matcher-registry.sh invokes the matcher vat's
# `clearRegistry` method, which only exists if the vat was launched
# from a recent enough bundle. The earlier ordering ran clear-registry
# first, which failed against a matcher that had been launched before
# `clearRegistry` landed in the source. start-matcher.sh now does a
# `daemon stop` before `daemon start`, so re-running it always
# re-incarnates the vat against the current on-disk bundle.
#
# Usage:
#   rehearsal-restart-matcher.sh [start-matcher-args...]
#
# Any extra arguments are passed through to start-matcher.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info() { echo "[rehearsal-restart] $*" >&2; }

info "Step 1/2: restarting matcher (rebuild + daemon stop/start)..."
"$SCRIPT_DIR/start-matcher.sh" "$@"

# clear-matcher-registry.sh is best-effort: if for any reason the
# matcher isn't holding a registry yet (first boot, just-purged
# state), it exits non-zero and we move on. The registry would
# already be empty in that case.
info "Step 2/2: clearing matcher registry (best-effort)..."
if ! "$SCRIPT_DIR/clear-matcher-registry.sh" 2>&1; then
  info "(nothing to clear; continuing)"
fi

info ""
info "Done. URLs in ~/.ocap/matcher-urls.env (source it in any shell"
info "that doesn't already have MATCHER_OCAP_URL exported)."
