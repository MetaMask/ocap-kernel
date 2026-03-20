# Verifying EIP-7702 direct (Infura) delegation calls

Before relying on the coordinator’s **self-call + SDK `callData`** path for `stateless7702` accounts, confirm on your target chain (e.g. Sepolia) that the delegated implementation accepts direct EOA invocation — not only calls routed through the ERC-4337 EntryPoint.

## What to simulate

Use `eth_call` with:

- `from`: the upgraded EOA address (same as the smart account address)
- `to`: the same address (self-call)
- `data`: the hex produced by `buildSdkRedeemCallData` / `buildSdkBatchRedeemCallData` for a **minimal** redemption you care about (or a static call that matches production encoding)

If the call reverts with an “only EntryPoint” (or similar) error, do not ship the direct path against that implementation without contract/SDK changes.

## Example (cast)

Replace placeholders with real values from your environment and a real `callData` from the wallet or a unit test fixture:

```bash
cast call --rpc-url "$SEPOLIA_RPC_URL" \
  --from "$EOA" \
  "$EOA" \
  "$CALLDATA"
```

A successful static call strongly suggests the direct transaction path is viable. A revert requires investigation against the [delegation-framework EIP-7702 docs](https://github.com/MetaMask/delegation-framework/blob/main/documents/EIP7702DeleGator.md).

## Automated check on Sepolia

Run the optional E2E (funded mnemonic, no Pimlico):

```bash
SEPOLIA_RPC_URL=https://... TEST_MNEMONIC="..." \
  yarn workspace @ocap/evm-wallet-experiment test:node:sepolia-7702-direct
```

See [run-sepolia-7702-direct-e2e.mjs](../test/e2e/run-sepolia-7702-direct-e2e.mjs).
