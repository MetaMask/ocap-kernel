# OCAP ETH Wallet: Architecture Overview

A companion document for the demo. Explains the components, how they fit together, and why the architecture matters.

---

## What is this?

The OCAP ETH Wallet is a two-device wallet system where:

- A **home device** (your laptop) holds the private keys
- An **away device** (a VPS) runs an AI agent that can spend ETH within configurable on-chain limits

The agent never touches private keys. Instead, it holds a **delegation** — a signed permission slip from the home wallet, with enforceable spending limits baked in as smart contract caveats.

---

## Components

### The Kernel

The OCAP kernel is a JavaScript runtime that enforces **object-capability (ocap) security**. Code runs inside isolated compartments called **vats**, and vats can only interact through explicit capability references — no globals, no ambient authority.

Each device runs its own kernel instance.

### Vats (isolated compartments)

The wallet subcluster consists of four vats:

| Vat | Responsibility | Isolation guarantee |
| --- | --- | --- |
| **Coordinator** | Orchestrates wallet operations, resolves signing strategies | No direct key or network access |
| **Keyring** | Holds private keys, performs signing | Keys never leave this vat |
| **Provider** | Ethereum JSON-RPC communication | Network access restricted to allowed hosts |
| **Delegation** | Manages delegations and caveats (DeleGator framework) | Pure logic, no keys or network |

The coordinator routes requests to the appropriate vat. For example, when the agent asks to sign a message, the coordinator sends the request to the keyring vat — the signature comes back, but the key never does.

### Peer Wallet (CapTP over QUIC)

The home and away kernels connect over **QUIC** (UDP) using **libp2p**. On top of that, they establish a **CapTP** (Capability Transport Protocol) channel — a protocol for passing capability references between processes.

When the away device needs a signature, the coordinator forwards the request over CapTP to the home kernel's coordinator, which asks its local keyring. The signature travels back through the same channel.

This means:
- The private key stays on the home device at all times
- The away device only ever receives signatures, never key material
- The CapTP channel is encrypted end-to-end

### Smart Accounts (ERC-4337)

Both devices create **EIP-7702 stateless DeleGator smart accounts** via MetaMask's Delegation Framework. With EIP-7702, the user's EOA address *becomes* the smart account — same address, no factory deployment or funding transfer needed. These are ERC-4337 smart contract wallets that support:

- **UserOperations** — transactions submitted through a bundler instead of directly
- **Delegations** — signed permission slips that authorize another account to act on behalf of the smart account
- **Caveat enforcers** — on-chain contracts that restrict what a delegation can do

The Pimlico bundler handles UserOp submission, gas estimation, and optional paymaster sponsorship (so the agent doesn't need ETH for gas).

### Delegations and Caveats

A **delegation** is a signed EIP-712 message that says: "I (delegator smart account) authorize this (delegate smart account) to perform actions on my behalf, subject to these caveats."

**Caveats** are restrictions enforced by on-chain contracts. The DelegationManager checks every caveat before allowing an action. If any caveat fails, the entire UserOp reverts.

Two caveat enforcers are used for spending limits:

| Enforcer | What it does | State |
| --- | --- | --- |
| `NativeTokenTransferAmountEnforcer` | Limits total cumulative ETH spend | **Stateful** — tracks spend on-chain |
| `ValueLteEnforcer` | Limits ETH per single transaction | Stateless — checks each tx independently |

Both enforcers are deployed at deterministic CREATE2 addresses (same address on every EVM chain).

### The Relay (optional)

If the home device is behind NAT (no public IP), a lightweight **libp2p relay** runs on the VPS. Both kernels connect outbound to the relay, which forwards traffic between them. The relay cannot read the CapTP-encrypted traffic.

### OpenClaw Agent + Wallet Plugin

**OpenClaw** is an AI agent framework that supports multiple channels (CLI, TUI, Telegram, web). The **wallet plugin** exposes five tools to the agent:

| Tool | What it does |
| --- | --- |
| `wallet_accounts` | Lists available Ethereum accounts |
| `wallet_balance` | Queries ETH balance from the chain |
| `wallet_sign` | Signs a personal message (EIP-191) |
| `wallet_send` | Sends ETH (via delegation UserOp if delegated) |
| `wallet_capabilities` | Reports wallet state (keys, peer, delegations, bundler) |

The plugin communicates with the kernel through the OCAP daemon's Unix socket — `yarn ocap daemon exec queueMessage`. The agent never has direct access to keys, RPC endpoints, or delegation internals.

---

## Data Flow: Sending ETH

Here's what happens when the agent sends ETH on behalf of the user:

```
1. User (Telegram) → "Send 0.001 ETH to 0x70..."
                          │
2. OpenClaw Agent         │  natural language → tool call
                          ▼
3. Wallet Plugin    wallet_send(to: 0x70..., value: 0x...)
                          │
4. OCAP Daemon      queueMessage(coordinator, "sendTransaction", [...])
                          │
5. Coordinator Vat        │  finds matching delegation with caveats
                          ▼
6. Delegation Vat   builds delegation chain, encodes execution
                          │
7. Coordinator      builds UserOp with delegation calldata
                          │
8. Provider Vat     submits UserOp to Pimlico bundler
                          │
9. Pimlico          simulates → sponsors gas → submits to mempool
                          │
10. Ethereum        DelegationManager.redeemDelegations()
                          │  checks ALL caveats:
                          │  ✓ NativeTokenTransferAmount: 0.001 < 0.05 ceiling
                          │  ✓ ValueLte: 0.001 < 0.01 per-tx max
                          ▼
11. Transfer        0.001 ETH sent to recipient
```

If any caveat check fails at step 10, the entire UserOp reverts — the ETH is not sent.

---

## Security Properties

| Property | How it's achieved |
| --- | --- |
| **Keys never leave home** | Keyring vat isolation + CapTP remote signing |
| **Agent has a hard budget** | On-chain caveat enforcers (NativeTokenTransferAmount + ValueLte) |
| **No ambient authority** | Ocap kernel: vats communicate only through explicit capability references |
| **Limits can't be bypassed** | Enforced by Ethereum smart contracts, not software checks |
| **Limits can be changed** | Revoke old delegation, create new one with different caveats |
| **Relay can't snoop** | CapTP encryption — relay only forwards opaque bytes |
| **Agent can't escalate** | Delegation is scoped — the agent can only do what the caveats allow |

---

## Demo Flow Summary

1. **Setup**: Start relay, set up home kernel (keys + smart account), set up away kernel (agent + delegation with 0.05 ETH ceiling / 0.01 ETH per-tx)
2. **Basics**: Check accounts, balances, sign a message (remote signing demo)
3. **Send within limits**: 0.001 ETH send succeeds
4. **Exceed per-tx limit**: 0.02 ETH send reverts (exceeds 0.01 per-tx)
5. **Exhaust total ceiling**: After enough sends, even small amounts revert (0.05 ceiling hit)
6. **Change limits**: Revoke old delegation, create new one
7. **Multi-channel**: Same wallet works from Telegram, TUI, CLI — any OpenClaw channel
