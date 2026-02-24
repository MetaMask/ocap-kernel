---
name: wallet
description: Use the wallet tools for all balance, send, and sign operations. All wallet actions go through the away kernel; some actions may require user approval at home.
metadata: { 'openclaw': { 'emoji': '👛', 'requires': { 'bins': ['wallet'] } } }
---

# Wallet (ocap)

Use the **wallet tools** for any Ethereum balance, send, or sign request. Do not use exec or other CLIs for wallet operations.

## Tools

- **wallet_balance** — Get ETH balance for an address (address required, e.g. `0x71fA...`). Use `wallet_accounts` first to get an address if needed.
- **wallet_send** — Send ETH to an address. May require user approval at home; the agent cannot approve for the user.
- **wallet_sign** — Sign a message or typed data. May require user approval at home.

## Rules

- Use only the wallet_balance, wallet_send, and wallet_sign tools for wallet operations.
- Do not use exec to run cast, ethers, or other scripts for sending ETH or signing.
- If a send or sign returns pending or waiting for approval, tell the user and do not retry with a different method.
- Never prompt the user to type "yes" or "allow" in chat for approval; approval happens in the user's wallet or home UI.
