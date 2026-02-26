# ETH Wallet Demo Script

A step-by-step demo that showcases the full OCAP eth-wallet capabilities: accounts, balances, signing, sending, delegations with spending limits, and on-chain enforcement.

## Prerequisites

### Sepolia ETH required

The home wallet's EOA should hold **~1 ETH** on Sepolia. This is the user's personal wallet — the demo shows funds flowing from this wallet through the delegation system. With EIP-7702, the EOA *is* the smart account (same address), so no funding transfer is needed during setup.

| Purpose                                | Amount     |
| -------------------------------------- | ---------- |
| Demo sends (multiple small txs)        | ~0.05 ETH  |
| Gas for EOA transactions               | ~0.005 ETH |
| Buffer for retries / re-setup          | ~0.95 ETH  |

**For the video**: having a round ~1 ETH balance makes the demo cleaner. The audience sees the user starts with 1 ETH, delegates a budget to the agent, and the balance decreases as the agent spends.

Get free Sepolia ETH from:

- <https://docs.metamask.io/developer-tools/faucet> (MetaMask / Infura faucet)
- <https://sepolia-faucet.pk910.de/> (PoW faucet, no sign-in)

### API keys

| Service | Purpose                      | How to get                                                       |
| ------- | ---------------------------- | ---------------------------------------------------------------- |
| Infura  | Sepolia JSON-RPC             | <https://developer.metamask.io>                                  |
| Pimlico | ERC-4337 bundler + paymaster | <https://dashboard.pimlico.io> (create a sponsorship policy too) |

### Software

- Node.js >= 22
- yarn
- OpenClaw installed on the VPS: `curl -fsSL https://openclaw.ai/install.sh | bash`
- (Optional) Telegram channel connected to OpenClaw

### Network

- Two machines: your laptop (home) and a VPS (away)
- Both need outbound HTTPS
- If home is behind NAT: start the relay on the VPS first (see setup guide)
- If both have public IPs: open UDP 4002 on both

---

## Part 1: Setup (both devices)

> **Caption:** "Setting up two devices: a laptop (home) that holds the keys, and a VPS (away) that runs the AI agent."

### 1a. Home device

```bash
./packages/eth-wallet/scripts/setup-home.sh \
  --mnemonic "your twelve word mnemonic phrase here" \
  --infura-key YOUR_INFURA_KEY \
  --pimlico-key YOUR_PIMLICO_KEY \
  --relay "/ip4/<VPS_IP>/tcp/9001/ws/p2p/12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc"
```

> **Caption:** "The home script initializes the wallet and creates a smart account via EIP-7702 (no deployment or funding needed — the EOA becomes the smart account)."

The script will:

1. Build packages
2. Start the daemon and initialize QUIC networking
3. Launch the wallet subcluster
4. Initialize the keyring with your mnemonic
5. Configure the Sepolia provider and Pimlico bundler
6. Create an EIP-7702 smart account (EOA address becomes the smart account)
7. Issue an OCAP URL

Copy the **OCAP URL** and **listen addresses** to the VPS.

### 1b. Away device (VPS)

```bash
./packages/eth-wallet/scripts/setup-away.sh \
  --ocap-url "ocap:...FROM_HOME..." \
  --listen-addrs '["/ip4/.../udp/.../quic-v1/p2p/..."]' \
  --infura-key YOUR_INFURA_KEY \
  --pimlico-key YOUR_PIMLICO_KEY \
  --relay "/ip4/<VPS_IP>/tcp/9001/ws/p2p/12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc"
```

> **Caption:** "The away script connects to the home kernel over QUIC. The two devices are now linked via an encrypted CapTP channel."

When it finishes, it shows a **delegate address**. Copy it to the home terminal.

### 1c. Delegation with spending limits (home terminal)

The home script prompts:

```
→ Paste the delegate address from the away device: 0x...

→ Total ETH spending limit (e.g. 0.1, or Enter for unlimited): 0.05
→ Max ETH per transaction (e.g. 0.01, or Enter for unlimited): 0.01
```

**For the demo, enter:**

- Total limit: **0.05** (the agent can spend 0.05 ETH total across all txs)
- Per-tx limit: **0.01** (no single tx can exceed 0.01 ETH)

> **Caption:** "The user delegates authority to the agent with on-chain spending limits: 0.05 ETH total budget, max 0.01 ETH per transaction. These are enforced by smart contracts — the agent cannot bypass them."

The script creates the delegation and prints the delegation JSON. Copy it to the away terminal.

### 1d. Install the OpenClaw plugin (VPS)

```bash
openclaw plugins install -l ./packages/eth-wallet/openclaw-plugin
openclaw plugins enable wallet
openclaw config set tools.allow '["wallet"]'
openclaw gateway restart
```

