#!/usr/bin/env bash
# Per-rehearsal "wipe the slate + reuse the matcher" sequence:
#
#   1. clear-matcher-registry.sh    (empty the registry; URL stays)
#   2. start-matcher.sh --no-build  (reuse the existing subcluster)
#
# After this finishes, the operator just needs to source
# ~/.ocap/matcher-urls.env in any shell that doesn't already have
# the URLs in its environment.
#
# This is the routine pre-rehearsal command. For cold-start / fresh
# URLs, use reset-everything.sh instead.
#
# Usage:
#   rehearsal-restart-matcher.sh [start-matcher-args...]
#
# Any extra arguments are passed through to start-matcher.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info() { echo "[rehearsal-restart] $*" >&2; }

# Clearing the registry is best-effort: if no matcher is running yet
# (very first boot, or after a `daemon stop`), there's nothing to
# clear and start-matcher.sh will produce a fresh empty registry on
# its own. The script's exit-on-no-matcher case is therefore expected
# in that flow, not an error.
info "Step 1/2: clearing matcher registry (best-effort)..."
if ! "$SCRIPT_DIR/clear-matcher-registry.sh" 2>&1; then
  info "(no running matcher to clear; continuing)"
fi

info "Step 2/2: starting matcher..."
"$SCRIPT_DIR/start-matcher.sh" --no-build "$@"

info ""
info "Done. URLs in ~/.ocap/matcher-urls.env (source it in any shell"
info "that doesn't already have MATCHER_OCAP_URL exported)."
