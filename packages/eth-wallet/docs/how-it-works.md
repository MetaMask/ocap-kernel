# OCAP ETH Wallet: How It Works

An overview of the components, how they fit together, and why the architecture matters.

---

## What is this?

The OCAP ETH Wallet is a two-device wallet system where:

- A **home device** (your laptop) holds the signing authority
- An **away device** (a VPS) runs an AI agent that can spend ETH within configurable on-chain limits

The agent never touches private keys. Instead, it holds a **delegation** — a signed permission slip from the home wallet, with enforceable spending limits baked in as smart contract caveats.

### Signing modes

The home device supports two signing modes:

| Mode | Script | How signing works | Smart account type |
| --- | --- | --- | --- |
| **Mnemonic** | `setup-home.sh` | Automatic — keyring signs locally | Stateless EIP-7702 (EOA = smart account) |
| **Interactive (MetaMask)** | `setup-home-interactive.sh` | MetaMask Mobile signs the delegation once during setup; agent acts autonomously after | Hybrid (separate address, auto-funded) |

The away device discovers the home's signing mode via `getCapabilities()` → `signingMode`. Values like `peer:local` (mnemonic) or `peer:external:metamask` (interactive) indicate how the home device signs — but in both modes the away device operates autonomously after setup via delegation redemption.

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

In the provided setup flow, the away device connects via `connectToPeer()`, then higher-level automation registers a back-channel with the home coordinator (`registerAwayWallet`) and sends its delegate address (`sendDelegateAddressToPeer`). This enables:

- **Automatic delegate address exchange** — the home device reads the delegate address without copy-paste
- **Delegation push** — the home device pushes signed delegations (and updated limits) directly to the away device over QUIC

When the away device needs a signature, the coordinator forwards the request over CapTP to the home kernel's coordinator, which resolves signing through its authority chain: local keyring → external signer (MetaMask) → error. The signature travels back through the same channel.

This means:

- The private key stays on the home device at all times (mnemonic mode), or on MetaMask Mobile (interactive mode)
- The away device only ever receives signatures, never key material
- The CapTP channel is encrypted end-to-end
- Setup requires no manual copy-paste — delegate address and delegation are exchanged automatically

### External Signer (Interactive Mode)

In interactive mode, the home device connects to **MetaMask Mobile** via the MetaMask SDK. A QR code is displayed in the terminal — scanning it establishes a WebSocket connection to MetaMask.

The signer object is registered as a **kernel service** via `registerKernelServiceObject()`. When the coordinator calls `E(externalSigner).signTypedData(...)`, the kernel routes it to the service manager, which invokes the method on the live MetaMask SDK object. MetaMask Mobile shows an approval dialog; the user approves; the signature flows back through the kernel. In practice, the only approval is the **delegation signing** — after that, the agent acts autonomously within the delegation's spending limits.

The MetaMask SDK must connect **before** SES lockdown (which freezes built-in prototypes). The interactive script uses dynamic imports to control this ordering.

> **Note:** MetaMask Mobile requires `EIP712Domain` to be explicitly listed in the `types` field of `eth_signTypedData_v4` requests. Without it, MetaMask computes an empty domain separator, producing invalid signatures. The `makeProviderSigner` adapter handles this automatically.

### Smart Accounts (ERC-4337)

Both devices create **DeleGator smart accounts** via MetaMask's Delegation Framework. In mnemonic mode, the home device uses **EIP-7702** to promote the EOA into a smart account (same address, no funding needed). In interactive mode, the home device uses a **Hybrid** smart account (different address, auto-funded from the EOA). The away device always uses a **Hybrid** counterfactual smart account (deploys on first UserOp). These are ERC-4337 smart contract wallets that support:

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

Spending limits are baked into the delegation's cryptographic signature. Changing them means creating a new delegation — the cumulative spending counter resets to zero. The `update-limits.sh` script handles this (see the [Setup Guide](./setup-guide.md#changing-limits)).

When the away device is connected, `update-limits.sh` revokes the old delegation(s) and pushes the new delegation directly over the existing QUIC/CapTP connection using `pushDelegationToAway()` — no copy-paste needed. If the away device is offline, it falls back to printing a manual command.

### The Relay (optional)

If the home device is behind NAT (no public IP), a lightweight **libp2p relay** runs on the VPS. Both kernels connect outbound to the relay, which forwards traffic between them. The relay cannot read the CapTP-encrypted traffic.

### OpenClaw Agent + Wallet Plugin