> **Caption:** "The wallet plugin gives the AI agent five tools: accounts, balance, sign, send, and capabilities."

### 1e. Connect Telegram (optional)

Follow <https://docs.openclaw.ai/channels/telegram> to connect a Telegram channel. Once connected, you can send messages to the agent from Telegram instead of the OpenClaw TUI.

---

## Part 2: Demo — Basic Wallet Operations

These messages can be sent via **Telegram**, **OpenClaw TUI**, or any connected channel.

### Scene 1: Show the user's wallet (establish baseline)

> **Caption:** "The user's wallet on Sepolia. Started with ~1 ETH — all funds remain in the EOA (which is now the smart account via EIP-7702)."

**You send:**

> What's the balance of my wallet?

**Expected response:** The agent calls `wallet_balance` and shows something like:

> Account 0x71fA...: **~1 ETH** (close to the starting balance)

_(The balance will be close to 1 ETH since EIP-7702 setup requires no funding transfer.)_

---

> **Caption:** "The agent on the VPS can see the account — but the private key stays on the home device."

**You send:**

> What are my wallet accounts?

**Expected response:** Lists the home EOA address (e.g. `0x71fA...`).

---

> **Caption:** "Capabilities: local keys, peer connection to home wallet, 1 delegation with spending limits, smart account ready."

**You send:**

> What capabilities does my wallet have?

**Expected response:** The agent calls `wallet_capabilities` and shows:

- `hasLocalKeys: true`
- `hasPeerWallet: true`
- `delegationCount: 1`
- `hasBundlerConfig: true`
- `smartAccountAddress: 0x...`

### Scene 2: Message signing (remote, via peer wallet)

> **Caption:** "Signing happens remotely. The request travels over encrypted QUIC to the home device. Only the signature comes back — never the key."

**You send:**

> Sign the message "Hello from the demo"

**Expected response:** The agent calls `wallet_sign` and returns a 65-byte hex signature.

---

## Part 3: Demo — Spending Limits in Action

### Scene 3: Send within limits (succeeds)

> **Caption:** "Sending 0.001 ETH. Within both limits (0.01 per-tx, 0.05 total)."

**You send:**

> Send 0.001 ETH to 0xB7F0e260caAf929c3Bf9a2C9ccEabf20F5615Ca1

**Expected response:** The agent calls `wallet_send`, which:

1. Finds the delegation (with caveats)
2. Builds a UserOp with the delegation chain
3. Submits to the Pimlico bundler
4. Returns the transaction hash

---

> **Caption:** "Balance decreased. The ETH came from the user's EOA (acting as a smart account via EIP-7702) — real funds, delegated to the agent with restrictions."

**You send:**

> What's my wallet balance now?

**Expected response:** The balance should be slightly less than before (minus ~0.001 ETH).

### Scene 4: Exceed per-transaction limit (reverts)

> **Caption:** "Attempting 0.02 ETH — exceeds the 0.01 per-tx limit."

**You send:**

> Send 0.02 ETH to 0xB7F0e260caAf929c3Bf9a2C9ccEabf20F5615Ca1

**Expected response:** The agent tries to send but gets an error. The bundler rejects the UserOp during simulation because the `ValueLteEnforcer` reverts.

---

> **Caption:** "Blocked by on-chain enforcement. No ETH was spent. This isn't a software check — it's a smart contract on Ethereum."

**You send:**

> What's my balance?

**Expected response:** Same as before the failed send — no ETH was deducted.

### Scene 5: Accumulate spend toward the ceiling

> **Caption:** "Each send is within the per-tx limit. The total spend is tracked on-chain by the NativeTokenTransferAmountEnforcer."

**You send:**

> Send 0.009 ETH to 0xB7F0e260caAf929c3Bf9a2C9ccEabf20F5615Ca1

This succeeds (0.009 < 0.01 per-tx, running total = 0.001 + 0.009 = 0.01 < 0.05 total).

**You send:**

> Send 0.01 ETH to 0xB7F0e260caAf929c3Bf9a2C9ccEabf20F5615Ca1

Succeeds again (running total = 0.02 ETH, still under 0.05 ceiling). Repeat one or two more times.

### Scene 6: Exhaust total ceiling (reverts)

After enough sends to approach the 0.05 ETH total ceiling, the next send — even if within the per-tx limit — will be blocked.

> **Caption:** "Total budget exhausted. 0.01 ETH is within the per-tx limit, but the agent already spent its 0.05 ETH ceiling."

**You send:**

> Send 0.01 ETH to 0xB7F0e260caAf929c3Bf9a2C9ccEabf20F5615Ca1

_(When the running total would exceed 0.05 ETH.)_

**Expected response:** Error — the NativeTokenTransferAmountEnforcer tracks cumulative spend on-chain and blocks the transaction.

