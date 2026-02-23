# ETH Wallet Setup Guide

This guide walks through setting up the OCAP eth-wallet on two devices:
- **Home device** (your laptop/desktop): holds the master keys, approves signing requests
- **Away device** (VPS): runs the agent with a restricted wallet, uses delegations

**Contents:**
- [API keys](#api-keys) — Infura, Pimlico, and testnet ETH
- [Quick start](#quick-start-automated-scripts) — automated setup scripts
- [Manual setup](#manual-setup) — step-by-step commands
  - [1. Build the packages](#1-build-the-packages)
  - [2. Home device setup](#2-home-device-setup)
  - [3. Away device setup](#3-away-device-vps-setup)
  - [4. Delegate authority](#4-delegate-authority-from-home-to-away)
  - [5. OpenClaw plugin setup](#5-openclaw-plugin-setup)
- [Try it out](#6-try-it-out) — agent prompts and CLI commands
- [How it works](#7-how-it-works)
- [Verify everything works](#8-verify-everything-works)

## API keys

### Infura (Ethereum RPC)

1. Go to <https://developer.metamask.io>
2. Sign in with Google and create a free account
3. You should land on the dashboard with a "My First Key" visible — click the **Copy key** button on the right

### Pimlico (ERC-4337 bundler + paymaster)

1. Go to <https://dashboard.pimlico.io> and create an account
2. Generate an API key for **sepolia-testnet**
3. Go to <https://dashboard.pimlico.io/sponsorship-policies>, add an "allow all" policy, and enable it

### Testnet ETH

The home wallet's mnemonic account needs a small amount of Sepolia ETH for gas. You can get free testnet ETH from:

- <https://docs.metamask.io/developer-tools/faucet> (MetaMask / Infura faucet)
- <https://sepolia-faucet.pk910.de/> (PoW faucet, no sign-in required)

## Quick start (automated scripts)

Two bash scripts in `packages/eth-wallet/scripts/` automate everything below.

**Home device** (holds the master keys):

```bash
./scripts/setup-home.sh \
  --mnemonic "your twelve word mnemonic" \
  --infura-key YOUR_INFURA_KEY \
  --pimlico-key YOUR_PIMLICO_KEY
# Prints an ocap: URL to stdout — copy it for the away device.
```

**Away device** (VPS / agent machine):

```bash
./scripts/setup-away.sh \
  --ocap-url "ocap:…URL_FROM_HOME…" \
  --infura-key YOUR_INFURA_KEY \
  --pimlico-key YOUR_PIMLICO_KEY
```

The `--pimlico-key` configures the Pimlico bundler for ERC-4337 UserOp submission with paymaster sponsorship. Without it, smart account deployment and on-chain delegation redemption will not work.

Both scripts also accept `--chain-id` (default: Sepolia) and `--no-build`. Run with `--help` for details.

---

## Manual setup

The sections below walk through each step if you prefer to run the commands yourself.

## Prerequisites

- Node.js >= 22
- The `ocap-kernel` monorepo cloned and built
- OpenClaw installed on the VPS (for the agent integration)

## 1. Build the packages

From the monorepo root:

```bash
yarn install
yarn workspace @metamask/ocap-kernel build
yarn workspace @ocap/nodejs build
yarn workspace @ocap/eth-wallet build
```

The last command produces four `.bundle` files in `packages/eth-wallet/src/vats/`.

## 2. Home device setup

The home device holds the master wallet keys and runs a kernel daemon that the away device can connect to.

### 2a. Start the home daemon

```bash
ocap daemon start
```

This starts the OCAP daemon at `~/.ocap/daemon.sock` with persistent storage at `~/.ocap/kernel.sqlite`.

### 2b. Launch the wallet subcluster

```bash
# Get the bundle base URL (serve from a local HTTP server or use file:// URLs)
ocap start packages/eth-wallet/src/vats

# In another terminal, launch the wallet subcluster
ocap daemon exec launchSubcluster '{
  "config": {
    "bootstrap": "coordinator",
    "forceReset": true,
    "services": ["ocapURLIssuerService", "ocapURLRedemptionService"],
    "vats": {
      "coordinator": {
        "bundleSpec": "http://localhost:3000/coordinator-vat.bundle",
        "globals": ["TextEncoder", "TextDecoder", "Date"]
      },
      "keyring": {
        "bundleSpec": "http://localhost:3000/keyring-vat.bundle",
        "globals": ["TextEncoder", "TextDecoder"]
      },
      "provider": {
        "bundleSpec": "http://localhost:3000/provider-vat.bundle",
        "globals": ["TextEncoder", "TextDecoder"],
        "platformConfig": { "fetch": { "allowedHosts": ["sepolia.infura.io", "api.pimlico.io"] } }
      },
      "delegation": {
        "bundleSpec": "http://localhost:3000/delegation-vat.bundle",
        "globals": ["TextEncoder", "TextDecoder"],
        "parameters": { "delegationManagerAddress": "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" }
      }
    }
  }
}'
```

Note the `rootKref` from the output (e.g. `ko4`). This is the wallet coordinator reference.

### 2c. Initialize the keyring

```bash
# Initialize with your mnemonic (SRP)
ocap daemon exec queueMessage '["ko4", "initializeKeyring", [{"type": "srp", "mnemonic": "your twelve word mnemonic phrase here"}]]'

# Verify
ocap daemon exec queueMessage '["ko4", "getAccounts", []]'
```

### 2d. Configure the provider

```bash
ocap daemon exec queueMessage '["ko4", "configureProvider", [{"chainId": 11155111, "rpcUrl": "https://sepolia.infura.io/v3/YOUR_INFURA_KEY"}]]'
```

### 2e. Initialize remote comms (QUIC)

```bash
# Enable QUIC transport for the home kernel
# (This is done programmatically — the daemon needs QUIC init support,
# which will be added to the CLI. For now, use the Node.js API directly.)
```

### 2f. Issue an OCAP URL for the away device

```bash
ocap daemon exec queueMessage '["ko4", "issueOcapUrl", []]'
```

Save the returned `ocap:...` URL — you'll give this to the away device.

## 3. Away device (VPS) setup

### 3a. Install OpenClaw

Follow the OpenClaw installation docs. The agent will use the wallet plugin to interact with the kernel.

### 3b. Start the away daemon

```bash
ocap daemon start
```

### 3c. Launch the wallet subcluster

Same as the home device, but with the VPS's allowed hosts:

```bash
ocap start packages/eth-wallet/src/vats

ocap daemon exec launchSubcluster '{"config": { ... }}'
```

### 3d. Initialize with a throwaway key

The away wallet gets a throwaway key (for gas/own operations within delegations):

```bash
ocap daemon exec queueMessage '["ko4", "initializeKeyring", [{"type": "throwaway"}]]'
```

### 3e. Connect to the home wallet

```bash
ocap daemon exec queueMessage '["ko4", "connectToPeer", ["ocap:zgAu...YOUR_OCAP_URL_HERE"]]'
```

### 3f. Verify the connection

```bash
ocap daemon exec queueMessage '["ko4", "getCapabilities", []]'
```

Should show `hasPeerWallet: true`.

## 4. Delegate authority from home to away

On the **home device**, create a delegation for the away wallet's address:

```bash
# Get the away wallet's address first (on the away device)
ocap daemon exec queueMessage '["ko4", "getAccounts", []]'

# On the home device, create a delegation
ocap daemon exec queueMessage '["ko4", "createDelegation", [{
  "delegate": "0xAwayAddress...",
  "caveats": [],
  "chainId": 11155111
}]]'
```

Transfer the signed delegation to the away device:

```bash
# On the away device
ocap daemon exec queueMessage '["ko4", "receiveDelegation", [{ ...signed delegation JSON... }]]'
```

## 5. OpenClaw plugin setup

### 5a. Install the wallet plugin

The plugin lives in `packages/eth-wallet/openclaw-plugin/`. To load it in OpenClaw:

```bash
# From the VPS where OpenClaw is installed, load the plugin
openclaw plugin load /path/to/ocap-kernel/packages/eth-wallet/openclaw-plugin
```

Or add it to your OpenClaw config file (`~/.openclaw/config.json` or equivalent):

```json
{
  "plugins": [
    {
      "path": "/path/to/ocap-kernel/packages/eth-wallet/openclaw-plugin"
    }
  ]
}
```

The plugin requires `@sinclair/typebox` as a dependency. Install it in the plugin directory:

```bash
cd /path/to/ocap-kernel/packages/eth-wallet/openclaw-plugin
npm install
```

### 5b. Configure the plugin

In your OpenClaw plugin settings:

```json
{
  "wallet": {
    "walletKref": "ko4",
    "ocapCliPath": "/path/to/ocap"
  }
}
```

### 5c. Allow wallet tools for your agent

In your agent configuration:

```json
{
  "tools": {
    "allow": ["wallet_balance", "wallet_send", "wallet_sign", "wallet_accounts", "wallet_capabilities"]
  }
}
```

## 6. Try it out

The wallet can be used via the agent (OpenClaw plugin) or directly through `ocap daemon exec`. All commands below route through the kernel's capability system — the caller never touches private keys.

### Via the agent (OpenClaw)

Ask the agent natural-language questions and it will invoke the corresponding wallet tools:

- "What are my wallet accounts?"
- "What's the balance of 0x71fA...?"
- "Sign the message 'hello world'"
- "Send 0.001 ETH to 0x70997970c51812dc3a010c7d01b50e0d17dc79c8"
- "What capabilities does my wallet have?"

### Via the CLI

You can also call the wallet coordinator directly. Replace `ko4` with your `rootKref`.

```bash
# List accounts
ocap daemon exec queueMessage '["ko4", "getAccounts", []]'

# Check capabilities (local keys, peer wallet, delegations, bundler)
ocap daemon exec queueMessage '["ko4", "getCapabilities", []]'

# Sign a message
ocap daemon exec queueMessage '["ko4", "signMessage", ["hello world"]]'

# Sign a transaction
ocap daemon exec queueMessage '["ko4", "signTransaction", [{"to": "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", "value": "0x2386F26FC10000", "chainId": 11155111}]]'

# Query the chain (eth_getBalance, eth_blockNumber, etc.)
ocap daemon exec queueMessage '["ko4", "request", ["eth_getBalance", ["0x71fA1599e6c6FE46CD2A798E136f3ba22863cF82", "latest"]]]'
ocap daemon exec queueMessage '["ko4", "request", ["eth_blockNumber", []]]'

# Create a delegation for another address
ocap daemon exec queueMessage '["ko4", "createDelegation", [{"delegate": "0x...", "caveats": [], "chainId": 11155111}]]'

# List active delegations
ocap daemon exec queueMessage '["ko4", "listDelegations", []]'
```

## 7. How it works

```
Agent (AI)
  │
  ├─ wallet_balance  ──→  OpenClaw Plugin
  ├─ wallet_send     ──→       │
  └─ wallet_sign     ──→       │
                                │
                         ocap daemon exec queueMessage
                                │
                          OCAP Daemon (Unix socket)
                                │
                          Kernel ─→ Coordinator Vat
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                 │
              Keyring Vat     Provider Vat     Delegation Vat
              (keys stay      (JSON-RPC)       (Gator framework)
               here)
                    │
              ┌─────┴─────┐
              │            │
         Local key    Peer wallet
         signing      (CapTP to home)
```

## 8. Verify everything works

Run the automated tests to confirm the setup:

```bash
# Unit tests (mocked)
yarn workspace @ocap/eth-wallet test:dev:quiet

# Single-kernel integration (real SES + kernel)
yarn workspace @ocap/eth-wallet test:node

# Two-kernel peer wallet over QUIC
yarn workspace @ocap/eth-wallet test:node:peer

# Daemon integration (JSON-RPC socket)
yarn workspace @ocap/eth-wallet test:node:daemon

# Sepolia E2E (requires API keys)
PIMLICO_API_KEY=xxx SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/xxx \
  yarn workspace @ocap/eth-wallet test:node:sepolia
```