**OpenClaw** is an AI agent framework that supports multiple channels (CLI, TUI, Telegram, web). The **wallet plugin** exposes five tools to the agent:

| Tool | What it does |
| --- | --- |
| `wallet_accounts` | Lists available Ethereum accounts |
| `wallet_balance` | Queries ETH balance from the chain |
| `wallet_sign` | Signs a personal message (EIP-191) |
| `wallet_send` | Sends ETH (accepts decimal amounts like "0.08", converts to wei internally) |
| `wallet_capabilities` | Reports wallet state (keys, peer, delegations, bundler) |

The plugin communicates with the kernel through the OCAP daemon's Unix socket. The agent never has direct access to keys, RPC endpoints, or delegation internals.

---

## Data Flow: Sending ETH

Here's what happens when the agent sends ETH on behalf of the user:

```
1. User (Telegram) → "Send 0.01 ETH to 0x70..."
                          │
2. OpenClaw Agent         │  natural language → tool call
                          ▼
3. Wallet Plugin    wallet_send(to: 0x70..., value: "0.01")
                          │  converts to hex wei internally
                          ▼
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
                          │  ✓ NativeTokenTransferAmount: under total ceiling
                          │  ✓ ValueLte: under per-tx max
                          ▼
11. Transfer        0.01 ETH sent to recipient
```

If any caveat check fails at step 10, the entire UserOp reverts — the ETH is not sent.

---

## Security Properties

| Property | How it's achieved |
| --- | --- |
| **Keys never leave home** | Keyring vat isolation + CapTP remote signing (mnemonic mode), or MetaMask Mobile holds keys (interactive mode) |
| **Mnemonic encrypted at rest** | Optional AES-256-GCM encryption with PBKDF2-derived key; keyring starts locked on restart and requires password to unlock |
| **Agent has a hard budget** | On-chain caveat enforcers (NativeTokenTransferAmount + ValueLte) |
| **No ambient authority** | Ocap kernel: vats communicate only through explicit capability references |
| **Limits can't be bypassed** | Enforced by Ethereum smart contracts, not software checks |
| **Limits can be changed** | Create a new delegation with different caveats via `update-limits.sh` |
| **Delegations can be revoked** | `revokeDelegation` submits an on-chain `disableDelegation` UserOp — once confirmed, the delegation cannot be redeemed |
| **Relay can't snoop** | CapTP encryption — relay only forwards opaque bytes |
| **Agent can't escalate** | Delegation is scoped — the agent can only do what the caveats allow |
| **VPS runs autonomously** | Peer accounts are cached during setup; the home device can go offline after delegation is created |

---

## Offline Autonomy (VPS Mode)

After the initial setup, the away device (VPS) is **fully autonomous** — the home device does not need to stay online. This works because:

1. **Account caching** — During `connectToPeer()`, the away coordinator fetches and caches the home device's accounts in durable storage (baggage). When the home goes offline, `getAccounts()` returns the cached accounts instead of hanging. The cache is refreshed automatically whenever the home device is reachable.

2. **Delegation redemption is local** — The away device signs UserOps with its own throwaway key and submits them to the Pimlico bundler. The DelegationManager contract verifies the delegation on-chain. No home device involvement.

3. **Message signing uses the local key** — The away device signs messages and typed data with its throwaway key. For contracts that support [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271) (including SIWE/EIP-4361), the signature is valid when verified against the smart account address, since the throwaway key is the smart account's owner.

4. **Capabilities are cached** — The signing mode from `getCapabilities()` is persisted so the agent can report its state even when the home device is offline.

### What requires the home device online

| Operation | Autonomous? | Why |
| --- | --- | --- |
| `sendTransaction` (delegation) | Yes | Signed locally, submitted to bundler |
| `getAccounts` | Yes | Falls back to cached peer accounts |
| `getCapabilities` | Yes | Signing mode cached in baggage |
| `signMessage` / `signTypedData` (local key or smart account) | Yes | Throwaway key signs; valid for EIP-1271 |
| `signMessage` / `signTypedData` (as home EOA address) | **No** | Requires the home device's private key |

The last case is a fundamental limitation — signing as a specific EOA address requires that address's private key, which never leaves the home device (mnemonic mode) or MetaMask (interactive mode). When the away device detects a signing request for a cached peer account and the home is offline, it throws a descriptive error instead of silently signing with the wrong key.

### Timeout behavior

Peer calls (`getAccounts`, `getCapabilities`) race against a 5-second timeout. If the home device doesn't respond in time, the cached value is used. This prevents the agent from hanging when the home device is unreachable.
