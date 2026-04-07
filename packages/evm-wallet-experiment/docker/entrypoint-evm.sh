#!/bin/sh
# EVM container entrypoint — starts Anvil (Prague hardfork), deploys
# delegation framework contracts, then keeps Anvil running.
set -e

# Drop any contracts.json left on the shared volume from a prior stack run. Otherwise
# Compose marks evm healthy before this deploy finishes, bundler reads stale EntryPoint
# addresses, and Alto exits with "entry point ... does not exist" on the fresh chain.
rm -f /run/ocap/contracts.json

echo "[evm] Starting Anvil (Prague hardfork)..."
anvil \
  --host 0.0.0.0 \
  --port 8545 \
  --hardfork prague \
  --accounts 20 \
  --balance 10000 \
  --mnemonic 'test test test test test test test test test test test junk' \
  2>&1 | tee /logs/evm.log &

ANVIL_PID=$!

# Wait for Anvil to be ready
echo "[evm] Waiting for Anvil..."
until cast bn --rpc-url http://localhost:8545 > /dev/null 2>&1; do
  sleep 0.5
done
echo "[evm] Anvil ready."

# Deploy delegation framework contracts
echo "[evm] Deploying contracts..."
EVM_RPC_URL=http://localhost:8545 node /app/deploy-contracts.mjs

echo "[evm] Chain ready with contracts deployed."

# Keep Anvil in foreground
wait $ANVIL_PID
