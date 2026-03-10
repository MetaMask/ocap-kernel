---
name: wallet
description: Use the wallet tools for all balance, send, and sign operations. Supports both ETH and ERC-20 tokens. The away wallet operates autonomously after setup — the home device does not need to be online.
metadata: { 'openclaw': { 'emoji': '👛', 'requires': { 'bins': ['wallet'] } } }
---

# Wallet (ocap)

Use the **wallet tools** for any Ethereum balance, send, or sign request. Do not use exec or other CLIs for wallet operations.

## Tools

- **wallet_accounts** — List wallet accounts. Returns cached home accounts if the home device is offline.
- **wallet_balance** — Get ETH balance for an address. Use `wallet_accounts` first to find the right address.
- **wallet_send** — Send ETH to an address. Fully autonomous — uses delegation redemption via the bundler, no home device needed.
- **wallet_token_resolve** — Resolve a token symbol or name (e.g. "USDC") to its contract address on the current chain. Not available for testnets.
- **wallet_token_balance** — Get ERC-20 token balance. Accepts a contract address or symbol (e.g. "USDC"). Returns human-readable amount with symbol.
- **wallet_token_send** — Send ERC-20 tokens to an address. Accepts a contract address or symbol. Automatically converts decimal amounts using the token's decimals.
- **wallet_token_info** — Get ERC-20 token metadata (name, symbol, decimals). Accepts a contract address or symbol.
- **wallet_sign** — Sign a message or typed data with the local key. The signature is valid for EIP-1271 verification against the smart account address.
- **wallet_capabilities** — Check what the wallet can do (local keys, peer wallet, delegations, bundler, cached accounts, autonomy level).

## Autonomy

After setup, the away wallet is **fully autonomous** for sending ETH, sending ERC-20 tokens, and signing messages. The home device only needs to be online for signing as the home EOA address specifically (which is rarely needed). Check `wallet_capabilities` — if `autonomy` contains "offline-capable", the wallet works independently.

## ERC-20 Token Operations

All token tools accept either a **contract address** (0x...) or a **token symbol** (e.g. "USDC", "DAI"). When a symbol is given, the tool resolves it to the contract address on the current chain via the MetaMask Token API. This works on mainnet and major L2s but **not on testnets** — for testnets, provide the contract address directly.

To send tokens, use `wallet_token_send` with the token (address or symbol), recipient, and amount in human-readable decimals (e.g., "100.5" for 100.5 USDC). The tool automatically queries the token's decimals and converts to raw units.

To check a token balance, use `wallet_token_balance` with the token (address or symbol).

If you need to discover a token's address, use `wallet_token_resolve` to search by name or symbol. If you need to check which token a contract is, use `wallet_token_info` to get its name, symbol, and decimals.

## Rules

- Use only the wallet tools for wallet operations.
- Do not use exec to run cast, ethers, or other scripts for sending ETH/tokens or signing.
- If a send or sign returns pending or waiting for approval, tell the user and do not retry with a different method.
- Never prompt the user to type "yes" or "allow" in chat for approval; approval happens in the user's wallet or home UI.
