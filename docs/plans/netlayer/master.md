# Pluggable Netlayer Abstraction for ocap-kernel

## Context

Issue [#968](https://github.com/MetaMask/ocap-kernel/issues/968) proposes investigating iroh as a
replacement for libp2p, and explicitly raises the option of "a clean network comms layer that can
be configured to use either." Verdict from research: **the netlayer abstraction is a good idea and
a medium lift** — and it is a _prerequisite_ for iroh, not an alternative to it:

- iroh 1.0 (June 2026) has stable wire protocol + official Node.js napi bindings. Browser support
  is wasm-only: relay connections work (e2e encrypted, interoperable with native iroh nodes), but
  there are no direct connections or hole punching from the browser — all browser traffic transits
  relays permanently, a regression vs. libp2p's WebRTC upgrade path. There is no npm wasm package;
  we'd maintain our own Rust wrapper crate + wasm-bindgen build. So a wholesale swap is viable but
  costly for browsers. The netlayer turns that from an architectural blocker into a per-netlayer
  packaging decision: a future `@metamask/netlayer-iroh` ships `./nodejs` (napi) now and an
  optional browser/wasm entry point if/when the trade-offs justify it, while browsers can
  otherwise keep libp2p or plain WebSocket.
- Some target clients have no use for either: single-kernel apps (want zero libp2p dep weight —
  ocap-kernel currently carries ~15 libp2p deps), simple client-server apps (plain WebSocket to a
  known endpoint), and in-process/same-device multi-kernel setups (tests, embedded).
- The seam mostly exists already: the kernel core consumes string-based `PlatformServices`
  (`packages/ocap-kernel/src/types.ts:529-584`) and `RemoteComms`
  (`packages/ocap-kernel/src/remotes/types.ts`); no libp2p objects cross the send/receive path.
  The remaining coupling is (a) the libp2p implementation physically living in
  `packages/ocap-kernel/src/remotes/platform/`, and (b) semantic leaks: libp2p Ed25519 peerIds and
  relay multiaddrs baked into the `ocap:{oid}@{peerId},{hints}` URL format, persisted store keys
  (`peerId`, `keySeed`, `knownRelays`), and CLI/extension config.

### User decisions (fixed)

1. **First milestone:** netlayer interface + libp2p repackaged as one impl + small second impl(s)
   (loopback and/or WebSocket) to prove the interface. Iroh later, as a Node-only netlayer.
2. **Target clients:** no-remote-comms, simple client-server (WebSocket), in-process/loopback.
   Not (yet) a public third-party extension point.
3. **Compatibility:** break freely — persisted keys, `ocap:` URL format, config shapes may change
   without migration.
4. **Packaging:** separate packages; kernel-facing types re-exported from ocap-kernel.

## Package layout

| Package                              | Contents                                                                                                                                                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@metamask/netlayer` (new)           | `Netlayer`/hooks/factory types, `NetworkChannel`/`ChannelProvider` seam, the channel-session engine (refactored `transport.ts`), shared machinery (peer-state, reconnection, rate-limiting, validators, handshake), neutral Ed25519 identity helpers |
| `@metamask/netlayer-libp2p` (new)    | `ConnectionFactory` as a `ChannelProvider`, libp2p error mapper, multiaddr utils; `./nodejs` subpath (QUIC/TCP direct transports); `./relay` subpath (relay server moved from `kernel-utils/src/libp2p-relay.ts`)                                    |
| `@metamask/netlayer-loopback` (new)  | In-process hub netlayer: standard test fake + embedded multi-kernel                                                                                                                                                                                  |
| `@metamask/netlayer-websocket` (new) | Plain WS client-server netlayer; `./nodejs` subpath for server side                                                                                                                                                                                  |
| `@metamask/ocap-kernel`              | Keeps `PlatformServices`, `RemoteComms`, RemoteHandle/Ken protocol, ocap-URL logic, store. Re-exports netlayer types. **Loses all libp2p deps.**                                                                                                     |

Note: netlayer types are _defined_ in `@metamask/netlayer` (so impls don't depend on the whole
kernel) and re-exported from ocap-kernel. Scaffold with the `create-package` skill — it forces the
`@ocap/` scope and derives the directory from the unscoped name, so scaffold then rename to
`@metamask/*` with `publishConfig`/`exports` copied from an existing published package. Add
tsconfig `references` per CLAUDE.md. Follow the subpath-export pattern already used by
`kernel-platforms`.

## Core interface (sketch)

This sketch is the intended end state; where a phase plan and landed code refine it, the landed
code wins. Known refinements from phase planning: `ChannelProvider.dial` carries a third
`withRetry: boolean` argument (the engine distinguishes retry-dials from reconnection-lifecycle
dials); `ChannelProvider.peerId` arrives in Phase 3 (Phase 1's internal seam has no provider
identity); and `makeChannelNetlayer` shares an `AbortController` with the provider (the engine's
`stop()` must abort the signal the provider was constructed with).

```ts
// @metamask/netlayer — kernel-facing contract. Peers/messages are opaque strings.
export type Netlayer = {
  readonly peerId: string;                                   // neutral encoding, see Identity
  sendRemoteMessage: (to: string, message: string) => Promise<void>;
  closeConnection: (peerId: string) => Promise<void>;
  registerLocationHints: (peerId: string, hints: string[]) => void;
  reconnectPeer: (peerId: string, hints?: string[]) => Promise<void>; // may be no-op
  resetAllBackoffs: () => void;                              // may be no-op
  getListenAddresses: () => string[];                        // netlayer-specific hint strings
  stop: () => Promise<void>;
};

export type NetlayerHooks = {
  handleMessage: (from: string, message: string) => Promise<string | null>;
  onRemoteGiveUp?: (peerId: string) => void;
  onIncarnationChange?: (peerId: string, observedIncarnation: string) => Promise<boolean>;
};

export type NetlayerParams<Config> = {
  keySeed: string;              // netlayer MUST authenticate as the derived Ed25519 key
  incarnationId?: string;
  hooks: NetlayerHooks;
  config: Config;               // netlayer-specific, superstruct-validated by the impl
  logger?: Logger;
};
export type NetlayerFactory<Config = Json> = (params: NetlayerParams<Config>) => Promise<Netlayer>;
export type NetlayerSpecifier = { netlayer: string; config: Json }; // Json → crosses postMessage
export type NetlayerRegistry = Record<string, NetlayerFactory>;

// Internal seam for channel-based impls (today's `Channel` made libp2p-free):
export type NetworkChannel = {
  peerId: string;
  read: () => Promise<Uint8Array>;      // throws mapped kernel-errors
  write: (data: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
  setInactivityTimeout: (ms: number) => void; // may be no-op
};
export type ChannelProvider = {
  readonly peerId: string;
  dial: (peerId: string, hints: string[]) => Promise<NetworkChannel>;
  onInboundChannel: (handler: (channel: NetworkChannel) => void) => void;
  onPeerDisconnect: (handler: (peerId: string) => void) => void;
  closeChannel: (channel: NetworkChannel) => Promise<void>;
  getListenAddresses: () => string[];
  stop: () => Promise<void>;
};
// Engine: refactored transport.ts — provider + hooks + options → Netlayer
export const makeChannelNetlayer: (params: {...}) => Netlayer;
```

### Design decisions

- **Kernel-side (unchanged):** Ken-protocol seq/ack, `RemoteHandle`, retransmission, ocap-URL
  issue/redeem, hint-pool persistence (store treats addr strings as opaque). Netlayer contract:
  best-effort ordered delivery per live connection, may drop on reconnect — matches what the
  kernel already assumes (`docs/ken-protocol-assessment.md`).
- **Handshake/incarnation: netlayer-side** via shared helpers in `@metamask/netlayer`
  (`handshake.ts` already only consumes the channel type). Version the handshake message (`v`
  field) since we're breaking compat anyway. Loopback calls `onIncarnationChange` directly.
- **Reconnection/backoff: shared utility, not contract.** `ReconnectionManager`,
  `reconnection-lifecycle`, `PeerStateManager`, rate limiters, validators move to
  `@metamask/netlayer` and are consumed by `makeChannelNetlayer`.
- **Identity: kernel-owned, neutral.** Kernel keeps `keySeed`; neutral peerId = base58btc
  multibase of the raw Ed25519 pubkey via `@noble/curves` (replacing `@libp2p/crypto` +
  `@libp2p/peer-id` in `remotes/kernel/remote-comms.ts`). AES-GCM for ocap-URL oid encryption
  moves to WebCrypto `crypto.subtle`. All kernel state and the `ocap:` URL host use the neutral
  id; hints stay netlayer-specific opaque strings. libp2p (and later iroh — its NodeId is the
  same raw pubkey) converts at its own boundary in `connection-factory.ts`.
- **Retryability: netlayer concern.** New neutral error classes in `kernel-errors`
  (`ChannelResetError`, `IntentionalDisconnectError`, `MessageTooLargeError`); each provider maps
  raw transport errors to them. Sequencing matters: Phase 1's mapper covers the read path only, so
  Phase 2 drops kernel-errors' `@libp2p/interface` _import_ while keeping dial-path classification
  by error _name_ (behavior-preserving); the name-sniffing branches move into netlayer-libp2p's
  error mapper in Phase 4.
- **Config split:** kernel-level options (`mnemonic`, `maxQueue`, `ackTimeoutMs`,
  `maxUrlRelayHints`, `maxKnownRelays`) stay in ocap-kernel; the rest of `RemoteCommsOptions`
  becomes per-netlayer config. `PlatformServices.initializeRemoteComms` becomes an options bag
  taking a `NetlayerSpecifier`; `NodejsPlatformServices` and `PlatformServicesServer` are
  constructed with a `NetlayerRegistry`. The browser postMessage boundary keeps working because
  the specifier's `config` is `Json` (update superstruct in `rpc/platform-services/`).
  The internal `directTransports` option dies in 4b — the libp2p `./nodejs` factory owns QUIC/TCP.
  (During 4a, existing sniffing keeps flowing through the compatibility shim, which must not make
  the `./nodejs` subpath reachable from ocap-kernel — browser bundling; see the Phase 4 plan §2.6.)

## Phases (one PR each, CI green after each)

Each phase has a detailed plan in this directory (`phase-1.md` … `phase-6.md`). The
phase plans for 2–6 were written before their predecessors landed: **before executing phase N,
revise its plan against the actually-merged state of phases 1..N−1** — cross-phase symbol names,
signatures, and line numbers in those documents are indicative, and the landed code wins.

**Phase 1 — Internal seam refactor** (ocap-kernel only, no new packages). ~3–4 days.
**DONE** (issue #968, PR on branch `rekm/netlayer-1`).
Replace `Channel` with `NetworkChannel`/`ChannelProvider`; `ConnectionFactory` produces
`NetworkChannel`s (lpStream wrapping, inactivity timeout, error mapping move inside it); add
neutral error classes to kernel-errors; `transport.ts` becomes libp2p-import-free
(`makeChannelNetlayer` shape). Mechanical refactor — move tests intact, no "improvements".
Verify: existing unit + `kernel-test` integration tests.

Landed decisions / deviations from the phase-1 plan (these are the facts Phase 2 must build on):

- **`closeChannel` is single-arg.** `ChannelProvider.closeChannel(channel: NetworkChannel)` — the
  `peerId` second argument was dropped (`NetworkChannel.peerId` carries it). The graceful-close-then-abort
  body moved to a private `ConnectionFactory.#closeStream(stream, peerId)`, reached via
  `NetworkChannel.close()`.
- **`dialIdempotent` renamed to `dial`.** Signature unchanged: `dial(peerId, hints, withRetry)`.
- **`onInboundConnection` renamed to `onInboundChannel`**; handler type `InboundConnectionHandler`
  renamed to `InboundChannelHandler`.
- **Neutral error classes carry no `data`.** `ChannelResetError`, `IntentionalDisconnectError`,
  `MessageTooLargeError` each use `data: optional(never())` and rely on `cause`. Messages:
  `"Channel reset by remote peer"`, `"Remote peer intentionally disconnected"`,
  `"Inbound message exceeds size limit"`. All three are registered in `errorClasses` (errors/index.ts)
  and exported from the barrel.
- **Read-error mapper.** `mapLibp2pReadError(problem)` and `isIntentionalDisconnect(problem)` are
  module-private functions in `connection-factory.ts`, applied inside `NetworkChannel.read`. Mapping
  order: `InvalidDataLength*` → `MessageTooLargeError`; `StreamResetError` → `ChannelResetError`; SCTP
  user-abort (`errorDetail==='sctp-failure' && sctpCauseCode===12`) → `IntentionalDisconnectError`;
  everything else (incl. `UnexpectedEOFError`) passes through unchanged. `isIntentionalDisconnect`
  no longer checks `StreamResetError` (that was dead code — the reset branch runs first in the mapper).
- **Engine + wrapper.** `transport.ts` exports `makeChannelNetlayer({ provider, hooks, options, logger,
stopController })` (synchronous engine) and keeps `initTransport(...)` as a signature-compatible async
  wrapper that builds the `ConnectionFactory` provider and delegates. `makeChannelNetlayer` and the
  `ChannelNetlayer`/`ChannelNetlayerHooks`/`ChannelNetlayerOptions` types are **not** exported from the
  package barrel (kept internal). AbortController wiring uses **option (A)**: `initTransport` owns the
  `AbortController`, passes `signal` to `ConnectionFactory.make` and the whole `stopController` to
  `makeChannelNetlayer`; the engine's `stop()` calls `stopController.abort()`.
- `types.ts`, `transport.ts`, `channel-utils.ts`, `handshake.ts` are libp2p-import-free. Runtimes
  (`kernel-node-runtime`, `kernel-browser-runtime`) were not touched.

**Phase 2 — Neutral identity.** ~2–3 days.
`remote-comms.ts` → `@noble/curves` + WebCrypto + neutral peerId; id conversion added to
`connection-factory.ts`; kernel-errors drops libp2p imports; `ocap:` URL format changes.
Verify: two-kernel relay integration test, URL round-trip tests, fresh-storage e2e.
**DONE** (issue #968, PR on branch `rekm/netlayer-2`, stacked on `rekm/netlayer-1`).

Landed decisions / deviations from the phase-2 plan (these are the facts Phase 3 must build on):

- **Neutral identity helpers live in `packages/ocap-kernel/src/remotes/kernel/identity.ts`**
  (libp2p-free; `@noble/curves/ed25519` + `multiformats/bases/base58` only), exported from the
  ocap-kernel barrel (`src/index.ts`) as `deriveNeutralPeerId`, `neutralPeerIdToPublicKey`,
  `publicKeyToNeutralPeerId`. Signatures: `deriveNeutralPeerId(seed: Uint8Array): string`,
  `neutralPeerIdToPublicKey(peerId: string): Uint8Array` (throws on wrong length),
  `publicKeyToNeutralPeerId(publicKey: Uint8Array): string`. There is **no** `deriveNetlayerIdentity`
  wrapper and no key-material struct — the peerId is just the base58btc string. Phase 3 moves this
  whole file to `@metamask/netlayer` and re-exports it from ocap-kernel.
- **peerId encoding:** multibase base58btc (`z…` prefix) of the raw 32-byte Ed25519 public key,
  i.e. `base58btc.encode(ed25519.getPublicKey(seed))`. The `keySeed` remains a 32-byte hex seed,
  unchanged. Vector: all-zero seed → `z4zvwRjXUKGfvwnParsHAS3HuSVzV5cA4McphgmoCtajS`.
- **`ocap:` URL format** (string shape `ocap:{oid}@{host}[,{hint}]*` unchanged): `host` is now the
  neutral `z…` id; `oid` is `base58btc.encode(iv(12) ‖ ciphertext ‖ gcmTag(16))` using WebCrypto
  `crypto.subtle` AES-256-GCM with the 32-byte `ocapURLKey` used **directly** (no PBKDF2/salt),
  a fresh random 12-byte IV per encryption. `hints` are still opaque libp2p relay multiaddrs.
- **remote-comms.ts crypto:** the AES key is imported lazily+memoized inside `initRemoteIdentity`
  via a `getAesKey()` closure (`crypto.subtle.importKey('raw', ocapURLKey, {name:'AES-GCM'}, false,
['encrypt','decrypt'])`), so identities that never issue/redeem a URL never touch `crypto.subtle`.
  The "amateur cryptography" warning is retained. `KREF_MIN_LEN` (16) padding retained.
- **id conversion at the libp2p boundary lives in `connection-factory.ts`** (still in ocap-kernel
  until Phase 4): a private `#toLibp2pPeerId(neutralId)` = `peerIdFromPublicKey(publicKeyFromRaw(
neutralPeerIdToPublicKey(neutralId))).toString()`. `dial(neutralPeerId, hints, withRetry)` keeps
  `#inflightDials` keyed by the **neutral** id and converts to the libp2p id only for
  `candidateAddressStrings`/`openChannel*`; `openChannelOnce`/`openChannelWithRetry` gained a third
  `neutralPeerId` param (defaults to the libp2p `peerId` arg) that is stamped onto the returned
  channel via `#makeNetworkChannel(stream, neutralPeerId)`. Inbound handler and `peer:disconnect`
  derive the neutral id from `connection.remotePeer.publicKey.raw` /
  `evt.detail.publicKey.raw` via `publicKeyToNeutralPeerId`, and **drop** (log + return) if the
  public key is absent. The `#relayPeerIds` guard stays in libp2p-id space. `connection-factory.ts`
  therefore imports `neutralPeerIdToPublicKey`/`publicKeyToNeutralPeerId` from `../kernel/identity.ts`
  **and** `publicKeyFromRaw` (`@libp2p/crypto/keys`) + `peerIdFromPublicKey` (`@libp2p/peer-id`).
  **Phase 3 note:** when `identity.ts` moves to `@metamask/netlayer`, `connection-factory.ts`
  (which stays in ocap-kernel until Phase 4) must import those two neutral helpers back from
  `@metamask/netlayer`.
- **`@metamask/kernel-errors` is now libp2p-free.** `isRetryableNetworkError` no longer imports
  `@libp2p/interface`: it imports `ChannelResetError` (retryable) and classifies `MuxerClosedError`
  by `error.name` (behavior-preserving). The `MuxerClosedError`/`Dial`/`Transport`/`NO_RESERVATION`
  name/message sniffing is annotated as libp2p-specific and slated to move to
  `@metamask/netlayer-libp2p`'s error mapper in Phase 4. `@libp2p/interface` removed from
  `kernel-errors/package.json` (its only libp2p usage).
- **Deps:** `@noble/curves` (`^1.9.7`) added to `ocap-kernel/package.json`. All `@libp2p/*`,
  `libp2p`, `@chainsafe/*`, `@multiformats/multiaddr`, `multiformats` deps **stay** in ocap-kernel
  (connection-factory still uses them); removal is Phase 4. `@libp2p/crypto`/`@libp2p/peer-id`
  removed from the private `@ocap/kernel-test` package (its fake platform-services now uses
  `deriveNeutralPeerId`).
- **No migration:** persisted `peerId`/`ocapURLKey` and previously issued `ocap:` URLs are
  incompatible by design; verification used fresh storage.

**Phase 3 — Create `@metamask/netlayer` + `@metamask/netlayer-loopback`.** ~2–3 days.
Move shared machinery + engine + types (with tests) out of `remotes/platform/`; ocap-kernel
re-exports types. Implement loopback (in-memory hub keyed by peerId); use it to replace
hand-rolled `PlatformServices` mocks in some ocap-kernel tests. ocap-kernel still hosts the
libp2p provider, so runtimes are untouched. Verify: full suite, `yarn constraints`.
**DONE** (issue #968, PR on branch `rekm/netlayer-3`, stacked on `rekm/netlayer-2`).

Landed decisions / deviations from the phase-3 plan (these are the facts Phase 4 must build on):

- **`@metamask/netlayer` (new, `0.1.0`, published, single `.` export).** Barrel exports:
  - Engine: `makeChannelNetlayer({ provider, hooks, options, logger, stopController }) => Netlayer`
    (synchronous; **kept the Phase-1 landed signature** — `stopController` is passed through, not a
    bare `incarnationId` param; the local incarnation lives in `options.localIncarnationId`).
  - Identity: `deriveNeutralPeerId`, `neutralPeerIdToPublicKey`, `publicKeyToNeutralPeerId` (moved
    verbatim from `remotes/kernel/identity.ts`).
  - Shared machinery: `PeerStateManager`, `ReconnectionManager`, `PERMANENT_FAILURE_ERROR_CODES`,
    `makeReconnectionLifecycle`, `makeMessageRateLimiter`, `makeConnectionRateLimiter`,
    `SlidingWindowRateLimiter`, `makeMessageSizeValidator`, `makeConnectionLimitChecker`,
    `makeErrorLogger`, `writeWithTimeout`, `performInboundHandshake`, `performOutboundHandshake`,
    `isHandshakeMessage`, `HANDSHAKE_VERSION` (= `1`), plus the neutral engine constants
    (`DEFAULT_MAX_CONCURRENT_CONNECTIONS`, `DEFAULT_MAX_MESSAGE_SIZE_BYTES`,
    `DEFAULT_CLEANUP_INTERVAL_MS`, `DEFAULT_STALE_PEER_TIMEOUT_MS`, `DEFAULT_WRITE_TIMEOUT_MS`,
    `DEFAULT_MESSAGE_RATE_LIMIT`, `DEFAULT_MESSAGE_RATE_WINDOW_MS`, `DEFAULT_CONNECTION_RATE_LIMIT`,
    `DEFAULT_CONNECTION_RATE_WINDOW_MS`, `HANDSHAKE_TIMEOUT_MS`, `STREAM_INACTIVITY_TIMEOUT_MS`,
    `MIN_STREAM_INACTIVITY_TIMEOUT_MS`, `DEFAULT_CONSECUTIVE_ERROR_THRESHOLD`).
  - Types: `Netlayer`, `NetlayerHooks`, `NetlayerParams`, `NetlayerFactory`, `NetlayerSpecifier`,
    `NetlayerRegistry`, `NetworkChannel`, `ChannelProvider`, `InboundChannelHandler`,
    `PeerDisconnectHandler`, `RemoteMessageHandler`, `SendRemoteMessage`, `StopRemoteComms`,
    `OnRemoteGiveUp`, `OnIncarnationChange`, `ChannelNetlayerOptions`, `PeerState`,
    `ReconnectionState`, `ErrorRecord`, `HandshakeMessage`, `HandshakeResult`, `HandshakeDeps`,
    `ErrorLogger`, `ReconnectionLifecycle`, `ReconnectionLifecycleDeps`.
  - Deps: `@metamask/kernel-errors`, `@metamask/kernel-utils`, `@metamask/logger`,
    `@metamask/utils` (`Json`), `@noble/curves`, `multiformats`, `uint8arrays`. **`@metamask/superstruct`
    was dropped** (the plan listed it, but netlayer defines no struct helpers yet — depcheck flags
    unused deps; add it back in Phase 5 when the websocket netlayer needs config structs).
    `@types/node` is a devDep. No libp2p anywhere in its tree.
- **`ChannelProvider` gained `readonly peerId: string`** and `Netlayer` gained `readonly peerId`
  (Phase-3 work per plan §3). `ConnectionFactory` implements it via a `get peerId()` returning a
  `#neutralPeerId` field set in the constructor as `deriveNeutralPeerId(fromHex(options.keySeed))`.
  The engine's returned `Netlayer.peerId` is `provider.peerId`. The returned netlayer is `harden`ed.
- **Handshake is versioned.** `HandshakeMessage` now carries `v: number` (current `HANDSHAKE_VERSION = 1`),
  sent on every handshake/handshakeAck; `isHandshakeMessage` requires a numeric `v`. Compat is broken
  by design.
- **What moved to `@metamask/netlayer/src/`** (tests moved with each): `peer-state-manager.ts`,
  `reconnection.ts`, `reconnection-lifecycle.ts`, `rate-limiter.ts`, `validators.ts`,
  `channel-utils.ts`, `handshake.ts`, `identity.ts`, the neutral subset of `constants.ts`, and
  `transport.ts`'s `makeChannelNetlayer` engine → `channel-netlayer.ts` (+ its test as
  `channel-netlayer.test.ts`, which now drives the engine through a mock `ChannelProvider` via a
  local `initTransport` shim; the three `ConnectionFactory.make`-argument assertions stayed in
  ocap-kernel). New files: `types.ts`, `index.ts`.
- **What ocap-kernel keeps in `remotes/platform/`:** `connection-factory.ts` (+test) — still the
  libp2p `ChannelProvider`, now importing `NetworkChannel`/`InboundChannelHandler`/
  `PeerDisconnectHandler` + `DEFAULT_MAX_MESSAGE_SIZE_BYTES` + `deriveNeutralPeerId`/
  `neutralPeerIdToPublicKey`/`publicKeyToNeutralPeerId` from `@metamask/netlayer` (its
  `connection-factory.test.ts` now `vi.mock('@metamask/netlayer', ...)` with `importOriginal` to
  stub the three identity helpers); `lp-framing.test.ts`; a reduced `constants.ts` (libp2p-only:
  `SCTP_USER_INITIATED_ABORT`, `RELAY_RECONNECT_*`); and a **new thin `transport.ts`** whose
  `initTransport(...)` (unchanged public signature, now returns `Netlayer`) builds `ConnectionFactory`
  and delegates to `makeChannelNetlayer`. `remote-comms.ts` imports `deriveNeutralPeerId` from
  `@metamask/netlayer` (its ocap-URL/AES-GCM code stays put).
- **ocap-kernel re-export surface:** `remotes/types.ts` re-exports the netlayer contract types
  (`NetworkChannel`, `ChannelProvider`, `RemoteMessageHandler`, `SendRemoteMessage`, `StopRemoteComms`,
  `OnRemoteGiveUp`, `OnIncarnationChange`, `Netlayer`, `NetlayerHooks`, `NetlayerFactory`,
  `NetlayerParams`, `NetlayerSpecifier`, `NetlayerRegistry`, `InboundChannelHandler`,
  `PeerDisconnectHandler`) and keeps `RemoteIdentity`/`RemoteComms`/`RemoteInfo`/`RemoteCommsOptions`/
  `DirectTransport`/`ConnectionFactoryOptions` local. `src/index.ts` still exports `initTransport` and
  the three identity helpers (now sourced from `@metamask/netlayer`), and adds the netlayer type
  surface. `PlatformServices` shape is unchanged. Deps: `@metamask/netlayer` (dependency),
  `@metamask/netlayer-loopback` (devDependency, test fake).
- **`@metamask/netlayer-loopback` (new, `0.1.0`, published, single `.` export).** Exports
  `makeLoopbackHub`/`LoopbackHub`/`LoopbackRegistration` and `makeLoopbackNetlayer`/`LoopbackConfig`.
  The hub is an **explicit object passed via `config.hub`** (no global state); `register(peerId,
receive, incarnationId)` / `unregister` / `getIncarnation` / `deliver(from, to, msg) => reply`.
  `makeLoopbackNetlayer` derives its peerId with `deriveNeutralPeerId(fromHex(keySeed))`, registers
  with the hub, and returns a hardened `Netlayer`: `sendRemoteMessage` routes through
  `hub.deliver` and feeds any reply back into its own `handleMessage` (mirroring the engine's reply
  path); `onIncarnationChange` fires once per peer on first contact with the peer's registered
  incarnation (no handshake); `closeConnection` marks a peer so sends throw `IntentionalCloseError`
  (cleared by `reconnectPeer`); `stop` unregisters and makes sends throw `NetworkStoppedError`;
  `registerLocationHints`/`resetAllBackoffs` are no-ops; `getListenAddresses` returns `[]`.
  Config `hub` is a live object (not `Json`), so a loopback specifier can't cross postMessage —
  same-realm only. Deps: `@metamask/kernel-errors` (**added — the plan's §2.2 list omitted it but
  the throw-`NetworkStoppedError`/`IntentionalCloseError` behavior needs it**), `@metamask/kernel-utils`,
  `@metamask/netlayer`, `@metamask/superstruct`; `@metamask/logger` was **not** added (unused).
- **Demonstration:** `packages/ocap-kernel/test/loopback-platform-services.ts` provides
  `makeLoopbackPlatformServices({ hub })` (its per-call `keySeed`/`incarnationId` come from
  `initializeRemoteComms`'s arguments — the plan's construction-time `keySeed`/`incarnationId` were
  dropped as redundant), and `packages/ocap-kernel/src/remotes/loopback.test.ts` is a two-party
  in-process message+reply test through the real `PlatformServices.initializeRemoteComms` path.
  **`RemoteManager.test.ts` was NOT converted** to loopback (the plan's optional §6.3) — the new
  two-party test is the credible demonstration; `makeMockPlatformServices` stays as-is.
- **Coverage:** `@metamask/netlayer` 90.45% stmts / 90.31% branch / 88.46% func / 90.39% line;
  `@metamask/netlayer-loopback` 97.56% stmts / 95.83% branch. `@metamask/ocap-kernel` statements,
  functions, and lines all rose above the pre-phase baseline (93.24→93.7%, 93.85→94.4%, 93.19→93.7%);
  **branch coverage fell ~0.4% (85.9→85.5%)** — a purely arithmetic effect of extracting ~247 branches
  that were covered at ~91.5% (well above the package average) into netlayer, where they remain
  covered at 90.31%. No source lost test coverage.

**Phase 4 — Extract `@metamask/netlayer-libp2p` + runtime injection.** ~5–6 days (split 4a/4b).

- 4a: new package gets connection-factory, lp-framing, `utils/multiaddr.ts`, error mapper,
  browser-default factory + `./nodejs` factory (QUIC/TCP sniffing moved from
  `kernel-node-runtime/src/kernel/PlatformServices.ts`), relay server under `./relay`
  (kernel-cli `relay` command repointed). ocap-kernel temporarily re-exports `initTransport`.
- 4b: flip injection — options-bag `initializeRemoteComms` + `NetlayerRegistry` in
  `NodejsPlatformServices` and `PlatformServicesServer`/`Client`; update RPC structs, kernel-cli
  config, extension `offscreen.ts` (hard-coded relay → config), `comms-query-string.ts`. Remove
  `initTransport` export and all libp2p deps from ocap-kernel. Relocate kernel-shims' bare
  `import '@libp2p/webrtc'` (endoify-node.js) alongside the libp2p netlayer — flag for review.
  Verify: full CI, extension e2e, `kernel-test` remote-comms integration, `ocap relay` smoke test.

**Phase 5 — `@metamask/netlayer-websocket`.** ~3–4 days.
`ChannelProvider` over WebSocket: client dials `wss://` hints (browser + node); `./nodejs` server
authenticates peers via mutual Ed25519 challenge-signature handshake (new security-sensitive
code — keep minimal, flag for crypto review). Topology decision: the hub is a **kernel
endpoint** (star), not a forwarder — spokes talk to the hub kernel; spoke↔spoke is deliberately
unsupported (that's what the libp2p netlayer's relays are for). Reuses `makeChannelNetlayer` +
shared machinery — this is the proof the abstraction isn't libp2p-shaped. Parameterize
`kernel-test` integration over netlayers (loopback always; libp2p/websocket where infra allows).

**Phase 6 — Cleanup + docs.** ~1–2 days.
Optional relay→"location hints" terminology rename in store/`RemoteIdentity`, glossary entries,
changelogs (update-changelogs skill), "writing a netlayer" doc, note iroh as the next (Node-only)
implementation with a pointer to #968.

**Total: ~16–22 dev-days.**

## Risks

- **Engine extraction fidelity:** `transport.ts` encodes subtle races (`reuseOrReturnChannel`,
  handshake-before-register, restart suppression). Phase 1 must be mechanical, tests moved intact.
- **Error-classification completeness:** the neutral taxonomy must cover everything
  `isRetryableNetworkError`/intentional-disconnect sniffing catches today, or reconnection
  behavior silently changes. Enumerate mappings with per-error-class tests.
- **WebSocket auth:** noise gave authenticated peer identity for free; plain WS needs a
  challenge-signature handshake — new crypto, needs review (codebase already carries an
  "amateur cryptography" warning in `remote-comms.ts`).
- **Extension bundling:** moving libp2p from ocap-kernel into the extension's own dep graph —
  check bundle size/format effects.

## Verification (end-to-end)

- Per phase: `yarn lint:fix`, `yarn build`, `yarn test:dev:quiet` (root, turbo-cached), plus the
  affected packages' `test:integration` where the package defines one. Note the integration test
  package is `@ocap/kernel-test` and (as of writing) runs its integration tests under the normal
  test runner (`test:dev:quiet`), with no separate `test:integration` script.
- After Phase 4: run the extension example (`@ocap/extension` `test:e2e`) and a two-kernel Node
  scenario over the relay (`ocap relay start` + `kernel-test/src/remote-comms.test.ts`) to confirm
  ocap-URL redemption and message delivery across the new injection path.
- After Phase 5: two-kernel WebSocket hub-and-spoke integration test; loopback-based multi-kernel
  test in-process.
- Confirm `packages/ocap-kernel/package.json` has zero `libp2p`/`@libp2p`/`@chainsafe`/
  `@multiformats` deps at the end of Phase 4. (Plain `multiformats` is not libp2p and stays —
  `base58btc` is the neutral identity/oid encoding.)
