# Phase 3 — Create `@metamask/netlayer` + `@metamask/netlayer-loopback`

This is one PR in the 6-phase effort to introduce a pluggable "netlayer" abstraction
(master plan: [`master.md`](./master.md),
issue [#968](https://github.com/MetaMask/ocap-kernel/issues/968)). It is written to be
executed by an engineer with no prior context.

## Preconditions (assumed done by Phases 1–2)

> **Revision required before execution.** This plan was written before Phases 1–2 landed.
> Reconcile every cross-phase reference (names, signatures, file locations) against the
> actually-merged code; where they differ, the landed code wins and this document should be
> updated first.

This plan assumes the following are already true on `main` before you start. **Verify each
before beginning; if any is false, that work belongs to Phase 3 and the estimate grows.**

1. **`transport.ts` is libp2p-import-free and provider-shaped.** Its core no longer imports
   `@libp2p/*`; it consumes a `ChannelProvider` (today's `ConnectionFactory`, which produces
   neutral channels) rather than constructing libp2p itself, and is shaped as the
   `makeChannelNetlayer` engine. (Current `transport.ts` on `main` still imports
   `@libp2p/interface` and `@libp2p/utils` and constructs `ConnectionFactory` internally —
   see "Fidelity risks" if that separation is not yet complete.)
2. **`Channel` has been renamed/reshaped to `NetworkChannel`** — a libp2p-free type with
   `read()/write()/close()/setInactivityTimeout()` instead of `msgStream`/`stream`. All the
   machinery files (`peer-state-manager`, `channel-utils`, `handshake`, `reconnection-lifecycle`)
   import this neutral type from `../types.ts`.
3. **`ConnectionFactory` implements the `ChannelProvider` contract** as landed in Phase 1:
   `dial(peerId, hints, withRetry)`, `onInboundChannel`, `onPeerDisconnect`,
   `closeChannel(channel)`, `getListenAddresses`, `stop` — with lpStream framing, inactivity
   timeout, and raw-error → neutral-error mapping done inside it. Note the Phase 1 contract
   has **no `peerId` field on `ChannelProvider`** — adding it (and `Netlayer.peerId`) is
   **Phase 3 work**, done here as part of the engine move (see §3 note below).
4. **Identity is neutral.** `remote-comms.ts` derives the peerId from a raw Ed25519 pubkey via
   `@noble/curves` + `base58btc` (multibase), not `@libp2p/crypto`/`@libp2p/peer-id`. The
   Phase 2 plan ships this as `deriveNeutralPeerId(seed: Uint8Array): string` (plus
   `neutralPeerIdToPublicKey`/`publicKeyToNeutralPeerId`) in
   `remotes/kernel/identity.ts`. This plan's `deriveNetlayerIdentity(keySeed)` is a
   **rename/wrapping of those helpers performed during the Phase 3 move** — either adopt the
   Phase 2 names wholesale or introduce the wrapper; pick one and be consistent.
5. **`@metamask/kernel-errors` is libp2p-free** and exports the neutral error classes
   (`ChannelResetError`, `IntentionalDisconnectError`, `MessageTooLargeError`, plus the existing
   `AbortError`, `IntentionalCloseError`, `NetworkStoppedError`, `PeerRestartedError`,
   `ResourceLimitError`, and `isRetryableNetworkError`/`getNetworkErrorCode`/`isResourceLimitError`).
   Its `package.json` no longer lists `@libp2p/interface`. **This is load-bearing for Phase 3:**
   `@metamask/netlayer` depends on `kernel-errors`, so if kernel-errors still pulls libp2p, the
   new "libp2p-free" package transitively pulls it too.

If a precondition is only partially met, finish it as the first commit of this PR — but keep
that mechanical and test-preserving, per the master plan's "engine extraction fidelity" risk.

## 1. Objective and non-goals

### Objective

Extract the transport-neutral networking machinery and the netlayer contract out of
`packages/ocap-kernel/src/remotes/platform/` into a new published package `@metamask/netlayer`,
and add a second, minimal implementation `@metamask/netlayer-loopback` (in-process hub) that
both proves the interface is not libp2p-shaped and serves as the standard test fake. ocap-kernel
re-exports the moved types so kernel consumers and runtimes are unaffected.

### Non-goals (explicitly deferred)

- **No runtime changes.** `@metamask/kernel-node-runtime` and `@metamask/kernel-browser-runtime`
  are untouched. ocap-kernel keeps `initTransport` in its public API and keeps constructing the
  libp2p `ConnectionFactory` internally.
- **libp2p stays in ocap-kernel.** `connection-factory.ts`, `lp-framing.test.ts`, the libp2p
  deps in `packages/ocap-kernel/package.json`, and libp2p-specific constants remain. Extraction
  to `@metamask/netlayer-libp2p` is Phase 4.
- **No injection flip.** `PlatformServices.initializeRemoteComms` keeps its current positional
  signature; `NetlayerRegistry`/`NetlayerSpecifier` wiring is Phase 4b.
- **No config split beyond what the move forces.** `RemoteCommsOptions` stays in ocap-kernel;
  the engine takes a neutral options subset (see §3).
- **No `@metamask/netlayer-websocket`** (Phase 5) and **no docs/terminology rename** (Phase 6).

## 2. Package scaffolding

The `create-package` CLI forces an `@ocap/` scope and derives the directory from the unscoped
name (`packages/create-package/src/commands.ts:56,90`). Published packages use the `@metamask/`
scope, so scaffold under `@ocap/` then rename `package.json` `name` and add `publishConfig` +
subpath exports (this is how existing published packages like `@metamask/kernel-platforms` were
made). Use the `create-package` skill.

### 2.1 `@metamask/netlayer`

```bash
yarn create-package --name netlayer \
  --description "Transport-neutral netlayer contract and channel-session engine for the ocap-kernel"
```

Then edit `packages/netlayer/package.json`:

- `"name": "@metamask/netlayer"`, `"version": "0.1.0"`.
- Add `publishConfig` (`{ "access": "public", "registry": "https://registry.npmjs.org/" }`),
  `sideEffects: false`, `license: "(MIT OR Apache-2.0)"`, and the `main`/`module`/`types` +
  `exports` block. A single `.` export is sufficient this phase (no Node/browser split; the
  engine and machinery are environment-neutral). Copy the `exports`/`files`/`scripts` shape
  from `packages/kernel-errors/package.json` (single-entry variant) — it is the closest small
  published package.
- **`dependencies`:**
  - `@metamask/kernel-errors` (`workspace:^`) — neutral error classes + retryability helpers
  - `@metamask/kernel-utils` (`workspace:^`) — `abortableDelay`, `calculateReconnectionBackoff`,
    `DEFAULT_MAX_RETRY_ATTEMPTS`, `retryWithBackoff`, `installWakeDetector`, `fromHex`, `toHex`
  - `@metamask/logger` (`workspace:^`)
  - `@metamask/superstruct` (`^3.2.1`) — for validating netlayer `config` (impls' job, but the
    package exports shared struct helpers)
  - `@metamask/utils` — the `Json` type (and `JsonStruct`) referenced by
    `NetlayerParams`/`NetlayerSpecifier` (match the version pinned elsewhere in the workspace)
  - `@noble/curves` + `@noble/hashes` — for the neutral identity helper (Ed25519)
  - `multiformats` (`^13.3.6`) — `base58btc` from `multiformats/bases/base58`
  - `uint8arrays` (`^5.1.0`) — `fromString`/`toString` in the engine + handshake
- **`devDependencies`:** `@ocap/repo-tools` (`workspace:^`), `ses`, and the standard eslint/
  vitest/ts-bridge set copied from `kernel-errors` `devDependencies`.
- Add `add`-driven deps via `yarn workspace @metamask/netlayer add ...` where possible so the
  lockfile updates; hand-edit versions to match the pins already used in ocap-kernel.

Set up tests to run under the mock lockdown shim (the machinery calls `harden`), matching
`kernel-platforms/vitest.config.ts`:

```ts
// packages/netlayer/vitest.config.ts — setupFiles points at the mock shim
setupFiles: [fileURLToPath(import.meta.resolve('@ocap/repo-tools/test-utils/mock-endoify'))],
```

`packages/netlayer/tsconfig.json` `references`: `../kernel-errors`, `../kernel-utils`,
`../logger`, `../repo-tools`. `packages/netlayer/tsconfig.build.json` `references`: the same
minus `../repo-tools` (build refs mirror runtime deps only — compare to
`kernel-platforms/tsconfig.build.json`, which has an empty `references`; include the workspace
deps that netlayer actually imports at build time: `../kernel-errors`, `../kernel-utils`,
`../logger`).

### 2.2 `@metamask/netlayer-loopback`

```bash
yarn create-package --name netlayer-loopback \
  --description "In-process hub netlayer: standard netlayer test fake and embedded multi-kernel transport"
```

Rename to `@metamask/netlayer-loopback`, same `publishConfig`/`exports`/single `.` entry.

- **`dependencies`:** `@metamask/netlayer` (`workspace:^`), `@metamask/logger` (`workspace:^`),
  `@metamask/superstruct` (`^3.2.1`). It reuses `deriveNetlayerIdentity` from `@metamask/netlayer`,
  so no `@noble` dep directly.
- **`devDependencies`:** same standard set + `@ocap/repo-tools`, `ses`.
- `tsconfig.json` `references`: `../netlayer`, `../logger`, `../repo-tools`.
  `tsconfig.build.json` `references`: `../netlayer`, `../logger`.
- vitest setup: mock-endoify shim (loopback registers hardened objects).

### 2.3 Dependents' references (CLAUDE.md requirement)

- **Root `tsconfig.json`** `references`: add `{ "path": "./packages/netlayer" }` and
  `{ "path": "./packages/netlayer-loopback" }` (create-package may add these automatically —
  verify).
- **Root `tsconfig.build.json`** `references`: add
  `{ "path": "./packages/netlayer/tsconfig.build.json" }` and the loopback one.
- **`packages/ocap-kernel/package.json`:** add `@metamask/netlayer` to `dependencies` and
  `@metamask/netlayer-loopback` to `devDependencies` (test fake only).
- **`packages/ocap-kernel/tsconfig.json`** `references`: add `{ "path": "../netlayer" }` and
  `{ "path": "../netlayer-loopback" }`. **`tsconfig.build.json`:** add
  `{ "path": "../netlayer/tsconfig.build.json" }` only (loopback is test-only; do not add it to
  the build graph — mirror how test-only deps are handled elsewhere).
- **Root `vitest.config.ts`:** the coverage block (lines 57–70) has no per-package thresholds
  today, so nothing to add there; if `@ocap/repo-tools`' shared vitest config enforces per-file
  thresholds, ensure the new packages meet them (the moved code already has thorough tests).
- Run `yarn` after edits to relink the workspace and refresh the lockfile.

## 3. Public API of `@metamask/netlayer`

This is the intended contract for the package (copied from the master plan's sketch,
adjusted for what the engine actually needs). Follow repo conventions: `type` not `interface`,
no `any`, no `enum`, options bags, `#` private fields, `@metamask/superstruct` for runtime
validation.

> **Reconcile with the Phase 1 landed shape before writing code.** Two known deviations from
> the sketch below, both resolved in favor of what the engine actually calls:
> (a) Phase 1 lands `dial(peerId, hints, withRetry)` — the engine distinguishes
> retry-dials (`sendRemoteMessage`) from non-retry dials (reconnection lifecycle). Keep the
> third argument unless the engine no longer needs the distinction; do not silently drop it
> to match the sketch. (b) Phase 1 wires a **shared `AbortController`** between provider and
> engine (`stop()` must abort the same signal the provider was constructed with) — the
> `makeChannelNetlayer` params must carry that controller/signal through the move, even
> though the sketch omits it. See the Phase 1 plan §3.6 "wiring caveat".

```ts
// @metamask/netlayer — kernel-facing contract. Peers/messages are opaque strings.
import type { Logger } from '@metamask/logger';
import type { Json } from '@metamask/utils';

export type Netlayer = {
  readonly peerId: string; // neutral encoding, see Identity
  sendRemoteMessage: (to: string, message: string) => Promise<void>;
  closeConnection: (peerId: string) => Promise<void>;
  registerLocationHints: (peerId: string, hints: string[]) => void;
  reconnectPeer: (peerId: string, hints?: string[]) => Promise<void>; // may be no-op
  resetAllBackoffs: () => void; // may be no-op
  getListenAddresses: () => string[]; // netlayer-specific hint strings
  stop: () => Promise<void>;
};

export type NetlayerHooks = {
  handleMessage: (from: string, message: string) => Promise<string | null>;
  onRemoteGiveUp?: (peerId: string) => void;
  onIncarnationChange?: (
    peerId: string,
    observedIncarnation: string,
  ) => Promise<boolean>;
};

export type NetlayerParams<Config = Json> = {
  keySeed: string; // netlayer MUST authenticate as the derived Ed25519 key
  incarnationId?: string;
  hooks: NetlayerHooks;
  config: Config; // netlayer-specific, superstruct-validated by the impl
  logger?: Logger;
};
export type NetlayerFactory<Config = Json> = (
  params: NetlayerParams<Config>,
) => Promise<Netlayer>;
export type NetlayerSpecifier = { netlayer: string; config: Json }; // Json → crosses postMessage
export type NetlayerRegistry = Record<string, NetlayerFactory>;

// Internal seam for channel-based impls (today's `Channel`, made libp2p-free):
export type NetworkChannel = {
  peerId: string;
  read: () => Promise<Uint8Array>; // throws mapped kernel-errors
  write: (data: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
  setInactivityTimeout: (ms: number) => void; // may be no-op
};
export type InboundChannelHandler = (
  channel: NetworkChannel,
) => Promise<void> | void;
export type PeerDisconnectHandler = (peerId: string) => void;
export type ChannelProvider = {
  readonly peerId: string;
  dial: (peerId: string, hints: string[]) => Promise<NetworkChannel>;
  onInboundChannel: (handler: InboundChannelHandler) => void;
  onPeerDisconnect: (handler: PeerDisconnectHandler) => void;
  closeChannel: (channel: NetworkChannel) => Promise<void>;
  getListenAddresses: () => string[];
  stop: () => Promise<void>;
};

// Message-handler aliases used by both hooks and kernel-side PlatformServices:
export type RemoteMessageHandler = (
  from: string,
  message: string,
) => Promise<string | null>;
export type SendRemoteMessage = (to: string, message: string) => Promise<void>;
export type StopRemoteComms = () => Promise<void>;
export type OnRemoteGiveUp = (peerId: string) => void;
export type OnIncarnationChange = (
  peerId: string,
  observedIncarnation: string,
) => Promise<boolean>;

// Neutral options subset consumed by the channel-session engine. This is the set of
// RemoteCommsOptions fields the machinery actually reads today (transport.ts:118-134);
// kernel-only fields (mnemonic, maxQueue, ackTimeoutMs, maxUrlRelayHints, maxKnownRelays,
// relays, directTransports, directListenAddresses, allowedWsHosts) stay in ocap-kernel.
export type ChannelNetlayerOptions = {
  maxRetryAttempts?: number | undefined;
  maxConcurrentConnections?: number | undefined;
  maxMessageSizeBytes?: number | undefined;
  cleanupIntervalMs?: number | undefined;
  stalePeerTimeoutMs?: number | undefined;
  maxMessagesPerSecond?: number | undefined;
  maxConnectionAttemptsPerMinute?: number | undefined;
  reconnectionBaseDelayMs?: number | undefined;
  reconnectionMaxDelayMs?: number | undefined;
  handshakeTimeoutMs?: number | undefined;
  writeTimeoutMs?: number | undefined;
  streamInactivityTimeoutMs?: number | undefined;
};

// Engine: refactored transport.ts. Provider owns identity, so no keySeed here.
export const makeChannelNetlayer: (params: {
  provider: ChannelProvider;
  hooks: NetlayerHooks;
  incarnationId?: string;
  options?: ChannelNetlayerOptions;
  logger?: Logger;
}) => Netlayer;

// Neutral identity helper (moved from Phase 2). base58btc(multibase) of raw Ed25519 pubkey.
export const deriveNetlayerIdentity: (keySeed: string) => {
  peerId: string /* + key material */;
};
```

Additional exports (shared machinery, so impls can compose them without reaching into
ocap-kernel): `PeerStateManager`, `ReconnectionManager`, `makeReconnectionLifecycle`,
`makeMessageRateLimiter`, `makeConnectionRateLimiter`, `SlidingWindowRateLimiter`,
`makeMessageSizeValidator`, `makeConnectionLimitChecker`, `makeErrorLogger`, `writeWithTimeout`,
`performInboundHandshake`, `performOutboundHandshake`, `isHandshakeMessage`, and the neutral
engine constants. Export types alongside (`PeerState`, `ReconnectionState`, `ErrorRecord`,
`HandshakeMessage`, `HandshakeResult`, `HandshakeDeps`, `ErrorLogger`,
`ReconnectionLifecycleDeps`, `ReconnectionLifecycle`).

### Engine notes for the implementer

- `makeChannelNetlayer` is the body of today's `initTransport` **minus** the
  `ConnectionFactory.make(...)` construction (that stays in ocap-kernel's thin `initTransport`)
  and minus keySeed handling. `Netlayer.peerId` = `provider.peerId`.
- Handshake wiring (`doOutboundHandshake`/`doInboundHandshake`, the incarnation OR-logic, the
  inbound-reject-on-restart behavior) moves verbatim; it already only touches the channel type
  and `onIncarnationChange`.
- Version the handshake message (add a `v` field) per the master plan — compat is breaking
  anyway. This is a small edit to `HandshakeMessage` + `isHandshakeMessage`; keep it minimal and
  covered by the moved `handshake.test.ts`.
- `installWakeDetector` (from `@metamask/kernel-utils`) stays wired inside the engine.

## 4. File move map

`SRC` = `packages/ocap-kernel/src/remotes/platform/`. `NL` = `packages/netlayer/src/`.
Every move takes the co-located `.test.ts` with it (adjust only import paths; do not rewrite
tests — "engine extraction fidelity" risk).

| Source (ocap-kernel)                                        | Destination                                             | Notes                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SRC/transport.ts`                                          | `NL/channel-netlayer.ts` (export `makeChannelNetlayer`) | Drop the `ConnectionFactory.make` call + keySeed; take `provider` param.                                                                                                                                                                                                                                                             |
| `SRC/transport.test.ts`                                     | `NL/channel-netlayer.test.ts`                           | Must mock `ChannelProvider`/`NetworkChannel`, not libp2p (Phase 1 deliverable — verify, see risks).                                                                                                                                                                                                                                  |
| `SRC/peer-state-manager.ts` (+`.test.ts`)                   | `NL/peer-state-manager.ts`                              | Imports `NetworkChannel` from `./types.ts` (was `../types.ts`).                                                                                                                                                                                                                                                                      |
| `SRC/reconnection.ts` (+`.test.ts`)                         | `NL/reconnection.ts`                                    | Only `@metamask/kernel-utils` + local constants.                                                                                                                                                                                                                                                                                     |
| `SRC/reconnection-lifecycle.ts` (+`.test.ts`)               | `NL/reconnection-lifecycle.ts`                          | Imports `NetworkChannel`, `OnRemoteGiveUp` from `./types.ts`.                                                                                                                                                                                                                                                                        |
| `SRC/rate-limiter.ts` (+`.test.ts`)                         | `NL/rate-limiter.ts`                                    | Only `@metamask/kernel-errors` + constants.                                                                                                                                                                                                                                                                                          |
| `SRC/validators.ts` (+`.test.ts`)                           | `NL/validators.ts`                                      | Only `@metamask/kernel-errors` + constants.                                                                                                                                                                                                                                                                                          |
| `SRC/channel-utils.ts` (+`.test.ts`)                        | `NL/channel-utils.ts`                                   | Imports `NetworkChannel` from `./types.ts`.                                                                                                                                                                                                                                                                                          |
| `SRC/handshake.ts` (+`.test.ts`)                            | `NL/handshake.ts`                                       | Imports `NetworkChannel` from `./types.ts`; add `v` field. `handshake.test.ts` imports `@libp2p/utils` today — replace with neutral EOF (see risks).                                                                                                                                                                                 |
| `SRC/constants.ts` (neutral subset)                         | `NL/constants.ts`                                       | See constants split below.                                                                                                                                                                                                                                                                                                           |
| identity helper `deriveNetlayerIdentity` (Phase-2 location) | `NL/identity.ts` (+`.test.ts`)                          | Move the neutral `@noble`-based helper. Keep ocap-kernel's ocap-URL/AES-GCM logic in `remote-comms.ts`.                                                                                                                                                                                                                              |
| — new —                                                     | `NL/types.ts`                                           | `Netlayer`, `NetlayerHooks`, `NetlayerParams`, `NetlayerFactory`, `NetlayerSpecifier`, `NetlayerRegistry`, `NetworkChannel`, `ChannelProvider`, `InboundChannelHandler`, `PeerDisconnectHandler`, `RemoteMessageHandler`, `SendRemoteMessage`, `StopRemoteComms`, `OnRemoteGiveUp`, `OnIncarnationChange`, `ChannelNetlayerOptions`. |
| — new —                                                     | `NL/index.ts`                                           | Barrel re-exporting the §3 public API.                                                                                                                                                                                                                                                                                               |

### Constants split

`SRC/constants.ts` mixes neutral engine constants with libp2p/webrtc-specific ones. Split:

- **Move to `NL/constants.ts`** (consumed by moved machinery): `DEFAULT_MAX_CONCURRENT_CONNECTIONS`,
  `DEFAULT_MAX_MESSAGE_SIZE_BYTES`, `DEFAULT_CLEANUP_INTERVAL_MS`, `DEFAULT_STALE_PEER_TIMEOUT_MS`,
  `DEFAULT_WRITE_TIMEOUT_MS`, `DEFAULT_MESSAGE_RATE_LIMIT`, `DEFAULT_MESSAGE_RATE_WINDOW_MS`,
  `DEFAULT_CONNECTION_RATE_LIMIT`, `DEFAULT_CONNECTION_RATE_WINDOW_MS`, `HANDSHAKE_TIMEOUT_MS`,
  `STREAM_INACTIVITY_TIMEOUT_MS`, `MIN_STREAM_INACTIVITY_TIMEOUT_MS`,
  `DEFAULT_CONSECUTIVE_ERROR_THRESHOLD`.
- **Keep in `SRC/constants.ts`** (libp2p provider only, used by `connection-factory.ts`;
  move to `@metamask/netlayer-libp2p` in Phase 4): `RELAY_RECONNECT_BASE_DELAY_MS`,
  `RELAY_RECONNECT_MAX_DELAY_MS`, `RELAY_RECONNECT_MAX_ATTEMPTS`, `SCTP_USER_INITIATED_ABORT`.
  (`SCTP_USER_INITIATED_ABORT` is webrtc-specific; the intentional-disconnect classification
  it powers should already have moved into `ConnectionFactory`'s error mapper in Phase 1. If
  the engine still references it, move it to `NL` instead and revisit in Phase 4.)

### What ocap-kernel keeps in `remotes/platform/`

- `connection-factory.ts` (+`.test.ts`) — the libp2p `ChannelProvider`. Its imports of
  `Channel`/`ConnectionFactoryOptions`/`DirectTransport`/`InboundConnectionHandler`/
  `PeerDisconnectHandler` from `../types.ts` change to: `NetworkChannel`, `ChannelProvider`
  handler types from `@metamask/netlayer`; `ConnectionFactoryOptions`, `DirectTransport` stay
  local (`../types.ts`).
- `lp-framing.test.ts` — tests `@libp2p/utils` `lpStream` directly; stays (Phase 4).
- `constants.ts` — reduced to the libp2p subset above.
- **New thin `transport.ts`** (keeps the `initTransport` export path stable). It:
  1. constructs `ConnectionFactory` via `ConnectionFactory.make({ keySeed, knownRelays: relays,
... })` (the libp2p ChannelProvider),
  2. maps `RemoteCommsOptions` → `ChannelNetlayerOptions`,
  3. calls `makeChannelNetlayer({ provider, hooks: { handleMessage, onRemoteGiveUp,
onIncarnationChange }, incarnationId, options, logger })` from `@metamask/netlayer`,
  4. returns the object shape `initTransport` returns today (the `Netlayer` fields; note
     `getListenAddresses` and the connection-management functions are all present).

### ocap-kernel re-export surface afterward

`packages/ocap-kernel/src/remotes/types.ts`:

- **Removes** local defs of `Channel` (→`NetworkChannel`), `InboundConnectionHandler`,
  `PeerDisconnectHandler`, `RemoteMessageHandler`, `SendRemoteMessage`, `StopRemoteComms`,
  `OnRemoteGiveUp`, `OnIncarnationChange`.
- **Adds** `export type { NetworkChannel, ChannelProvider, RemoteMessageHandler,
SendRemoteMessage, StopRemoteComms, OnRemoteGiveUp, OnIncarnationChange, Netlayer,
NetlayerHooks, NetlayerFactory, NetlayerParams, NetlayerSpecifier, NetlayerRegistry }
from '@metamask/netlayer';`
- **Keeps** `RemoteIdentity`, `RemoteComms`, `RemoteInfo` (reference `KRef`, kernel-only),
  `RemoteCommsOptions`, `DirectTransport`, `ConnectionFactoryOptions` (libp2p provider config).

`packages/ocap-kernel/src/index.ts`:

- Keeps `export { initTransport } from './remotes/platform/transport.ts';` (now thin).
- Its existing `export type { ... } from './remotes/types.ts'` block continues to work
  (the names are now re-exported from netlayer through `remotes/types.ts`). Optionally add
  `NetworkChannel`, `Netlayer`, `NetlayerSpecifier` to the public type surface for future
  consumers — low risk, and it is the "ocap-kernel re-exports netlayer types" deliverable.

`PlatformServices` (in `packages/ocap-kernel/src/types.ts`) is unchanged in shape; it already
references `RemoteMessageHandler`/`SendRemoteMessage`/`StopRemoteComms`/`OnRemoteGiveUp`/
`OnIncarnationChange`/`RemoteCommsOptions` via `remotes/types.ts`, which now sources the first
group from `@metamask/netlayer`. No signature change.

## 5. Loopback netlayer design (`@metamask/netlayer-loopback`)

An in-memory hub routes messages between netlayer instances in the same JavaScript realm,
keyed by neutral peerId. It implements the full `Netlayer` contract and is a `NetlayerFactory`.

### Hub: explicit object passed via config (no global state)

Per CLAUDE.md ("avoid introducing global state in tests"), the hub is an **explicit object
created by a factory and passed into each netlayer's `config`** — not a module-level registry.
Two in-process kernels connect by being given the **same hub instance**.

```ts
// @metamask/netlayer-loopback
export type LoopbackHub = {
  // internal: peerId -> receive(from, message) => Promise<string | null>
  register: (peerId: string, receive: NetlayerHooks['handleMessage']) => void;
  unregister: (peerId: string) => void;
  deliver: (
    from: string,
    to: string,
    message: string,
  ) => Promise<string | null>;
};
export const makeLoopbackHub: () => LoopbackHub; // harden() the returned object

export type LoopbackConfig = { hub: LoopbackHub; incarnationId?: string };
export const makeLoopbackNetlayer: NetlayerFactory<LoopbackConfig>;
```

`LoopbackConfig.hub` is a live object, not `Json`, so a loopback `NetlayerSpecifier` cannot
cross a postMessage boundary — that is fine and expected (loopback is same-realm only; document
it). Validate the non-hub parts of config with `@metamask/superstruct`; assert `hub` is present
with a plain runtime check.

### Behavior

`makeLoopbackNetlayer({ keySeed, incarnationId, hooks, config, logger })`:

1. `const { peerId } = deriveNetlayerIdentity(keySeed)` (from `@metamask/netlayer`) — identity
   is derived the same way as real netlayers, so loopback peerIds are interchangeable with
   libp2p peerIds in kernel state.
2. `config.hub.register(peerId, hooks.handleMessage)`.
3. Return a hardened `Netlayer`:
   - `peerId`: the derived id.
   - `sendRemoteMessage(to, message)`: `const reply = await hub.deliver(peerId, to, message);
if (reply) { void this.hooks... }` — actually deliver routes to the _target's_
     `handleMessage`; the returned reply string (if non-null) is delivered back to **this**
     peer's `handleMessage` fire-and-forget, mirroring the engine's reply path
     (`transport.ts:receiveMessage`). Throw `NetworkStoppedError` after `stop()`; throw if the
     target peerId is not registered on the hub (mirrors "cannot dial unknown peer").
   - `onIncarnationChange`: on first contact with a peer, call
     `hooks.onIncarnationChange?.(peerId, staticIncarnation)` **directly** with a static
     incarnation value (e.g. the peer's `incarnationId` recorded at register time, or a constant).
     No handshake protocol is run — loopback is trusted, same-realm.
   - **No-ops:** `registerLocationHints` (ignored — no hints in-process), `reconnectPeer`
     (resolves immediately), `resetAllBackoffs` (returns), `closeConnection` (marks the pairing
     closed so further sends throw `IntentionalCloseError`, matching the engine),
     `getListenAddresses` (returns `[]`).
   - `stop()`: `hub.unregister(peerId)`; subsequent sends throw `NetworkStoppedError`.

Keep it minimal: no rate limiting, no backoff, no channels. The point is to exercise the
kernel/PlatformServices path and the `Netlayer` contract, not the channel machinery.

### `handleMessage` reply routing

The engine's contract: `handleMessage(from, message)` may return a reply string, which the
transport sends back to `from`. Loopback must replicate this so the Ken protocol's seq/ack
round-trips work. Implement `hub.deliver(from, to, msg)` to invoke the _to_ peer's
`handleMessage(from, msg)` and hand its return value back to the caller's send path, which then
fire-and-forgets it into the _from_ peer's inbound path. Cover this with a two-party test that
sends a message and asserts a reply is delivered.

## 6. Demonstration: replacing hand-rolled `PlatformServices` mocks

Today `packages/ocap-kernel/test/remotes-mocks.ts` builds a fully hand-rolled
`makeMockPlatformServices()` (every method a bare `vi.fn()`), used by `RemoteManager.test.ts`
and others. The loopback netlayer lets a `PlatformServices` actually move bytes between two
`RemoteManager`s in-process.

Plan:

1. Add a test util **`makeLoopbackPlatformServices({ hub, keySeed, incarnationId })`** in
   `packages/ocap-kernel/test/remotes-mocks.ts` (or a new `test/loopback-platform-services.ts`).
   It returns a `PlatformServices` whose remote-comms methods delegate to a loopback `Netlayer`:
   `initializeRemoteComms` calls `makeLoopbackNetlayer({ keySeed, incarnationId, hooks:
{ handleMessage: remoteMessageHandler, onRemoteGiveUp, onIncarnationChange }, config: { hub },
logger })` and stores it; `sendRemoteMessage`/`stopRemoteComms`/`closeConnection`/
   `registerLocationHints`/`reconnectPeer`/`resetAllBackoffs`/`getListenAddresses` forward to it.
   The vat-launch methods (`launch`/`terminate`/`terminateAll`) stay `vi.fn()` — loopback is
   about remote comms only.
2. **Add a new two-party integration test** `packages/ocap-kernel/src/remotes/loopback.test.ts`
   (co-located with remotes code): create one `makeLoopbackHub()`, build two
   `makeLoopbackPlatformServices` bound to it with distinct key seeds, wire two `RemoteManager`s,
   and assert a message issued from A is received by B and a reply routes back. This is the
   headline proof that the abstraction carries real traffic without libp2p.
3. **Convert the subset of `RemoteManager.test.ts` cases that only need the remote-comms
   surface** (identity init, send-path happy cases) to the loopback-backed services; wrap the
   loopback methods with `vi.spyOn` where a test asserts call arguments (e.g. the
   `closeConnection`/`reconnectPeer` argument assertions at lines ~380–410) so those assertions
   still hold while the underlying behavior is real. Leave any case that depends on a specific
   mock resolution value on the hand-rolled mock if converting it would obscure intent — the
   goal is a credible demonstration, not a wholesale rewrite. Keep `makeMockPlatformServices`
   available for those.

## 7. Execution order

Do this as a sequence of small commits so CI (or `yarn build`) is green at each checkpoint.

1. **Verify preconditions** (§ "Preconditions"). Finish any partial Phase-1/2 separation
   mechanically if needed.
2. **Scaffold `@metamask/netlayer`** (§2.1): create, rename, set exports/deps, tsconfig refs,
   vitest mock-endoify setup. Empty `src/index.ts` + `src/types.ts` compile.
3. **Move netlayer types** into `NL/types.ts`; wire `NL/index.ts` to export them.
4. **Move identity** (`deriveNetlayerIdentity` → `NL/identity.ts` +test).
5. **Move machinery** in dependency order, updating `../types.ts` → `./types.ts` and constant
   imports as you go, running `yarn workspace @metamask/netlayer test:dev:quiet` after each:
   `constants.ts` (neutral subset) → `validators.ts` → `rate-limiter.ts` → `reconnection.ts` →
   `channel-utils.ts` → `peer-state-manager.ts` → `handshake.ts` → `reconnection-lifecycle.ts`.
6. **Move the engine** `transport.ts` → `NL/channel-netlayer.ts` as `makeChannelNetlayer`
   (drop provider construction + keySeed); move `transport.test.ts` → `channel-netlayer.test.ts`.
7. **Rewrite ocap-kernel's thin `transport.ts`** (`initTransport` constructs `ConnectionFactory`
   - delegates to `makeChannelNetlayer`); update `connection-factory.ts` imports; split
     `constants.ts`; wire ocap-kernel deps + tsconfig refs (§2.3).
8. **Rewire ocap-kernel `remotes/types.ts`** to re-export netlayer types (§4); confirm
   `index.ts` and `PlatformServices` still typecheck.
9. **Scaffold + implement `@metamask/netlayer-loopback`** (§2.2, §5) with its own tests
   (two-party message + reply, incarnation callback, no-op methods, stop-then-send throws).
10. **Demonstration** (§6): loopback `PlatformServices` util + new two-party test + convert the
    RemoteManager.test.ts subset.
11. **Full verification** (§8); update changelogs for `@metamask/ocap-kernel` and the two new
    packages (they start at 0.1.0 — add an "Uncategorized"/initial-release entry via the
    `update-changelogs` skill).

## 8. Verification

- `yarn install` clean; `yarn constraints` passes (workspace dep/version consistency — this is
  where scope/version/publishConfig mistakes on the new packages surface).
- `yarn build` (turbo) — whole graph compiles, including the new project references.
- Per-package: `yarn workspace @metamask/netlayer test:dev:quiet --coverage=true`,
  `yarn workspace @metamask/netlayer-loopback test:dev:quiet --coverage=true`,
  `yarn workspace @metamask/ocap-kernel test:dev:quiet`.
- Full suite: `yarn test:dev:quiet` (root, turbo-cached).
- `yarn lint:fix` in each touched package (eslint + prettier + `depcheck` — depcheck will flag
  any dep listed but unused, or used but unlisted; expect to reconcile netlayer deps here).
- `yarn workspace @ocap/kernel-test test:dev:quiet` (the kernel-test integration suite — it
  runs under the normal test runner; there is no separate `test:integration` script as of
  writing). Runtimes are untouched, so this is a regression gate on the engine move.
- Confirm `yarn workspace @metamask/netlayer run build` produces no libp2p in its output/dep
  tree (`yarn why @libp2p/interface` from `packages/netlayer` should not resolve through
  netlayer's own deps once kernel-errors is libp2p-free).

## 9. Risks and resolutions

Netlayer must **not** depend on ocap-kernel (that would be circular: ocap-kernel →
`@metamask/netlayer`). Enumerating what the moved code imports from ocap-kernel internals and
how each is resolved:

| Coupling                                                                                                                                         | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Channel`/`NetworkChannel`, `OnRemoteGiveUp` imported from `../types.ts` by peer-state-manager, channel-utils, handshake, reconnection-lifecycle | These types **move into `NL/types.ts`**; the machinery imports them locally. No ocap-kernel dependency.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `KRef` (in `remotes/types.ts`)                                                                                                                   | `KRef` is referenced only by `RemoteIdentity`/`RemoteComms`/`RemoteInfo`, which **stay in ocap-kernel**. None of the moved machinery references `KRef`. No leak. Confirmed against the import enumeration.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `@metamask/kernel-errors`                                                                                                                        | Netlayer depends on it — fine **iff** Phase 2 removed `@libp2p/interface` from kernel-errors (precondition #5). If not, netlayer transitively re-imports libp2p. **Blocking; verify first.**                                                                                                                                                                                                                                                                                                                                                                                                                |
| `@metamask/kernel-utils`                                                                                                                         | Neutral utilities (`abortableDelay`, `calculateReconnectionBackoff`, `installWakeDetector`, `retryWithBackoff`, `fromHex`, `toHex`, `DEFAULT_MAX_RETRY_ATTEMPTS`). Add as a netlayer dep; no cycle (kernel-utils does not import ocap-kernel).                                                                                                                                                                                                                                                                                                                                                              |
| `@metamask/logger`                                                                                                                               | Leaf package. Add as dep.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `deriveNetlayerIdentity` currently in ocap-kernel (`remote-comms.ts`)                                                                            | **Move it to `NL/identity.ts`**; ocap-kernel imports it back from `@metamask/netlayer` for its ocap-URL logic. Verify remote-comms.ts's ocap-URL/AES-GCM code (`crypto.subtle`) does not depend on anything only present after the identity move; keep those in ocap-kernel.                                                                                                                                                                                                                                                                                                                                |
| **Engine extraction fidelity** (master plan's top risk)                                                                                          | `transport.ts` encodes subtle races (`reuseOrReturnChannel`, handshake-before-register, restart suppression, `readChannel` finally-cleanup). Move it verbatim; the only allowed edits are (a) drop provider construction/keySeed, (b) `../types` → `./types`, (c) add handshake `v` field. Move `transport.test.ts` intact.                                                                                                                                                                                                                                                                                 |
| **Test files still importing libp2p**                                                                                                            | `handshake.test.ts` imports `UnexpectedEOFError` from `@libp2p/utils`; `transport.test.ts` (110KB) likely mocks libp2p. Phase 1 was supposed to neutralize these. If they still import `@libp2p/*`, the netlayer package would need libp2p as a devDependency — **not acceptable**. Replace with the neutral EOF/reset errors from `kernel-errors` and a mock `ChannelProvider`. Budget time for this if Phase 1 left it.                                                                                                                                                                                   |
| **`ChannelProvider` method surface vs. what the engine calls**                                                                                   | The engine currently calls `connectionFactory.dialIdempotent(peerId, hints, boolean)`, `onInboundConnection`, `closeChannel(channel, peerId)`. The `ChannelProvider` sketch uses `dial(peerId, hints)`, `onInboundChannel`, `closeChannel(channel)`. Reconcile: either the Phase-1 `ConnectionFactory` already exposes the sketch's names, or `makeChannelNetlayer` calls the sketch names and ocap-kernel's `ConnectionFactory` is adapted to them. Enumerate the exact provider calls in the moved engine and make the `ChannelProvider` type match them so libp2p and loopback impls share one contract. |
| **`constants.ts` split correctness**                                                                                                             | If a neutral machinery file still imports a "libp2p-only" constant (or vice-versa) after the split, the build breaks or ocap-kernel keeps a phantom dep on netlayer constants. Grep every constant usage across both packages after the split.                                                                                                                                                                                                                                                                                                                                                              |
| **`harden` under test**                                                                                                                          | Machinery calls `harden(this)`/`harden(Class)`. The new packages' vitest must load `mock-endoify` (per `kernel-platforms`) or tests throw "harden is not defined". Set up before moving code.                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Coverage thresholds**                                                                                                                          | If `@ocap/repo-tools` vitest config enforces per-file coverage, the moved files must clear it. They arrive with their tests, so this should hold; run `--coverage=true` on both new packages to confirm.                                                                                                                                                                                                                                                                                                                                                                                                    |

## 10. Estimate

**~2–3 dev-days**, matching the master plan, **assuming Phases 1–2 landed cleanly**. Roughly:
0.5 day scaffolding + references + deps reconciliation (constraints/depcheck churn); 1 day
moving machinery + engine + types and getting `@metamask/netlayer` green; 0.5 day loopback
impl + its tests; 0.5 day the demonstration (loopback PlatformServices util, two-party test,
RemoteManager.test.ts subset conversion); 0.5 day full verification + changelogs.

**Add ~0.5–1 day** if any precondition is unmet — most likely: `handshake.test.ts`/
`transport.test.ts` still import `@libp2p/*` (needs neutralizing), or `ConnectionFactory` is not
yet a clean `ChannelProvider` (needs the provider/engine separation done here). Verify
preconditions first; if the engine still constructs libp2p internally, this becomes a ~4-day
phase because the Phase-1 separation lands here.
