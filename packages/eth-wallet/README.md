# @ocap/eth-wallet

A capability-driven Ethereum wallet implemented as an OCAP kernel subcluster. It uses the [MetaMask Delegation Framework (Gator)](https://github.com/MetaMask/delegation-framework) for delegated transaction authority via ERC-4337 UserOperations. The wallet subcluster isolates key management, Ethereum RPC communication, and delegation lifecycle into separate vats, enforcing the principle of least authority across the entire signing pipeline.

For a deeper explanation of the components and data flow, see [How It Works](./docs/how-it-works.md). For deploying the wallet on a home device + VPS with OpenClaw, see the [Setup Guide](./docs/setup-guide.md).

## Security model and known limitations

- **Peer signing has no interactive approval for message/typed-data requests.** Transaction signing over peer requests is now disabled and peer-connected wallets must use delegation redemption for sends, but message and typed-data peer signing still execute immediately without an approval prompt.
- **`revokeDelegation()` is local-only.** Revoking a delegation removes it from the local store but does not submit an on-chain revocation. A party holding a copy of the signed delegation can still redeem it on-chain. On-chain revocation via the DelegationManager contract is planned.
- **Mnemonic is stored in plaintext.** The keyring vat persists the mnemonic to the kernel's durable store (SQLite) without encryption. Filesystem access to the kernel database exposes the key material.
- **Throwaway keyring needs secure entropy.** `initializeKeyring({ type: 'throwaway' })` requires either `crypto.getRandomValues` in the runtime or caller-provided entropy via `{ type: 'throwaway', entropy: '0x...' }`. Under SES lockdown (where `crypto` is unavailable inside vat compartments), the caller must generate 32 bytes of entropy externally and pass it in.

## Architecture

The wallet is composed of four vats within a single kernel subcluster. The **coordinator** vat acts as the bootstrap vat and public API surface. It orchestrates signing strategy resolution, delegation redemption, and peer wallet communication by dispatching to the other three vats via `E()` (eventual send).

```
                        +-----------------------+
                        |   Coordinator Vat     |
                        |   (bootstrap / API)   |
                        |                       |
                        |  - Signing strategy   |
                        |    resolution         |
                        |  - Delegation         |
                        |    redemption         |
                        |  - Peer wallet        |
                        |    communication      |
                        +--+------+------+------+
                           |      |      |
              E()          |      |      |         E()
          +----------------+      |      +------------------+
          |                       |                         |
          v                       v                         v
+-------------------+  +-------------------+  +------------------------+
|   Keyring Vat     |  |   Provider Vat    |  |   Delegation Vat       |
|                   |  |                   |  |                        |
| - HD key deriv.   |  | - Ethereum        |  | - Create / store       |
| - Throwaway keys  |  |   JSON-RPC        |  |   delegations          |
| - Transaction     |  | - Broadcast tx    |  | - EIP-712 typed data   |
|   signing         |  | - Bundler RPC     |  |   preparation          |
| - Message signing |  |   (UserOp submit, |  | - Action matching      |
| - Typed data      |  |    gas estimate)  |  | - Revocation           |
|   signing         |  |                   |  |                        |
+-------------------+  +-------------------+  +------------------------+

Keys NEVER leave        Network I/O only       Pure delegation logic
the keyring vat                                 (no keys, no network)
```

### Vat Responsibilities

**Coordinator vat** -- The bootstrap vat and sole public API surface. Resolves which signing strategy to use for each request (delegation, local key, external signer, or peer wallet). Builds and submits ERC-4337 UserOperations for delegation redemption. Manages peer wallet connectivity via OCAP URLs.

**Keyring vat** -- Isolates private key material. Supports two initialization modes: `srp` (BIP-39 mnemonic with BIP-44 HD derivation at `m/44'/60'/0'/0/{index}`) and `throwaway` (a single randomly generated private key). Signs transactions, personal messages, and EIP-712 typed data. Keys never leave this vat.

**Provider vat** -- Handles all Ethereum JSON-RPC communication. Wraps a [viem](https://viem.sh/) transport for standard RPC calls (`eth_call`, `eth_getBalance`, etc.), transaction broadcasting, and ERC-4337 bundler RPC (`eth_sendUserOperation`, `eth_estimateUserOperationGas`).

**Delegation vat** -- Manages the lifecycle of Gator delegations: creation, EIP-712 signing preparation, storage, action matching, and revocation. Accepts incoming signed delegations from peer wallets. Contains no key material and performs no network I/O.

## Home vs. Away Kernel Setup

The wallet supports a two-kernel topology where a **home kernel** (the user's device) delegates authority to an **away kernel** (a remote server or secondary device). The two kernels connect via OCAP URLs over QUIC or TCP.

### Home Kernel

The home kernel is the authority holder. It typically has MetaMask connected as an external signer (no local keyring needed). It creates delegations and shares them with the away kernel.

```typescript
import {
  makeWalletClusterConfig,
  connectMetaMaskSigner,
} from '@ocap/eth-wallet';

// 1. Launch the wallet subcluster
const config = makeWalletClusterConfig({ bundleBaseUrl: '/bundles' });
const { rootKref } = await kernel.launchSubcluster(config);

// 2. Connect MetaMask as external signer
const signer = await connectMetaMaskSigner({
  dappMetadata: { name: 'My dApp', url: 'https://example.com' },
});
await coordinator.connectExternalSigner(signer);

// 3. Configure the bundler for ERC-4337 UserOps
await coordinator.configureBundler({
  bundlerUrl: 'https://bundler.example.com/rpc',
  chainId: 1,
});

// 4. Issue an OCAP URL and share it with the away kernel
const ocapUrl = await coordinator.issueOcapUrl();
// Send ocapUrl to the away kernel via any out-of-band channel

// 5. Read the delegate address sent by the away kernel (automatic)
const delegateAddress = await coordinator.getDelegateAddress();
// Falls back to manual input if the away kernel hasn't connected yet

// 6. Create a delegation for the away kernel's address
const delegation = await coordinator.createDelegation({
  delegate: delegateAddress ?? ('0xAwayAddress...' as Address),
  caveats: [
    makeCaveat({
      type: 'allowedTargets',
      terms: encodeAllowedTargets(['0xContractAddress...' as Address]),
    }),
    makeCaveat({
      type: 'valueLte',
      terms: encodeValueLte(1000000000000000000n), // 1 ETH max
    }),
  ],
  chainId: 1,
});

// 7. Push the delegation to the away kernel (automatic over QUIC/CapTP)
await coordinator.pushDelegationToAway(delegation);
```

### Away Kernel

The away kernel receives delegated authority. It initializes a throwaway keyring and redeems delegations by building ERC-4337 UserOperations. When connecting to the home kernel, it automatically sends its delegate address and registers a back-channel for receiving delegations — no manual copy-paste needed.

```typescript
import { makeWalletClusterConfig } from '@ocap/eth-wallet';

// 1. Launch the wallet subcluster with a throwaway keyring
const config = makeWalletClusterConfig({ bundleBaseUrl: '/bundles' });
const { rootKref } = await kernel.launchSubcluster(config);
// Under SES lockdown, pass entropy generated outside the vat:
const entropy = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')}`;
await coordinator.initializeKeyring({ type: 'throwaway', entropy });

// 2. Connect to the home kernel via the OCAP URL
// This automatically:
//   - Caches peer accounts for offline use
//   - Registers a back-channel (registerAwayWallet) for delegation push
//   - Sends the delegate address to the home device
await coordinator.connectToPeer(ocapUrl);

// 3. The home device pushes the delegation automatically via pushDelegationToAway().
//    Alternatively, receive it manually:
// await coordinator.receiveDelegation(delegation);

// 4. Configure the bundler
await coordinator.configureBundler({
  bundlerUrl: 'https://bundler.example.com/rpc',
  chainId: 1,
});

// 5. Redeem the delegation via a UserOp
const userOpHash = await coordinator.redeemDelegation({
  execution: {
    target: '0xContractAddress...' as Address,
    value: '0x0' as Hex,
    callData: '0x...' as Hex,
  },
  delegationId: delegation.id,
  maxFeePerGas: '0x3b9aca00' as Hex,
  maxPriorityFeePerGas: '0x3b9aca00' as Hex,
});
```

### Peer Wallet Communication

When the away kernel connects via `connectToPeer()`, it automatically registers a back-channel with the home coordinator and sends its delegate address. This enables the home device to push delegations and read the delegate address without manual copy-paste.

If the away kernel has no local keys and no matching delegation for a message or typed-data signing request, it falls back to the peer wallet (the home kernel's coordinator). The signing request is forwarded over the OCAP URL connection, and the home kernel signs it using its own keyring or external signer. Transaction signing (`signTransaction`) does not have a peer fallback — the away kernel must use delegation redemption for sends.

```
  Away Kernel                           Home Kernel
  +-----------+                         +-----------+
  |Coordinator|  -- signing request --> |Coordinator|
  |           |                         |           |
  |  (no keys)|                         |  Keyring  |
  |           |  <-- signature -------- |  or       |
  |           |                         |  MetaMask |
  +-----------+                         +-----------+
       ^                                      ^
       |          OCAP URL over QUIC/TCP      |
       +--------------------------------------+
```

### Offline Autonomy

The away kernel caches the home kernel's accounts and signing mode during `connectToPeer()`. After the delegation is transferred, the home device can go offline — the away kernel operates fully autonomously:

- `getAccounts()` returns cached peer accounts (with a 5-second timeout on live peer calls)
- `getCapabilities()` returns cached signing mode
- `sendTransaction()` signs locally and submits via the bundler (no home needed)
- `signMessage()` / `signTypedData()` signs with the local throwaway key

The only operation that still requires the home online is signing as the home EOA address specifically (since that requires the home's private key). The away coordinator detects this and throws a clear error instead of signing with the wrong key. See [How It Works — Offline Autonomy](./docs/how-it-works.md#offline-autonomy-vps-mode) for details.

## Signing Strategy Resolution

The coordinator resolves the appropriate signer for each request type using a priority chain.

### Transaction Signing

Priority: delegation -> local key -> external signer -> peer wallet -> error

1. **Delegation** -- If a stored delegation matches the transaction's action (target, value, data), the coordinator signs via the local keyring.
2. **Local key** -- If the keyring owns the `from` account, it signs directly.
3. **External signer** -- If a MetaMask or other external signer is connected, it signs.
4. **Peer wallet** -- If a peer wallet is connected, the request is forwarded.

### Message and Typed Data Signing

Priority: peer account guard -> keyring -> external signer -> peer wallet -> error

1. **Peer account guard** -- If `from` matches a cached peer (home) account, the request is routed to the peer wallet. If the peer is offline, a descriptive error is thrown instead of silently signing with the wrong key.
2. **Keyring** -- If the keyring has keys, it signs directly.
3. **External signer** -- If a MetaMask or other external signer is connected, it signs.
4. **Peer wallet** -- If a peer wallet is connected, the request is forwarded.

## Delegation Flow

Delegations use the MetaMask Delegation Framework (Gator). A delegation grants a **delegate** address the authority to act on behalf of a **delegator** address, subject to **caveats** (on-chain enforced restrictions).

### Creating a Delegation

The delegator signs an EIP-712 typed data payload that binds the delegation parameters. The DelegationManager contract is the verifying contract.

```typescript
import {
  makeCaveat,
  encodeAllowedTargets,
  encodeAllowedMethods,
  encodeValueLte,
  encodeTimestamp,
  encodeLimitedCalls,
  encodeErc20TransferAmount,
} from '@ocap/eth-wallet';

const delegation = await coordinator.createDelegation({
  delegate: '0xDelegateAddress...' as Address,
  caveats: [
    makeCaveat({
      type: 'allowedTargets',
      terms: encodeAllowedTargets(['0xContract...' as Address]),
    }),
    makeCaveat({
      type: 'allowedMethods',
      terms: encodeAllowedMethods(['0xa9059cbb' as Hex]), // transfer(address,uint256)
    }),
    makeCaveat({
      type: 'valueLte',
      terms: encodeValueLte(0n), // No ETH value allowed
    }),
  ],
  chainId: 1,
});
```

### Supported Caveats

| Caveat Type           | Description                                       | Encoder                     |
| --------------------- | ------------------------------------------------- | --------------------------- |
| `allowedTargets`      | Restrict to specific contract addresses           | `encodeAllowedTargets`      |
| `allowedMethods`      | Restrict to specific function selectors (4 bytes) | `encodeAllowedMethods`      |
| `valueLte`            | Cap the ETH value per call                        | `encodeValueLte`            |
| `erc20TransferAmount` | Cap the ERC-20 token transfer amount              | `encodeErc20TransferAmount` |
| `limitedCalls`        | Limit total number of calls                       | `encodeLimitedCalls`        |
| `timestamp`           | Restrict usage to a time window (unix seconds)    | `encodeTimestamp`           |

### Sharing Delegations

Delegations can be shared between kernels in three ways:

- **Automatic push (recommended)** -- When the away device connects via `connectToPeer()`, it registers a back-channel with the home coordinator. The home device can then push delegations directly via `pushDelegationToAway(delegation)`. The setup scripts and `update-limits.sh` use this automatically.
- **Direct** -- Call `coordinator.receiveDelegation(delegation)` on the receiving kernel, passing the signed delegation object.
- **OCAP URL** -- The home kernel issues an OCAP URL, and the away kernel redeems it to obtain a reference to the home coordinator, then receives delegations via method calls.

### Redeeming Delegations

Redemption builds an ERC-4337 UserOperation that calls `DelegationManager.redeemDelegations` on-chain. The UserOp is signed by the delegate and submitted to a bundler, which routes it through the EntryPoint v0.7 contract.

```typescript
const userOpHash = await coordinator.redeemDelegation({
  execution: {
    target: '0xTokenContract...' as Address,
    value: '0x0' as Hex,
    callData: '0xa9059cbb...' as Hex, // transfer(address,uint256) encoded
  },
  delegationId: delegation.id,
  // OR: action: { to: '0x...', value: '0x0', data: '0x...' } for automatic matching
  maxFeePerGas: '0x3b9aca00' as Hex,
  maxPriorityFeePerGas: '0x3b9aca00' as Hex,
});
```

## API Reference

### Coordinator -- Lifecycle

| Method                           | Description                                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bootstrap(vats, services)`      | Called by the kernel during subcluster launch. Wires up vat references.                                                                                                     |
| `initializeKeyring(options)`     | Initialize the keyring vat. Options: `{ type: 'srp', mnemonic }` or `{ type: 'throwaway', entropy? }`. Under SES lockdown, pass `entropy` (32-byte hex) for throwaway keys. |
| `configureProvider(chainConfig)` | Configure the provider vat with an RPC URL and chain ID.                                                                                                                    |
| `connectExternalSigner(signer)`  | Connect an external signing backend (e.g., MetaMask).                                                                                                                       |
| `configureBundler(config)`       | Configure the ERC-4337 bundler. Accepts `{ bundlerUrl, chainId, entryPoint?, usePaymaster?, sponsorshipPolicyId? }`.                                                        |

### Coordinator -- Signing

| Method                           | Description                                        |
| -------------------------------- | -------------------------------------------------- |
| `signTransaction(tx)`            | Sign a transaction using strategy resolution.      |
| `sendTransaction(tx)`            | Sign and broadcast a transaction via the provider. |
| `signMessage(message, account?)` | Sign a personal message (EIP-191).                 |
| `signTypedData(data, from?)`     | Sign EIP-712 typed data.                           |
| `request(method, params?)`       | Forward a raw JSON-RPC request to the provider.    |

### Coordinator -- Delegation

| Method                          | Description                                                        |
| ------------------------------- | ------------------------------------------------------------------ |
| `createDelegation(opts)`        | Create and sign a new delegation. Returns the signed `Delegation`. |
| `receiveDelegation(delegation)` | Store a signed delegation received from a peer.                    |
| `revokeDelegation(id)`          | Mark a delegation as revoked (local state only).                   |
| `listDelegations()`             | List all stored delegations.                                       |
| `redeemDelegation(options)`     | Build, sign, and submit a UserOp to redeem a delegation.           |

### Coordinator -- Peer Connectivity

| Method                               | Description                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `issueOcapUrl()`                     | Issue an OCAP URL that grants a reference to this coordinator. Requires `ocapURLIssuerService`.                            |
| `connectToPeer(ocapUrl)`             | Connect to a remote coordinator via an OCAP URL. Caches peer accounts, registers back-channel, and sends delegate address. |
| `refreshPeerAccounts()`              | Re-fetch and cache peer accounts. Throws if no peer wallet is connected.                                                   |
| `registerAwayWallet(awayRef)`        | Register an away wallet reference for delegation push. Called automatically by the away device during `connectToPeer`.     |
| `pushDelegationToAway(delegation)`   | Push a signed delegation to the registered away wallet over CapTP. Throws if no away wallet is registered.                 |
| `registerDelegateAddress(address)`   | Store a delegate address received from the away device. Called automatically via `sendDelegateAddressToPeer`.              |
| `getDelegateAddress()`               | Return the pending delegate address sent by the away device, or `undefined` if none.                                       |
| `sendDelegateAddressToPeer(address)` | Send this device's delegate address to the connected peer (home) device. Called automatically during `connectToPeer`.      |
| `handleSigningRequest(request)`      | Handle an incoming signing request from a peer wallet.                                                                     |

### Coordinator -- Introspection

| Method              | Description                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `getAccounts()`     | List accounts. Returns cached peer accounts when the home device is offline (5s timeout).     |
| `getCapabilities()` | Return a `WalletCapabilities` object describing the wallet state, including cached peer info. |

### Coordinator -- Smart Accounts

| Method                       | Description                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createSmartAccount(config)` | Create a smart account. Accepts `{ chainId, implementation?, deploySalt?, address? }`. Default implementation is `'hybrid'` (counterfactual, deploys on first UserOp). `'stateless7702'` is also supported but requires RPC providers that expose EIP-7702 designator codes via `eth_getCode` (see note below). |
| `getSmartAccountAddress()`   | Return the smart account address, if configured.                                                                                                                                                                                                                                                                |

**Note on smart account implementations:** The `stateless7702` implementation uses EIP-7702 to promote the EOA into a DeleGator smart account — same address, no separate contract or funding needed. The home device uses this by default. The `hybrid` implementation creates a counterfactual smart account that deploys on-chain on the first UserOp via factory data. The away device uses this because its throwaway EOA has no ETH to pay for the on-chain EIP-7702 authorization tx.

The `WalletCapabilities` object contains:

```typescript
type WalletCapabilities = {
  hasLocalKeys: boolean;
  localAccounts: Address[];
  delegationCount: number;
  delegations?: DelegationInfo[];
  hasPeerWallet: boolean;
  hasExternalSigner: boolean;
  hasBundlerConfig: boolean;
  smartAccountAddress?: Address;
  chainId?: number;
  signingMode?: string;
  autonomy?: string;
  peerAccountsCached?: boolean;
  cachedPeerAccounts?: Address[];
  hasAwayWallet?: boolean;
};
```

## Library Utilities

The package exports standalone utility functions that can be used outside of the vat context.

### Caveat Encoding

```typescript
import {
  encodeAllowedTargets,
  encodeAllowedMethods,
  encodeValueLte,
  encodeErc20TransferAmount,
  encodeLimitedCalls,
  encodeTimestamp,
  makeCaveat,
  getEnforcerAddress,
} from '@ocap/eth-wallet';

// Build a complete Caveat struct from type + encoded terms
const caveat = makeCaveat({
  type: 'allowedTargets',
  terms: encodeAllowedTargets(['0x...' as Address]),
  chainId: 1, // optional: looks up enforcer address by chain
});
```

### Delegation Utilities

```typescript
import {
  makeDelegation,
  prepareDelegationTypedData,
  delegationMatchesAction,
  finalizeDelegation,
  computeDelegationId,
  generateSalt,
} from '@ocap/eth-wallet';

// Create an unsigned delegation
const delegation = makeDelegation({
  delegator: '0xDelegator...' as Address,
  delegate: '0xDelegate...' as Address,
  caveats: [],
  chainId: 1,
});

// Prepare EIP-712 typed data for signing
const typedData = prepareDelegationTypedData({
  delegation,
  verifyingContract: '0xDelegationManager...' as Address,
});

// Check if a delegation covers an action (client-side, best-effort)
const matches = delegationMatchesAction(delegation, {
  to: '0xTarget...' as Address,
  value: '0x0' as Hex,
  data: '0x...' as Hex,
});
```

### UserOp Building

```typescript
import {
  buildDelegationUserOp,
  buildRedeemCallData,
  computeUserOpHash,
  encodeDelegationChain,
  encodeExecution,
  ENTRY_POINT_V07,
} from '@ocap/eth-wallet';

// Build an unsigned UserOp for delegation redemption
const userOp = buildDelegationUserOp({
  sender: '0xSmartAccount...' as Address,
  nonce: '0x0' as Hex,
  delegations: [signedDelegation],
  execution: {
    target: '0x...' as Address,
    value: '0x0' as Hex,
    callData: '0x...' as Hex,
  },
  maxFeePerGas: '0x3b9aca00' as Hex,
  maxPriorityFeePerGas: '0x3b9aca00' as Hex,
});

// Compute the hash for signing (ERC-4337 v0.7 packing)
const hash = computeUserOpHash(userOp, ENTRY_POINT_V07, 1);
```

### Bundler Client

Use `makeBundlerClient` for ERC-4337 bundler interactions (replaces the legacy `submitUserOp` / `estimateUserOpGas` helpers).

```typescript
import { makeBundlerClient, ENTRY_POINT_V07 } from '@ocap/eth-wallet';

const client = makeBundlerClient({
  bundlerUrl: 'https://api.pimlico.io/v2/sepolia/rpc',
  chainId: 11155111,
  apiKey: 'YOUR_PIMLICO_KEY',
});

// Estimate gas
const gas = await client.estimateUserOperationGas({
  userOp: unsignedUserOp,
  entryPointAddress: ENTRY_POINT_V07,
});

// Sponsor via paymaster (Pimlico)
const sponsorship = await client.sponsorUserOperation({
  userOp: unsignedUserOp,
  entryPointAddress: ENTRY_POINT_V07,
  context: { sponsorshipPolicyId: 'sp_my_policy' },
});

// Submit
const userOpHash = await client.sendUserOperation({
  userOp: signedUserOp,
  entryPointAddress: ENTRY_POINT_V07,
});

// Wait for inclusion
const receipt = await client.waitForUserOperationReceipt({
  hash: userOpHash,
  pollingInterval: 2000,
  timeout: 60000,
});
```

### MetaMask Signer Adapter

```typescript
import { connectMetaMaskSigner, makeProviderSigner } from '@ocap/eth-wallet';

// High-level: connect via MetaMask SDK
const signer = await connectMetaMaskSigner({
  dappMetadata: { name: 'My dApp', url: 'https://example.com' },
  infuraAPIKey: 'YOUR_KEY',
});

// Low-level: wrap any EIP-1193 provider
const signer = makeProviderSigner(window.ethereum, {
  disconnect: () => {
    /* cleanup */
  },
});

const accounts = await signer.getAccounts();
const signature = await signer.signTypedData(typedData, accounts[0]);
signer.disconnect();
```

## Cluster Configuration

Use `makeWalletClusterConfig` to generate the `ClusterConfig` for launching the subcluster.

```typescript
import { makeWalletClusterConfig } from '@ocap/eth-wallet';

const config = makeWalletClusterConfig({
  bundleBaseUrl: 'https://example.com/bundles',
  delegationManagerAddress: '0x...', // optional, defaults to placeholder
  services: ['ocapURLIssuerService', 'ocapURLRedemptionService'], // default
});

const { rootKref } = await kernel.launchSubcluster(config);
```

The configuration creates four vats (`coordinator`, `keyring`, `provider`, `delegation`) and registers the coordinator as the bootstrap vat. The `keyring`, `provider`, and `delegation` vats receive `TextEncoder` and `TextDecoder` as globals since they perform binary encoding.

## SES Compatibility

All vat code runs under [SES lockdown](https://github.com/endojs/endo/tree/master/packages/ses). Key considerations:

- **Vat code** uses `makeDefaultExo` from `@metamask/kernel-utils/exo` to create remotable objects, and `E()` from `@endo/eventual-send` for cross-vat communication. All vat root objects are exos.
- **Library utilities** (in `src/lib/`) use the `harden()` pattern for lockdown compatibility. The `harden` function is obtained from `globalThis.harden` with a passthrough fallback for environments without lockdown.
- **MetaMask SDK** cannot run inside a SES compartment. It is connected as an **external signer reference** that lives outside the vat boundary. The coordinator stores a reference to it but never loads it into a locked-down compartment.
- **viem** is used within vat compartments for ABI encoding, hashing, and HD key derivation. It is compatible with the SES environment as configured.

## Development

```bash
# Build vat bundles
yarn workspace @ocap/eth-wallet build

# Lint
yarn workspace @ocap/eth-wallet lint:fix
```

## Testing

The package has four tiers of tests, each exercising a progressively larger slice of the stack.

### Unit tests (319 tests)

```bash
yarn workspace @ocap/eth-wallet test:dev:quiet
```

Fast, in-process tests using vitest. All inter-vat `E()` calls are mocked. Covers every `lib/` module and every vat's `buildRootObject` logic in isolation — keyring operations, signing, delegation creation/matching, caveat encoding, UserOp building, bundler client, SDK adapter, MetaMask signer, and coordinator strategy resolution.

### Single-kernel integration (34 assertions)

```bash
yarn workspace @ocap/eth-wallet test:node
```

Plain Node.js script that runs under **real SES lockdown** in a **real kernel**. Launches the wallet subcluster (4 vats), exercises the full coordinator API via `kernel.queueMessage()`, and verifies inter-vat `E()` communication actually works end-to-end. Covers: keyring init (SRP + throwaway), signing (message, transaction, EIP-712), delegation lifecycle (create, sign, list), capabilities introspection, and no-authority error handling.

### Peer wallet over QUIC (27 assertions)

```bash
yarn workspace @ocap/eth-wallet test:node:peer
```

Two separate kernel instances connected via QUIC direct transport. Tests the home/away wallet architecture: OCAP URL issuance and redemption, remote message signing forwarded over CapTP, remote EIP-712 signing, transaction signing rejection (no peer fallback), delegation creation on the home wallet and transfer to the away wallet, and combined throwaway-key + peer + delegation capabilities. Verifies that remote signatures are identical to local signatures (same signing key, same result).

### Daemon integration (23 assertions)

```bash
yarn workspace @ocap/eth-wallet test:node:daemon
```

Exercises the wallet through the **daemon JSON-RPC socket** — the same interface an agent process uses in production. Boots a kernel with an RPC socket server, launches the wallet subcluster via `launchSubcluster` RPC, then calls wallet methods via `queueMessage` RPC over the Unix socket. Covers: daemon status, subcluster lifecycle, keyring init, signing, delegation creation, capabilities, error propagation through the RPC layer, and subcluster termination.

### Sepolia E2E (13 assertions, requires API keys)

```bash
PIMLICO_API_KEY=xxx SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/xxx \
  yarn workspace @ocap/eth-wallet test:node:sepolia
```

Full on-chain test on Sepolia testnet. Creates a Hybrid smart account (standalone single-device test), creates and signs a delegation, redeems it by submitting an ERC-4337 UserOp to the Pimlico bundler with paymaster gas sponsorship, and waits for on-chain inclusion. Skips automatically if `PIMLICO_API_KEY` and `SEPOLIA_RPC_URL` are not set.

### Peer wallet Sepolia E2E (41 assertions, requires API keys)

```bash
PIMLICO_API_KEY=xxx SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/xxx \
  MNEMONIC="your twelve word mnemonic" \
  yarn workspace @ocap/eth-wallet test:node:peer-e2e
```

The most comprehensive test: two kernels connected via local QUIC, exercising the complete home/away flow against Sepolia. Covers OCAP URL peer connection, remote message signing forwarded via CapTP, transaction signing rejection (no peer fallback), provider RPC queries, cross-kernel delegation transfer and revocation, smart account creation, self-delegation redemption via UserOp, and on-chain inclusion. Skips if any of `PIMLICO_API_KEY`, `SEPOLIA_RPC_URL`, or `MNEMONIC` is missing. Takes ~30–90 s depending on network conditions.

### Vitest integration (5 tests)

```bash
yarn workspace @ocap/eth-wallet test:integration
```

Vitest-based peer wallet tests in `test/integration/peer-wallet.test.ts`. Requires building bundles first (`yarn build`). Tests OCAP URL connection, remote message/transaction signing via CapTP, no-authority errors, and capabilities reporting across two kernels.

## Constants

The package exports chain contract addresses used by the Delegation Framework:

| Export                       | Description                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `SEPOLIA_CHAIN_ID`           | Sepolia testnet chain ID (`11155111`).                                           |
| `PIMLICO_RPC_BASE_URL`       | Base URL for the Pimlico bundler on Sepolia.                                     |
| `CHAIN_CONTRACTS`            | Registry of contract addresses keyed by chain ID.                                |
| `getChainContracts(chainId)` | Get contracts for a chain, falling back to placeholders.                         |
| `ENTRY_POINT_V07`            | ERC-4337 EntryPoint v0.7 address (`0x0000000071727de22e5e9d8baf0edac6f37da032`). |
| `ROOT_AUTHORITY`             | The root authority hash (no parent delegation): `0xfff...fff`.                   |
| `DELEGATION_TYPES`           | EIP-712 type definitions for the Delegation Framework.                           |
| `ETH_HD_PATH_PREFIX`         | BIP-44 HD path for Ethereum: `m/44'/60'/0'/0`.                                   |

## Disclaimer

This package is experimental software developed with the assistance of AI code generation tools. While it includes extensive test coverage (unit, integration, and on-chain E2E tests), it has not been formally audited. It may contain bugs, security vulnerabilities, or unexpected behavior.

This software is provided "as is", without warranty of any kind. The authors are not responsible for any loss of funds, data, or other damages resulting from its use. Do not use this package in production or with real assets without conducting your own thorough review and testing.
