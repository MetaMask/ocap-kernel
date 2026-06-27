#!/usr/bin/env bash
# Start a sample-services daemon and launch the Echo and RandomNumber
# subclusters, each registering with the supplied service matcher.
#
# Like start-matcher.sh this is orthogonal to relay startup; the relay
# address is resolved from --relay / $OCAP_RELAY_MULTIADDR /
# $LIBP2P_RELAY_HOME/relay.addr / $HOME/.libp2p-relay/relay.addr in
# that order.
#
# The matcher OCAP URL is required and is resolved in this order:
#   1. <matcher-url>            (positional argument)
#   2. $MATCHER_OCAP_URL        (environment variable)
# The vats embed it in their bootstrap parameters so each one can
# register with the matcher on startup.
#
# Usage:
#   start-services.sh [<matcher-url>] [--relay MULTIADDR] [--no-build] [--keep-state]

set -euo pipefail

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

RELAY_ADDR="${OCAP_RELAY_MULTIADDR:-}"
RELAY_FILE="${LIBP2P_RELAY_HOME:-${HOME}/.libp2p-relay}/relay.addr"
SKIP_BUILD=false
FORCE_RESET=true
MATCHER_URL_ARG=""

usage() {
  cat >&2 <<EOF
Usage: $0 [<matcher-url>] [--relay MULTIADDR] [--no-build] [--keep-state]

  <matcher-url>      OCAP URL of the matcher to register with. Falls
                     back to \$MATCHER_OCAP_URL if omitted.
  --relay MULTIADDR  Relay multiaddr to connect through. Overrides
                     \$OCAP_RELAY_MULTIADDR and
                     \$LIBP2P_RELAY_HOME/relay.addr.
  --no-build         Skip building/bundling the sample-services vats.
  --keep-state       Do not purge any existing daemon state before
                     launching subclusters.
  --help, -h         Show this help.
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --relay)
      [[ $# -lt 2 ]] && { echo "Error: --relay requires a value" >&2; usage; }
      RELAY_ADDR="$2"; shift 2 ;;
    --no-build)
      SKIP_BUILD=true; shift ;;
    --keep-state)
      FORCE_RESET=false; shift ;;
    --help|-h)
      usage ;;
    --*)
      echo "Error: unknown argument: $1" >&2; usage ;;
    *)
      if [[ -z "$MATCHER_URL_ARG" ]]; then
        MATCHER_URL_ARG="$1"; shift
      else
        echo "Error: unexpected positional argument: $1" >&2; usage
      fi
      ;;
  esac
done