---

> **Caption:** "Balance unchanged. The agent has a hard budget — no trust required."

**You send:**

> What's my balance?

**Expected response:** Balance is still the same as before the failed send.

---

## Part 4: Demo — Changing Limits

### Scene 7: Revoke and re-delegate

> **Caption:** "Spending limits are immutable — baked into the delegation's on-chain caveats. To change them: revoke the old delegation, create a new one."

**On the home device CLI:**

```bash
# List the delegation ID
yarn ocap daemon exec queueMessage '["ko4", "listDelegations", []]'

# Revoke it
yarn ocap daemon exec queueMessage '["ko4", "revokeDelegation", ["0xDELEGATION_ID"]]'
```

Then create a new delegation with different limits:

```bash
# Re-run the delegation step of setup-home.sh, or manually:
yarn ocap daemon exec queueMessage '["ko4", "createDelegation", [{
  "delegate": "0xAWAY_SMART_ACCOUNT",
  "caveats": [
    {"type": "nativeTokenTransferAmount", "enforcer": "0xF71af580b9c3078fbc2BBF16FbB8EEd82b330320", "terms": "0x00000000000000000000000000000000000000000000000000b1a2bc2ec50000"},
    {"type": "valueLte", "enforcer": "0x92Bf12322527cAA612fd31a0e810472BBB106A8F", "terms": "0x000000000000000000000000000000000000000000000000002386f26fc10000"}
  ],
  "chainId": 11155111
}]]'
```

_(The terms above encode 0.05 ETH total and 0.01 ETH per-tx — adjust as needed.)_

Transfer the new delegation to the away device, and the agent can start spending again with the new budget.

> **Caption:** "Old delegation permanently invalidated. New delegation starts with a fresh budget."

---

## Part 5: Demo — Multi-Channel Interaction

### Scene 8: Switch from OpenClaw TUI to Telegram

> **Caption:** "Same wallet, different channel. Switching from the terminal to Telegram."

If you set up Telegram earlier, switch channels mid-demo:

1. Show the OpenClaw TUI with the conversation so far
2. Open Telegram on your phone
3. Send a message to the bot:

**You send (Telegram):**

> What's my wallet balance?

**Expected response:** Same as before — the agent responds via Telegram with the balance.

**You send (Telegram):**

> Send 0.001 ETH to 0xB7F0e260caAf929c3Bf9a2C9ccEabf20F5615Ca1

**Expected response:** Transaction succeeds (if within limits) or fails (if limits exhausted).

> **Caption:** "Telegram, CLI, web — any channel. Same kernel, same keys, same spending limits."

### Scene 9: Architecture recap

> **Caption overlay (or separate slide):**

```
Telegram / Web / TUI
       │
    OpenClaw Agent
       │
    Wallet Plugin (wallet_send, wallet_balance, ...)
       │
    yarn ocap daemon exec queueMessage
       │
    OCAP Daemon (Unix socket)
       │
    Kernel → Coordinator Vat
              │
    ┌─────────┼──────────┐
    │         │          │
 Keyring   Provider  Delegation
 (keys)    (RPC)     (caveats)
    │
    ├── Local signing
    └── Peer wallet (CapTP → home device over QUIC)
```

> **Caption:** "Private keys on the home device. Agent on the VPS holds a delegation — a restricted permission slip with on-chain spending limits. The kernel enforces capability discipline at every layer."

---

## Timing

| Part                      | Duration      | Notes                                                                |
| ------------------------- | ------------- | -------------------------------------------------------------------- |
| Setup (Part 1)            | 5-10 min      | Can be sped up in editing; mostly waiting for on-chain confirmations |
| Basic operations (Part 2) | 2-3 min       | Fast — signing and balance checks                                    |
| Spending limits (Part 3)  | 5-8 min       | UserOp submission takes ~15-30s per send                             |
| Changing limits (Part 4)  | 2-3 min       | CLI commands on home device                                          |
| Multi-channel (Part 5)    | 2-3 min       | Show Telegram or skip if not set up                                  |
| **Total**                 | **16-27 min** | Can be cut to ~10 min with time-lapses on setup + waiting            |

## Troubleshooting

- **"No delegation found"** — The delegation wasn't transferred to the away device. Re-run the transfer step.
- **UserOp takes too long** — Sepolia block times vary. Wait up to 2 minutes.
- **"Peer wallet not connected"** — Check that the relay is running and both devices can reach it. Verify with `yarn ocap daemon exec getStatus`.
- **Out of Sepolia ETH** — The paymaster covers UserOp gas, but the EOA needs ETH for the initial funding tx. Use the faucets above.
- **Pimlico errors** — Check your sponsorship policy is active at <https://dashboard.pimlico.io/sponsorship-policies>.
