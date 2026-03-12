#!/usr/bin/env bash
# Interactive home wallet with MetaMask approval.
#
# Like setup-home.sh but uses MetaMask Mobile for signing instead of a
# local mnemonic. The script shows a QR code — scan it with MetaMask Mobile
# to connect. Every signing request triggers a MetaMask approval dialog.
#
# Usage:
#   ./setup-home-interactive.sh --infura-key KEY [--pimlico-key KEY] [--relay MULTIADDR] [--chain base] [--quic-port PORT] [--no-build]
#
# Required:
#   --infura-key     Infura API key
#
# Optional:
#   --pimlico-key    Pimlico API key (bundler/paymaster)
#   --relay          Relay multiaddr
#   --chain          Chain name (e.g. sepolia, base, ethereum)
#   --chain-id       Chain ID (alternative to --chain; default: 11155111 = Sepolia)
#   --quic-port      UDP port for QUIC transport (default: 4002)
#   --no-build       Skip the build step

set -euo pipefail

# ---------------------------------------------------------------------------
# Parse --no-build early (pass everything else through to the Node script)
# ---------------------------------------------------------------------------

SKIP_BUILD=false
FORWARD_ARGS=()

for arg in "$@"; do
  if [[ "$arg" == "--no-build" ]]; then
    SKIP_BUILD=true
  else
    FORWARD_ARGS+=("$arg")
  fi
done

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PKG_ROOT/../.." && pwd)"

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

if [[ "$SKIP_BUILD" == false ]]; then
  echo -e "\033[0;36m->\033[0m Building packages..." >&2
  (cd "$REPO_ROOT" && yarn workspace @metamask/ocap-kernel build) >&2
  (cd "$REPO_ROOT" && yarn workspace @metamask/kernel-node-runtime build) >&2
  (cd "$REPO_ROOT" && yarn workspace @ocap/eth-wallet build) >&2
  echo -e "  \033[0;32mok\033[0m Build complete" >&2
else
  echo -e "\033[0;36m->\033[0m Skipping build (--no-build)" >&2
fi

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

exec node "$SCRIPT_DIR/home-interactive.mjs" "${FORWARD_ARGS[@]}"
