#!/usr/bin/env bash
# Shared helper: resolve chain name to chain ID.
#
# Usage (source this file):
#   source "$(dirname "${BASH_SOURCE[0]}")/resolve-chain.sh"
#   resolve_chain "base"      # sets CHAIN_ID=8453
#   resolve_chain "11155111"  # sets CHAIN_ID=11155111 (pass-through)
#
# Also provides:
#   chain_name()       — human-readable name for a chain ID
#   pimlico_slug()     — Pimlico URL slug for a chain ID
#   infura_rpc_url()   — full Infura RPC URL for a chain ID + API key
#   pimlico_rpc_url()  — full Pimlico RPC URL for a chain ID

# Resolve a chain name (or numeric ID) to CHAIN_ID.
resolve_chain() {
  local input
  input="$(echo "$1" | tr '[:upper:]' '[:lower:]')"
  case "$input" in
    ethereum|eth|mainnet)  CHAIN_ID=1 ;;
    optimism|op)           CHAIN_ID=10 ;;
    bsc|bnb)               CHAIN_ID=56 ;;
    polygon|matic)         CHAIN_ID=137 ;;
    base)                  CHAIN_ID=8453 ;;
    arbitrum|arb)          CHAIN_ID=42161 ;;
    linea)                 CHAIN_ID=59144 ;;
    sepolia)               CHAIN_ID=11155111 ;;
    # Local 31337: Anvil in Docker E2E; `hardhat` alias kept for older scripts.
    anvil|localhost|hardhat) CHAIN_ID=31337 ;;
    *)
      # Try as numeric ID
      if echo "$input" | grep -qE '^[0-9]+$'; then
        CHAIN_ID="$input"
        # Validate it's a supported chain
        case "$CHAIN_ID" in
          1|10|56|137|8453|42161|59144|11155111|31337) ;; # ok
          *) echo "Error: Chain ID $CHAIN_ID is not supported." >&2
             print_supported_chains
             return 1 ;;
        esac
      else
        echo "Error: Unknown chain '$1'." >&2
        print_supported_chains
        return 1
      fi
      ;;
  esac
}

chain_name() {
  case "$1" in
    1)        echo "Ethereum" ;;
    10)       echo "Optimism" ;;
    56)       echo "BNB Smart Chain" ;;
    137)      echo "Polygon" ;;
    8453)     echo "Base" ;;
    42161)    echo "Arbitrum One" ;;
    59144)    echo "Linea" ;;
    11155111) echo "Sepolia" ;;
    31337)    echo "Anvil" ;;
    *)        echo "unknown" ;;
  esac
}

pimlico_slug() {
  case "$1" in
    1)        echo "ethereum" ;;
    10)       echo "optimism" ;;
    56)       echo "binance" ;;
    137)      echo "polygon" ;;
    8453)     echo "base" ;;
    42161)    echo "arbitrum" ;;
    59144)    echo "linea" ;;
    11155111) echo "sepolia" ;;
    *)        echo "" ;;
  esac
}

# Returns the Infura subdomain for a chain ID (empty if unsupported).
_infura_subdomain() {
  case "$1" in
    1)        echo "mainnet" ;;
    10)       echo "optimism-mainnet" ;;
    137)      echo "polygon-mainnet" ;;
    8453)     echo "base-mainnet" ;;
    42161)    echo "arbitrum-mainnet" ;;
    59144)    echo "linea-mainnet" ;;
    11155111) echo "sepolia" ;;
    *)        echo "" ;;
  esac
}

# Build an Infura RPC URL.
# Args: chain_id api_key
infura_rpc_url() {
  local sub
  sub=$(_infura_subdomain "$1")
  if [[ -z "$sub" ]]; then
    echo "Error: Infura does not support chain $1 ($(chain_name "$1")). Provide --rpc-url instead." >&2
    return 1
  fi
  echo "https://${sub}.infura.io/v3/${2}"
}

# Build a Pimlico RPC URL (without API key).
# Args: chain_id
pimlico_rpc_url() {
  local slug
  slug=$(pimlico_slug "$1")
  if [[ -z "$slug" ]]; then
    echo "Error: Pimlico does not support chain $1 ($(chain_name "$1"))." >&2
    return 1
  fi
  echo "https://api.pimlico.io/v2/${slug}/rpc"
}

# Print supported chains table
print_supported_chains() {
  echo "Supported chains:" >&2
  echo "  Name       Chain ID  Aliases" >&2
  echo "  ---------  --------  -------" >&2
  echo "  ethereum   1         eth, mainnet" >&2
  echo "  optimism   10        op" >&2
  echo "  bsc        56        bnb" >&2
  echo "  polygon    137       matic" >&2
  echo "  base       8453" >&2
  echo "  arbitrum   42161     arb" >&2
  echo "  linea      59144" >&2
  echo "  sepolia    11155111" >&2
  echo "  anvil      31337     localhost" >&2
}