info() { echo "[start-services] $*" >&2; }
fail() { echo "[start-services] ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Validate matcher URL up-front
# ---------------------------------------------------------------------------

MATCHER_URL="${MATCHER_URL_ARG:-${MATCHER_OCAP_URL:-}}"
if [[ -z "$MATCHER_URL" ]]; then
  fail "matcher URL required (pass as first argument or set \$MATCHER_OCAP_URL)."
fi
info "Matcher: $MATCHER_URL"

# ---------------------------------------------------------------------------
# Resolve relay address
# ---------------------------------------------------------------------------

if [[ -z "$RELAY_ADDR" && -f "$RELAY_FILE" ]]; then
  RELAY_ADDR="$(tr -d '[:space:]' < "$RELAY_FILE" || true)"
fi
if [[ -z "$RELAY_ADDR" ]]; then
  fail "No relay address supplied. Pass --relay, set \$OCAP_RELAY_MULTIADDR, or start the relay (\`yarn ocap relay\`) to populate $RELAY_FILE."
fi
info "Relay: $RELAY_ADDR"

# ---------------------------------------------------------------------------
# Locate the repo + bin paths
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PKG_DIR/../.." && pwd)"
OCAP_BIN="$REPO_ROOT/packages/kernel-cli/dist/app.mjs"
ECHO_BUNDLE="$PKG_DIR/src/echo-service/index.bundle"
RNG_BUNDLE="$PKG_DIR/src/random-number-service/index.bundle"
INDUSTRIAL_DESIGN_BUNDLE="$PKG_DIR/src/industrial-design/index.bundle"
SCHEMATIC_GENERATION_BUNDLE="$PKG_DIR/src/schematic-generation/index.bundle"
FIRMWARE_BUNDLE="$PKG_DIR/src/firmware/index.bundle"
MECHANICAL_DESIGN_BUNDLE="$PKG_DIR/src/mechanical-design/index.bundle"
PCB_LAYOUT_BUNDLE="$PKG_DIR/src/pcb-layout/index.bundle"
COMPONENT_SOURCING_BUNDLE="$PKG_DIR/src/component-sourcing/index.bundle"
DEVICE_ASSEMBLY_BUNDLE="$PKG_DIR/src/device-assembly/index.bundle"
RETAIL_LISTING_BUNDLE="$PKG_DIR/src/retail-listing/index.bundle"
LOGISTICS_BUNDLE="$PKG_DIR/src/logistics/index.bundle"
BENCH_BUILD_BUNDLE="$PKG_DIR/src/bench-build/index.bundle"

# Sample-services daemon lives in its own home so it can run alongside
# the matcher (~/.ocap) and consumer (~/.ocap-consumer) daemons without
# colliding on socket paths or kernel.sqlite locks.
SERVICES_HOME="${OCAP_SERVICES_HOME:-${HOME}/.ocap-services}"

if [[ ! -f "$OCAP_BIN" ]]; then
  fail "ocap CLI not found at $OCAP_BIN. Run \`yarn workspace @metamask/kernel-cli build\` first."
fi

# ---------------------------------------------------------------------------
# Build & bundle
# ---------------------------------------------------------------------------

if $SKIP_BUILD; then
  info "Skipping build (--no-build)"
  [[ -f "$ECHO_BUNDLE" ]] || fail "Bundle not found at $ECHO_BUNDLE. Remove --no-build or build first."
  [[ -f "$RNG_BUNDLE" ]] || fail "Bundle not found at $RNG_BUNDLE. Remove --no-build or build first."
  [[ -f "$INDUSTRIAL_DESIGN_BUNDLE" ]] || fail "Bundle not found at $INDUSTRIAL_DESIGN_BUNDLE. Remove --no-build or build first."
  [[ -f "$SCHEMATIC_GENERATION_BUNDLE" ]] || fail "Bundle not found at $SCHEMATIC_GENERATION_BUNDLE. Remove --no-build or build first."
  [[ -f "$FIRMWARE_BUNDLE" ]] || fail "Bundle not found at $FIRMWARE_BUNDLE. Remove --no-build or build first."
  [[ -f "$MECHANICAL_DESIGN_BUNDLE" ]] || fail "Bundle not found at $MECHANICAL_DESIGN_BUNDLE. Remove --no-build or build first."
  [[ -f "$PCB_LAYOUT_BUNDLE" ]] || fail "Bundle not found at $PCB_LAYOUT_BUNDLE. Remove --no-build or build first."
  [[ -f "$COMPONENT_SOURCING_BUNDLE" ]] || fail "Bundle not found at $COMPONENT_SOURCING_BUNDLE. Remove --no-build or build first."
  [[ -f "$DEVICE_ASSEMBLY_BUNDLE" ]] || fail "Bundle not found at $DEVICE_ASSEMBLY_BUNDLE. Remove --no-build or build first."
  [[ -f "$RETAIL_LISTING_BUNDLE" ]] || fail "Bundle not found at $RETAIL_LISTING_BUNDLE. Remove --no-build or build first."
  [[ -f "$LOGISTICS_BUNDLE" ]] || fail "Bundle not found at $LOGISTICS_BUNDLE. Remove --no-build or build first."
  [[ -f "$BENCH_BUILD_BUNDLE" ]] || fail "Bundle not found at $BENCH_BUILD_BUNDLE. Remove --no-build or build first."
else
  info "Building sample-services package..."
  (cd "$REPO_ROOT" && yarn workspace @ocap/sample-services build >&2)
  info "Bundling sample-services vats..."
  (cd "$REPO_ROOT" && yarn workspace @ocap/sample-services bundle-vats >&2)
fi

# ---------------------------------------------------------------------------
# Start daemon under SERVICES_HOME
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Reap orphan services daemons
#
# `daemon stop` (which `daemon purge` invokes) only kills the PID in
# daemon.pid. Earlier runs that raced or didn't shut down cleanly can
# leave additional services-daemon processes alive, each holding a
# fresh kernel.sqlite and registered against the matcher under a
# *different* peer ID — the user sees duplicate provider cards and
# only the most-recent peer is actually reachable. Reap any leftovers
# before the purge so the next start is the only daemon in town.
#
# We target precisely this home: inspect each `daemon-entry.mjs`
# process's OCAP_SOCKET_PATH env var (set by the spawn) and only kill
# those whose socket path matches this services-daemon home. The
# matcher and consumer daemons on the same host (rare on the laptop,
# common on the VPS) are left alone.
# ---------------------------------------------------------------------------

EXPECTED_SOCKET="$SERVICES_HOME/daemon.sock"
ORPHANS=""
if pgrep -f daemon-entry.mjs >/dev/null 2>&1; then
  ALL_PIDS="$(pgrep -f daemon-entry.mjs || true)"
  for PID in $ALL_PIDS; do
    # Linux: /proc/<pid>/environ; macOS: `ps eww` carries env in argv tail.
    SOCK=""
    if [[ -r "/proc/$PID/environ" ]]; then
      SOCK="$(tr '\0' '\n' < "/proc/$PID/environ" 2>/dev/null \
              | sed -n 's/^OCAP_SOCKET_PATH=//p')"
    else
      SOCK="$(ps -p "$PID" -E -o command= 2>/dev/null \
              | tr ' ' '\n' | sed -n 's/^OCAP_SOCKET_PATH=//p' | head -1)"
    fi
    if [[ "$SOCK" == "$EXPECTED_SOCKET" ]]; then
      ORPHANS="$ORPHANS $PID"
    fi
  done
fi
if [[ -n "$ORPHANS" ]]; then
  info "Reaping orphan services daemons:$ORPHANS"
  # SIGTERM first so signal handlers can log shutdown; SIGKILL fallback.
  for PID in $ORPHANS; do kill "$PID" 2>/dev/null || true; done
  sleep 1
  for PID in $ORPHANS; do kill -KILL "$PID" 2>/dev/null || true; done
  # Best-effort cleanup of stale socket/pid files left behind by the
  # killed daemons. `daemon purge` below would do this too, but the
  # interlock in `daemon start` checks them up front.
  rm -f "$SERVICES_HOME/daemon.sock" "$SERVICES_HOME/daemon.pid"
fi

if $FORCE_RESET; then
  info "Purging existing services-daemon state at $SERVICES_HOME..."
  (cd "$REPO_ROOT" && node "$OCAP_BIN" --home "$SERVICES_HOME" daemon purge --force >&2) || true
fi

info "Starting services daemon..."
(cd "$REPO_ROOT" && node "$OCAP_BIN" --home "$SERVICES_HOME" daemon start >&2) \
  || fail "daemon start failed"

daemon_exec() {
  (cd "$REPO_ROOT" && node "$OCAP_BIN" --home "$SERVICES_HOME" daemon exec "$@")
}

# ---------------------------------------------------------------------------
# Initialize remote comms
# ---------------------------------------------------------------------------

RELAY_HOST=$(echo "$RELAY_ADDR" | node -e "
  const addr = require('fs').readFileSync('/dev/stdin','utf8').trim();
  const m = addr.match(/\\/(?:ip4|ip6|dns4|dns6)\\/([^\\/]+)/);
  if (m) process.stdout.write(m[1]);
")
COMMS_PARAMS=$(RELAY="$RELAY_ADDR" HOST="$RELAY_HOST" node -e "
  const params = { relays: [process.env.RELAY] };
  if (process.env.HOST) params.allowedWsHosts = [process.env.HOST];
  process.stdout.write(JSON.stringify(params));
")

info "Initializing remote comms..."
daemon_exec initRemoteComms "$COMMS_PARAMS" >/dev/null

info "Waiting for remote comms to connect..."
for i in $(seq 1 30); do
  STATUS=$(daemon_exec getStatus 2>/dev/null) || STATUS=""
  STATE=""
  if [[ -n "$STATUS" ]]; then
    STATE=$(echo "$STATUS" | node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
      process.stdout.write(data.remoteComms?.state ?? 'none');
    ")
  fi
  if [[ "$STATE" == "connected" ]]; then
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    fail "Remote comms did not reach 'connected' state after 30s (current: ${STATE:-unknown})"
  fi
  sleep 1
done
info "Remote comms connected"

# ---------------------------------------------------------------------------
# Launch each service as its own subcluster.
#
# Each cluster config carries its own bundle plus the matcher URL in
# the bootstrap-vat's `parameters` bag. The vat reads the URL out of
# its parameters arg and registers with the matcher on bootstrap.
# ---------------------------------------------------------------------------

launch_service() {
  local svc_name="$1"
  local vat_name="$2"
  local bundle_path="$3"

  local config
  config=$(BUNDLE="file://$bundle_path" \
           VAT_NAME="$vat_name" \
           MATCHER_URL="$MATCHER_URL" \
           RESET="$FORCE_RESET" \
           node -e "
    const config = {
      config: {
        bootstrap: process.env.VAT_NAME,
        forceReset: process.env.RESET === 'true',
        services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
        vats: {
          [process.env.VAT_NAME]: {
            bundleSpec: process.env.BUNDLE,
            parameters: { matcherUrl: process.env.MATCHER_URL },
            // Both services use crypto.getRandomValues for registration
            // tokens; RandomNumber also uses it for its draws.
            globals: ['crypto']
          }
        }
      }
    };
    process.stdout.write(JSON.stringify(config));
  ")

  info "Launching $svc_name subcluster..."
  daemon_exec launchSubcluster "$config" >/dev/null
  info "$svc_name registered."
}

launch_service "Echo"                "echo"                 "$ECHO_BUNDLE"
launch_service "RandomNumber"        "random-number"        "$RNG_BUNDLE"
launch_service "IndustrialDesign"    "industrial-design"    "$INDUSTRIAL_DESIGN_BUNDLE"
launch_service "SchematicGeneration" "schematic-generation" "$SCHEMATIC_GENERATION_BUNDLE"
launch_service "Firmware"            "firmware"             "$FIRMWARE_BUNDLE"
launch_service "MechanicalDesign"    "mechanical-design"    "$MECHANICAL_DESIGN_BUNDLE"
launch_service "PcbLayout"           "pcb-layout"           "$PCB_LAYOUT_BUNDLE"
launch_service "ComponentSourcing"   "component-sourcing"   "$COMPONENT_SOURCING_BUNDLE"
launch_service "DeviceAssembly"      "device-assembly"      "$DEVICE_ASSEMBLY_BUNDLE"
launch_service "RetailListing"       "retail-listing"       "$RETAIL_LISTING_BUNDLE"
launch_service "Logistics"           "logistics"            "$LOGISTICS_BUNDLE"
launch_service "BenchBuild"          "bench-build"          "$BENCH_BUILD_BUNDLE"

info "Sample services ready."
