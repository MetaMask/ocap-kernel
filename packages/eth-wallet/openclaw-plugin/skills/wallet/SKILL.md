---
name: wallet
description: Use the wallet tools for all balance, send, and sign operations. The away wallet operates autonomously after setup — the home device does not need to be online.
metadata: { 'openclaw': { 'emoji': '👛', 'requires': { 'bins': ['wallet'] } } }
---

# Wallet (ocap)

Use the **wallet tools** for any Ethereum balance, send, or sign request. Do not use exec or other CLIs for wallet operations.

## Tools

- **wallet_accounts** — List wallet accounts. Returns cached home accounts if the home device is offline.
- **wallet_balance** — Get ETH balance for an address. Use `wallet_accounts` first to find the right address.
- **wallet_send** — Send ETH to an address. Fully autonomous — uses delegation redemption via the bundler, no home device needed.
- **wallet_sign** — Sign a message or typed data with the local key. The signature is valid for EIP-1271 verification against the smart account address.
- **wallet_capabilities** — Check what the wallet can do (local keys, peer wallet, delegations, bundler, cached accounts, autonomy level).

## Autonomy

After setup, the away wallet is **fully autonomous** for sending ETH and signing messages. The home device only needs to be online for signing as the home EOA address specifically (which is rarely needed). Check `wallet_capabilities` — if `autonomy` contains "offline-capable", the wallet works independently.

## Rules

- Use only the wallet tools for wallet operations.
- Do not use exec to run cast, ethers, or other scripts for sending ETH or signing.
- If a send or sign returns pending or waiting for approval, tell the user and do not retry with a different method.
- Never prompt the user to type "yes" or "allow" in chat for approval; approval happens in the user's wallet or home UI.
