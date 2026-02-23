# ETH Wallet Setup Guide

This guide walks through setting up the OCAP eth-wallet on two devices:
- **Home device** (your laptop/desktop): holds the master keys, approves signing requests
- **Away device** (VPS): runs the agent with a restricted wallet, uses delegations

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

### 5d. Test it

Ask the agent:
- "What's my wallet balance?"
- "Send 0.01 ETH to 0x..."
- "Sign the message 'hello'"

The agent will call the wallet tools, which forward to the OCAP daemon, which routes through the kernel's capability system. The agent never sees private keys.

## 6. How it works

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

## 7. Verify everything works

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
