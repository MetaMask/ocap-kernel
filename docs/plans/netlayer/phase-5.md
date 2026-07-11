# Phase 5 — `@metamask/netlayer-websocket`

> **⚠️ DEFERRED — NOT BEING EXECUTED IN THIS EFFORT.** Per a user directive after Phase 4, the
> pluggable-netlayer effort skipped straight from Phase 4 to Phase 6 (cleanup + docs), which has
> now **also landed**. This document is preserved as the future-work plan for the WebSocket
> netlayer; it has been reconciled against the landed state of Phases 1–4 **and** Phase 6, so an
> engineer can pick it up cold. Cross-phase symbol names, signatures, and package layout in the
> sketches below are indicative — the merged code and `@metamask/netlayer`'s exported contract win.
>
> **Reconciled against landed Phase 6 (the terminology rename + docs).** Phase 6 renamed the
> kernel-generic "relay" vocabulary to "location hint": persisted KV key `knownRelays` →
> `knownLocationHints`; `RelayEntry` → `LocationHintEntry`; store methods `getLocationHintEntries`
> etc.; `RemoteIdentity.addKnownLocationHints`; kernel-level options `maxUrlLocationHints` /
> `maxKnownLocationHints`. **Crucially, the netlayer-config key `config.knownRelays` was NOT
> renamed** — it is the seam the kernel injects into a netlayer's config by convention, and it keeps
> that name. So this plan's design (§ below) of treating `config.knownRelays` as the carrier for a
> hub-and-spoke WebSocket's `wss://` hub URLs is **unchanged and still correct**; the kernel merges
> and re-injects those opaque hint strings exactly as for libp2p. When this phase resumes, conform
> the netlayer it ships to [`docs/writing-a-netlayer.md`](../../writing-a-netlayer.md) (the contract
> guide Phase 6 added) and reference the [`## Networking` glossary
> entries](../../glossary.md#netlayer) (netlayer, location hint, neutral peer id, hub-and-spoke,
> incarnation handshake). The WS auth handshake (§5) is the piece the guide defers to this plan.
>
> Assumptions Phase 4 already invalidated that this plan still needs updating for when resumed
> (brief, non-exhaustive): `ChannelProvider.dial` is 3-arg `(peerId, hints, withRetry)` (the §4
> sketch shows 2-arg); the libp2p error-name/dial mapping now lives in
> `@metamask/netlayer-libp2p/src/error-mapper.ts` (not kernel-errors), which the WS `errors.ts`
> should mirror; `@metamask/netlayer` still does **not** re-export `@metamask/superstruct` or ship an
> `EngineOptionsStruct`/sign-verify identity wrappers — those must be added when this phase resumes;
> and a pure-websocket Node deployment still pulls `@libp2p/webrtc` transitively because the
> pre-lockdown endoify import relocation was deferred (see master.md Phase 4 deviations).

Implementation plan for the fifth PR in the pluggable-netlayer effort
([issue #968](https://github.com/MetaMask/ocap-kernel/issues/968); master plan at
[`master.md`](./master.md)).

This document is written to be executed by an engineer with no prior context. It **assumes
Phases 1–4 are complete**: `@metamask/netlayer` exists (types, `makeChannelNetlayer` engine,
shared machinery — `PeerStateManager`, `ReconnectionManager`, reconnection-lifecycle, rate
limiters, validators, versioned incarnation `handshake.ts`, neutral Ed25519 identity helpers via
`@noble/curves`); `@metamask/netlayer-loopback` and `@metamask/netlayer-libp2p` exist; the
runtimes accept a `NetlayerRegistry` and per-kernel `NetlayerSpecifier` (`{ netlayer: string;
config: Json }`); `ocap-kernel` is libp2p-free; identity is a neutral base58btc-multibase Ed25519
public key.

The machinery to reuse now lives in **`@metamask/netlayer/src/`** (moved out of
`ocap-kernel` in Phase 3): `channel-netlayer.ts` (the `makeChannelNetlayer` engine),
`reconnection.ts`, `reconnection-lifecycle.ts`, `peer-state-manager.ts`, `rate-limiter.ts`,
`validators.ts`, `handshake.ts`, `channel-utils.ts`, `identity.ts`, `constants.ts`. The libp2p
`ChannelProvider` to mirror is `@metamask/netlayer-libp2p/src/connection-factory.ts` (with its
`make-libp2p-netlayer.ts` wiring and `error-mapper.ts`). Read those to understand the contract you
are implementing against.

> **Reconciled against landed Phases 1–4.** The contract exported by `@metamask/netlayer` wins over
> any sketch below. Key landed facts (see master.md's Phase 1–4 "Landed decisions" blocks):
> `ChannelProvider.dial(peerId, hints, withRetry)` (3-arg) and carries `readonly peerId`;
> `makeChannelNetlayer({ provider, hooks, options, logger, stopController })` is synchronous and
> shares one `AbortController` with the provider; `NetlayerSpecifier = { netlayer: string; config: Json }`,
> `NetlayerRegistry = Record<string, NetlayerFactory>` (config `Json` — validate/narrow
> inside the factory, like `libp2pNetlayerFactory` does); `PlatformServices.initializeRemoteComms`
> is the options bag `{ keySeed, specifier, hooks, incarnationId? }` and the runtimes take a
> `netlayers: NetlayerRegistry`. The websocket netlayer's config must be `Json` (it crosses
> postMessage); the kernel injects `config.knownRelays` (its one convention key) — for a hub-and-
> spoke websocket topology, treat those opaque hint strings as `wss://` hub URLs.
>
> **Follow-up carried from Phase 4:** the kernel-shims `@libp2p/webrtc` pre-lockdown endoify import
> was NOT relocated in Phase 4 (deferred — see master.md). A pure-websocket Node deployment still
> pulls `@libp2p/webrtc` transitively through `@metamask/kernel-node-runtime`'s default registry;
> if Phase 5 wants a libp2p-free websocket-only Node runtime, that relocation (and making the
> default registry configurable without importing the libp2p factory) must be tackled here or in
> Phase 6. `@metamask/netlayer` re-added `@metamask/superstruct` is still pending (Phase 3 dropped
> it as unused); add it back when the websocket config structs need it.

---

## 1. Objective and non-goals

### Objective

Ship `@metamask/netlayer-websocket`: a `ChannelProvider` over plain WebSocket, driving the shared
`makeChannelNetlayer` engine. It proves the netlayer abstraction is not libp2p-shaped by
implementing the same `Netlayer` contract over a transport with a completely different connection
model (message-oriented push frames instead of length-prefixed muxed streams; client-server
instead of P2P mesh) and a completely different security model (application-level Ed25519
challenge-signature auth instead of noise-provided peer identity).

- Default export (`.`) = **client / browser-safe**: dials `wss://` location hints using the global
  `WebSocket` (native in browsers and in Node ≥ 22, which is the repo's `engines.node`).
- `./nodejs` subpath = **server**: listens (via the `ws` package), authenticates each connecting
  peer with an Ed25519 challenge-signature handshake, and hosts a kernel endpoint.
- Parameterize the `kernel-test` integration suite over netlayers (loopback always;
  libp2p/websocket where infra allows).

### Non-goals (explicit)

- **No relays, no forwarding.** The server is a **kernel endpoint** (a spoke connects _to a
  kernel_), not a dumb byte-forwarder between spokes. See §6.
- **No NAT traversal, no hole-punching, no P2P mesh, no peer discovery.** Spokes reach exactly one
  endpoint: the hub they were configured with.
- **No spoke↔spoke connectivity.** Two non-hub kernels cannot reach each other through this
  netlayer; that is what libp2p (relayed) is for. Documented limit, not a bug.
- **Not a public third-party extension point.** The hub is a _trusted-ish rendezvous the deployer
  controls_ — the same operator runs both ends, or the client operator has chosen to trust this
  specific hub. Mutual authentication (§5) protects against impersonation of that known endpoint,
  not against a hostile-but-authenticated hub.
- **No TLS termination in-process by default.** Recommend bare `ws://` behind deployer-provided
  TLS (reverse proxy / load balancer terminating `wss://`). An optional direct-TLS mode is offered
  for single-binary deployments but is not the recommended path.

---

## 2. Package layout and dependencies

Scaffold with the `create-package` skill. Follow the subpath-export pattern already used by
`@metamask/kernel-platforms` (`.`, `./nodejs`, `./package.json`, dual ESM/CJS conditions).

```
packages/netlayer-websocket/
  package.json
  tsconfig.json                # references: @metamask/netlayer, kernel-errors, kernel-utils, logger
  tsconfig.build.json          # same references
  src/
    index.ts                   # '.'      client/browser entry: makeWebSocketNetlayer
    nodejs.ts                  # './nodejs' server entry:      makeWebSocketServerNetlayer
    config.ts                  # superstruct configs + validators (shared by both entries)
    config.test.ts
    ws-channel.ts              # WebSocket -> NetworkChannel adapter (read/write/close/inactivity)
    ws-channel.test.ts
    client-provider.ts         # ChannelProvider (dial); no server imports -> browser-safe
    client-provider.test.ts
    server-provider.ts         # ChannelProvider (listen/accept); imports 'ws'
    server-provider.test.ts
    auth-handshake.ts          # Ed25519 challenge-signature protocol (SECURITY-SENSITIVE)
    auth-handshake.test.ts
    errors.ts                  # WS close-code / event -> neutral kernel-errors mapping
    errors.test.ts
    constants.ts               # protocol version, nonce length, default timeouts/limits, close codes
  README.md
```

### Exports (`package.json`)

- `.` → `src/index.ts` — client. **Must not** transitively import `ws`, `node:*`, or
  `./nodejs`. Verify with a lint rule / bundling check (§9).
- `./nodejs` → `src/nodejs.ts` — server. May import `ws` and `node:http`/`node:https`.
- `./package.json` → `./package.json`.

### Dependencies

| Dependency                            | Where           | Why                                                                                                                                                                                                                                     |
| ------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@metamask/netlayer` (workspace)      | both            | `makeChannelNetlayer`, shared machinery, `NetworkChannel`/`ChannelProvider`/`NetlayerFactory` types, versioned incarnation handshake, **and the neutral-identity crypto helpers** (peerId↔pubkey codec, Ed25519 sign/verify) — see §5. |
| `@metamask/kernel-errors` (workspace) | both            | neutral error classes (`ChannelResetError`, `IntentionalDisconnectError`, `MessageTooLargeError`, `NetworkStoppedError`) added in Phase 1.                                                                                              |
| `@metamask/kernel-utils` (workspace)  | both            | `retryWithBackoff` is inside the engine, but `writeWithTimeout`-style helpers and `installWakeDetector` come via the engine; direct use likely minimal.                                                                                 |
| `@metamask/logger` (workspace)        | both            | logging.                                                                                                                                                                                                                                |
| `@metamask/superstruct`               | both            | config validation.                                                                                                                                                                                                                      |
| `ws` (`^8`)                           | `./nodejs` only | Node WebSocket **server** (no native Node server WebSocket). Not currently used anywhere in the monorepo — this introduces it.                                                                                                          |
| `@types/ws` (dev)                     | —               | types for `ws`.                                                                                                                                                                                                                         |

Client uses the **global `WebSocket`** (DOM lib type; native in browser and Node ≥ 22) — zero
runtime dep. Do not import `ws` on the client path.

Per CLAUDE.md: add `@metamask/netlayer` (and any other new workspace deps) to `references` in both
`tsconfig.json` and `tsconfig.build.json`. Register the package with the runtimes' `NetlayerRegistry`
wiring only in tests for this phase (production registry wiring is a deployment concern; see §6/§7).

---

## 3. Config types (`config.ts`, superstruct)

Two configs share a base. Both are `Json`-compatible (they cross the browser postMessage boundary
inside a `NetlayerSpecifier.config`), so **no functions, no class instances, no `Uint8Array`** in
the config — only JSON scalars, arrays, and plain objects.

Reconnection / rate-limiting / size knobs are **inherited from the shared engine**: they are the
same fields the engine already reads (today's `RemoteCommsOptions` subset consumed by
`makeChannelNetlayer` — `maxRetryAttempts`, `reconnectionBaseDelayMs`, `reconnectionMaxDelayMs`,
`handshakeTimeoutMs`, `writeTimeoutMs`, `streamInactivityTimeoutMs`, `maxConcurrentConnections`,
`maxMessagesPerSecond`, `maxConnectionAttemptsPerMinute`, `maxMessageSizeBytes`). Rather than
re-declaring them, the WS configs embed a `MakeChannelNetlayerOptions` struct exported by
`@metamask/netlayer` and add only WS-specific fields.

```ts
import {
  type Infer,
  object,
  optional,
  string,
  number,
  array,
  boolean,
} from '@metamask/superstruct';
// EngineOptionsStruct: a superstruct for the shared engine knobs above. Phase 3 ships only
// the ChannelNetlayerOptions *type* — if no struct exists in @metamask/netlayer yet, add
// EngineOptionsStruct there as part of this PR (shared, not WS-specific; mirrors the
// identity-wrapper note in §5).

// WS-specific knobs common to client and server.
const WebSocketCommonConfigStruct = object({
  /** Application-level cap on a single WS frame's decoded payload, in bytes. Mirrors the
   *  engine's maxMessageSizeBytes; enforced natively on the server (ws `maxPayload`) and by
   *  hand on the browser client (which has no maxPayload option). Default: DEFAULT_MAX_PAYLOAD_BYTES. */
  maxPayloadBytes: optional(number()),
  /** Timeout (ms) for the auth handshake (§5) to complete before the socket is closed.
   *  Distinct from the engine's handshakeTimeoutMs, which governs the *incarnation* handshake
   *  that runs afterward. Default: DEFAULT_AUTH_TIMEOUT_MS. */
  authTimeoutMs: optional(number()),
});

// Client (default export). Location hints (the wss:// URLs) are NOT config — they arrive per-peer
// via registerLocationHints / the ocap: URL, exactly as relay hints do today. Client config is
// therefore minimal.
export const WebSocketNetlayerConfigStruct = object({
  ...WebSocketCommonConfigStruct.schema,
  ...EngineOptionsStruct.schema,
});
export type WebSocketNetlayerConfig = Infer<
  typeof WebSocketNetlayerConfigStruct
>;

// Server ('./nodejs').
export const WebSocketServerNetlayerConfigStruct = object({
  ...WebSocketCommonConfigStruct.schema,
  ...EngineOptionsStruct.schema,
  /** TCP port to listen on. Required unless `attachToPort` is used by the deployer's own server. */
  port: optional(number()),
  /** Bind address. Default '0.0.0.0'. */
  host: optional(string()),
  /** URL path the server accepts upgrades on. Default '/'. */
  path: optional(string()),
  /** Public wss:// (or ws://) URLs at which this hub is reachable. Returned from
   *  getListenAddresses() and thus embedded as location hints in ocap: URLs the hub issues.
   *  The deployer sets these because a server behind a reverse proxy cannot infer its own
   *  externally-visible URL. Example: ['wss://hub.example.com/']. */
  announceUrls: optional(array(string())),
  /** Optional allowlist of neutral peerIds permitted to connect. When present, a successful
   *  auth handshake from a peerId not in this list is rejected (close 4403). Default: allow any
   *  successfully-authenticated peer. */
  allowedPeerIds: optional(array(string())),
  /** Optional direct-TLS mode for single-binary deployments (NOT recommended; prefer a reverse
   *  proxy). When present, the server runs an https server with these PEM strings. */
  tls: optional(object({ cert: string(), key: string() })),
});
export type WebSocketServerNetlayerConfig = Infer<
  typeof WebSocketServerNetlayerConfigStruct
>;
```

Each factory validates its config with `assert(config, ...Struct)` at construction and throws a
descriptive error on malformed input. `maxPayloadBytes` defaults to and should be reconciled with
the engine's `maxMessageSizeBytes`; if both are set and differ, the smaller wins and the factory
logs a warning (a hub that accepts frames larger than the engine will forward is a foot-gun).

---

## 4. `ChannelProvider` implementation design

The engine (`makeChannelNetlayer`) consumes a `ChannelProvider`:

```ts
type ChannelProvider = {
  readonly peerId: string;
  dial: (peerId: string, hints: string[]) => Promise<NetworkChannel>;
  onInboundChannel: (handler: (channel: NetworkChannel) => void) => void;
  onPeerDisconnect: (handler: (peerId: string) => void) => void;
  closeChannel: (channel: NetworkChannel) => Promise<void>;
  getListenAddresses: () => string[];
  stop: () => Promise<void>;
};
type NetworkChannel = {
  peerId: string;
  read: () => Promise<Uint8Array>; // throws mapped kernel-errors on close/reset
  write: (data: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
  setInactivityTimeout: (ms: number) => void;
};
```

The engine already handles: handshake-before-register, `reuseOrReturnChannel` races, one inbound
read loop per channel (`read()` in a loop until it throws), reconnection/backoff, rate limiting,
size validation on send, stale-peer cleanup, intentional-close bookkeeping. **The WS provider only
supplies channels and maps transport events to `read()` outcomes.** Do not re-implement any engine
concern.

### 4.1 The WS ⇄ `NetworkChannel` adapter (`ws-channel.ts`)

WebSocket is push-based (`onmessage`); `NetworkChannel.read()` is pull-based. Bridge with a small
bounded async queue:

- Maintain an internal queue of received `Uint8Array` frames and a queue of waiting `read()`
  resolvers. On `'message'`: if a reader is waiting, resolve it; else enqueue the frame.
- `read()`: if a frame is queued, return it; else return a promise parked in the reader queue.
- **Framing decision:** none needed. WebSocket is message-oriented — each `send()` is delivered as
  one `'message'` with its boundaries intact. This _replaces_ the libp2p length-prefixed
  `lpStream`; there is no length prefix, no `InvalidDataLength*` handling, no partial-frame
  reassembly. This is the single biggest structural difference from the libp2p provider and the
  clearest demonstration that the engine is transport-agnostic.
- **Binary frames only.** Send with `binaryType`/`ArrayBuffer`; on receipt, normalize
  `event.data` (`ArrayBuffer` in browser, `Buffer`/`ArrayBuffer` in `ws`) to a `Uint8Array`. The
  engine converts to/from UTF-8 strings itself (as it does today with `uint8arrays`); the channel
  deals only in bytes.
- **Max-size enforcement (both directions):**
  - _Server (inbound):_ set `ws` `maxPayload: maxPayloadBytes`. `ws` rejects an over-size frame at
    the protocol layer and closes with 1009; map that close (§4.4) to `MessageTooLargeError`.
  - _Client (inbound):_ the browser `WebSocket` has **no `maxPayload`**. In `onmessage`, check
    `data.byteLength > maxPayloadBytes` before enqueuing; if exceeded, fail the channel: settle the
    current/next `read()` with `MessageTooLargeError` and close the socket (code 1009). This is a
    DoS guard (a hostile hub could stream huge frames at a browser spoke).
  - _Outbound:_ the engine already validates size before calling `write()` (shared
    `makeMessageSizeValidator`), so `write()` need not re-check; but keep a cheap assertion.
- **`write(data)`:** if `socket.readyState !== OPEN`, throw (mapped) synchronously (mirrors
  `writeWithTimeout`'s "stream is <status>" short-circuit). Otherwise `send`. Backpressure: see
  §4.5. The engine wraps `write()` in its own write timeout, so a stalled buffer surfaces as a
  timeout there; the channel just needs to not silently drop.
- **`close()`:** initiate a clean close (code 1000). Mark an internal `intentional` flag _before_
  calling `socket.close()` so the `'close'` handler classifies it as intentional (§4.4) rather than
  a reset. Idempotent.
- **`read()` after close:** once the socket has closed, `read()` (and any parked reader) settles
  by throwing the mapped error derived from the close event / the intentional flag. After the
  terminal error, further `read()` calls throw the same terminal error (do not hang).
- **`setInactivityTimeout(ms)`:** implement (do **not** no-op — half-open TCP is a real WS
  hazard). Keep a timer that is reset on every inbound frame **and** every outbound `write`; on
  expiry, close the socket with a reset-class error so the engine reconnects. Clamp to a minimum
  (mirror `MIN_STREAM_INACTIVITY_TIMEOUT_MS`). This is the WS analogue of libp2p's
  `stream.inactivityTimeout`.
- **`peerId`:** the authenticated remote peerId established by the auth handshake (§5). The channel
  is only constructed **after** auth succeeds, so `peerId` is always the verified value.

Factor the queue/close/inactivity logic into one `makeWsChannel({ socket, peerId, maxPayloadBytes,
logger })` used by both client and server providers; the two providers differ only in how the
`socket` is obtained and how auth is driven.

### 4.2 Client dial flow (`client-provider.ts`)

`dial(peerId, hints)`:

1. Select a `wss://`/`ws://` URL from `hints` (the hints are opaque strings the kernel persists;
   here they are URLs the hub issued via `getListenAddresses`). If several, try in order. If none
   is a valid ws URL, throw a non-retryable error (the engine will not reconnect a peer it has no
   URL for).
2. Open `new WebSocket(url)` with `binaryType = 'arraybuffer'`. Await `'open'` (with a dial
   timeout, mirroring the 30 s cap in `openChannelOnce`); on `'error'`/timeout before open, map to
   `ChannelResetError` (retryable) and throw.
3. Run the **auth handshake as initiator** (§5). During this, the client learns and
   cryptographically verifies the server's peerId. **Verify it equals the `peerId` argument** — if
   the hub presents a different identity than the one the kernel intends to talk to, close and throw
   a non-retryable auth error (impersonation / wrong endpoint).
4. On auth success, wrap the socket with `makeWsChannel({ peerId, ... })` and return it. The engine
   then runs the incarnation handshake (client = outbound) over this channel and registers it.
5. Deduplicate concurrent dials to the same peerId (the engine already does `dialIdempotent`
   upstream; the provider need not, but must tolerate being called once per peer at a time).

Client `getListenAddresses()` returns `[]` — a client cannot be dialed. Client `onInboundChannel`
registers a handler that is never invoked (clients accept no connections); still implement it as a
no-op-registration so the engine's wiring is uniform. Client `onPeerDisconnect` fires when a
dialed socket closes and the engine hasn't already torn it down (the read-loop error path usually
gets there first, exactly as with libp2p's `peer:disconnect` safety net).

### 4.3 Server accept flow (`server-provider.ts`, imported only by `./nodejs`)

Construct a `ws` `WebSocketServer` (`{ port, host, path, maxPayload }`, or attached to a provided
`http`/`https` server; direct-TLS via `https.createServer(tls)` when `config.tls` is set). On
`'connection'`:

1. Run the **auth handshake as responder** (§5) with a fresh nonce and the `authTimeoutMs`
   deadline. If the peer fails to authenticate in time, or the signature is invalid, or the claimed
   peerId does not match the presented public key, or the peerId is not in `allowedPeerIds` (when
   configured), close with the appropriate custom code (§4.4) and drop. Never construct a channel
   for an unauthenticated socket.
2. On success, wrap with `makeWsChannel({ peerId: authenticatedPeerId, ... })` and hand it to the
   registered `onInboundChannel` handler. The engine runs the incarnation handshake (server =
   inbound) and registers the channel.
3. **The server never dials.** `dial()` on the server provider: if a channel to that peerId already
   exists (the engine tracks this via `PeerStateManager` and calls `write()` on the existing
   channel, not `dial()`, for known peers), it is never called; if the engine _does_ call `dial()`
   for a peerId with no live inbound channel, throw a non-retryable
   `IntentionalDisconnectError`-adjacent "cannot dial spoke" error — the hub has no way to reach a
   spoke that hasn't connected. Document this asymmetry loudly (§6). This keeps server→spoke sends
   working over the spoke-initiated channel while making the "hub can't originate to an absent
   spoke" limitation explicit rather than a mysterious hang.

Server `getListenAddresses()` returns `config.announceUrls ?? []` (the deployer-provided public
URLs). These become the location hints the hub embeds in the ocap: URLs it issues, so spokes know
where to dial. Server `onPeerDisconnect` fires when a spoke's socket closes.

`stop()` (both providers): stop accepting, close all live sockets (clean close 1000), clear the
inactivity timers, and (server) close the `WebSocketServer`. Mirror `ConnectionFactory.stop`'s
bounded-wait discipline so a wedged socket cannot hang shutdown.

### 4.4 Error mapping (`errors.ts`)

Map WS close codes / error events to the neutral kernel-errors taxonomy (introduced in Phase 1),
so the engine's retry logic behaves identically to libp2p. Every provider is required to produce
these classes; the engine's `isRetryableNetworkError` (Phase 4) keys off them, not off WS specifics.

| WS signal                                                    | Neutral error                                                                                  | Retryable?                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------- |
| Our own `close()` (intentional flag set) → close 1000        | `IntentionalDisconnectError`                                                                   | no (peer marked intentionally closed) |
| Clean close initiated by remote (1000/1001) without our flag | `ChannelResetError`                                                                            | yes (remote went away; reconnect)     |
| Abnormal close (1006), transport `'error'`, connect failure  | `ChannelResetError`                                                                            | yes                                   |
| Frame too large (1009, or client-side size guard)            | `MessageTooLargeError`                                                                         | no (payload will be too large again)  |
| Auth failure — custom codes below                            | non-retryable auth error (reuse a neutral class or add `AuthenticationError` to kernel-errors) | no                                    |
| Server stopping (our `stop()`)                               | `NetworkStoppedError`                                                                          | n/a (abort)                           |

Custom application close codes (4000–4999 private range):

- `4401` auth handshake failed (bad/missing signature, malformed message, timeout).
- `4403` authenticated peerId not in `allowedPeerIds`.
- `4400` protocol version mismatch / malformed handshake framing.

Add unit-tested `mapCloseEvent(code, wasClean, intentional)` and `mapSocketError(err)`. This
mirrors the intentional-vs-reset distinction that `isIntentionalDisconnect` + the `StreamResetError`
branch make in today's `transport.ts` read loop — the semantics must match so a malicious peer
cannot permanently suppress reconnection by faking an "intentional" close (only a _locally_-set
flag counts as intentional; a remote clean close is still treated as reconnectable).

### 4.5 Backpressure

- _Server (`ws`):_ use the callback form `socket.send(data, (err) => ...)`; the callback fires when
  the frame is flushed to the kernel. Resolve `write()` on the callback, reject on error. Optionally
  reject a `write()` when `socket.bufferedAmount` already exceeds a high-water mark
  (`maxPayloadBytes * N`) with a retryable `ChannelResetError` (slow consumer → drop the channel and
  let reconnect re-sync). The engine's write timeout is the backstop.
- _Client (browser):_ no send callback exists. `send()` returns synchronously; inspect
  `bufferedAmount` after sending and, if it exceeds the high-water mark, close the channel
  (retryable) rather than buffering unboundedly. Resolve `write()` immediately otherwise (the engine
  timeout covers a wedged socket).

Document the browser limitation in the README: browser backpressure is coarse (threshold-close),
not fine-grained flow control. Acceptable for the kernel's small control messages; risky for large
payloads, which is why `maxPayloadBytes` matters.

---

## 5. Auth handshake protocol (`auth-handshake.ts`) — SECURITY-SENSITIVE

> **XXX FLAG FOR CRYPTO REVIEW.** This is new security-sensitive code. Mirror the existing
> "amateur cryptography" warning in `remotes/kernel/remote-comms.ts:114` with a prominent header
> comment: this scheme is minimal, has not been reviewed by a cryptographer, and must be vetted
> before any non-controlled deployment. Keep it small, boring, and easy to audit.

This handshake is **separate from and precedes** the incarnation handshake. Layering:

```
TCP + WS upgrade
  └─ [auth handshake]         ← this section; owned by the WS provider; yields verified peerId
       └─ NetworkChannel constructed
            └─ [incarnation handshake]  ← unchanged @metamask/netlayer helper, driven by the engine
                 └─ channel registered; normal traffic
```

noise gave libp2p an authenticated peer identity for free. Plain WS gives us nothing, so the
provider authenticates at the application layer using the kernel's Ed25519 identity key.

### Crypto primitives

Reuse **`@metamask/netlayer`'s identity helpers** (added in Phase 2; do not reimplement or import
`@noble/curves` directly here, so the curve/codec choices stay in one audited place):

- `signWithSeed(keySeed, message): Uint8Array` — Ed25519 sign with the kernel's seed-derived key.
- `verifySignature(peerId, message, signature): boolean` — decode the neutral base58btc peerId to
  its raw 32-byte Ed25519 public key and verify.
- `peerIdFromSeed(keySeed): string` — the local neutral peerId.

The Phase 2/3 plans ship the identity codec as `deriveNeutralPeerId` /
`neutralPeerIdToPublicKey` / `publicKeyToNeutralPeerId` (possibly renamed to
`deriveNetlayerIdentity` during the Phase 3 move) — signing/verification wrappers are **not**
among them. Whatever the landed names, add the missing sign/verify wrappers to
`@metamask/netlayer` as part of this PR (they are shared, not WS-specific), built on the same
`@noble/curves` ed25519 the codec uses.

### Parameters

- **Protocol version** `v: 1` (`AUTH_PROTOCOL_VERSION` in `constants.ts`). A mismatch → close 4400.
- **Nonce length** 32 bytes, from `crypto.getRandomValues`, base64url-encoded on the wire.
- **Domain separator** fixed ASCII `"ocap-netlayer-ws-auth-v1"` prepended to every signed
  transcript (prevents cross-protocol signature reuse).

### Recommendation: mutual authentication

**Recommend mutual auth (both sides prove key possession).** Rationale: the spoke dials a hub whose
identity it already believes it knows (the hub's peerId is the `host` of the ocap: URL the spoke is
redeeming). Verifying the hub's signature prevents connecting to an impostor at a hijacked/spoofed
URL (DNS/TLS-stripping/misconfiguration), which is cheap insurance and symmetric with the
server-side check the task already requires. The server must authenticate the client regardless (to
know which spoke it is talking to). One extra signature each way is negligible.

### Messages (all JSON; sent as WS frames; each side enforces `authTimeoutMs`)

Let `transcript = domainSep ‖ v ‖ url ‖ clientPeerId ‖ serverPeerId ‖ clientNonce ‖ serverNonce`
(canonical concatenation with unambiguous length-prefixed or fixed-order encoding — specify exactly
in code and lock it with test vectors). `url` is the canonical hub URL the client dialed / the hub's
configured announce URL for this listener — **binding the URL into the transcript prevents a
malicious hub from relaying the client's handshake to a _different_ hub** and prevents replay across
endpoints.

1. **M1 — Client → Server** (immediately on socket open):
   `{ v: 1, type: 'auth-hello', clientPeerId, clientNonce }`
2. **M2 — Server → Client:**
   `{ v: 1, type: 'auth-challenge', serverPeerId, serverNonce, serverSig }`
   where `serverSig = signWithSeed(serverKeySeed, transcript)`.
   - Client checks: `v` matches; `serverPeerId` equals the peerId it intends to reach (the `dial`
     argument); `verifySignature(serverPeerId, transcript, serverSig)`. Any failure → close 4401 and
     fail the dial (non-retryable auth error).
3. **M3 — Client → Server:**
   `{ v: 1, type: 'auth-response', clientSig }`
   where `clientSig = signWithSeed(clientKeySeed, transcript)`.
   - Server checks: `verifySignature(clientPeerId, transcript, clientSig)` (this simultaneously
     verifies the signature _and_ that `clientPeerId` matches the signing public key — the peerId is
     the pubkey encoding, so a valid signature over the transcript for `clientPeerId` _is_ proof the
     peer holds the key for that neutral id); `clientPeerId ∈ allowedPeerIds` when configured. Any
     failure → close 4401/4403.

On success both sides hold the other's cryptographically-verified neutral peerId; the provider
constructs the `NetworkChannel` and hands off to the engine's incarnation handshake. **Do not** send
application traffic before auth completes; buffer nothing pre-auth (reject unexpected message types
during the auth phase with close 4400).

### Security notes to encode as comments + tests

- Freshness/replay: both nonces are in the signed transcript, so a recorded handshake cannot be
  replayed against a fresh nonce.
- Endpoint binding: `url` in the transcript stops a relay/downgrade to another endpoint.
- This is authentication only. Confidentiality/integrity of subsequent traffic relies on the
  transport TLS (`wss://`) provided by the deployer — **plain `ws://` has no encryption**; the
  README must state that `ws://` is for loopback/tests/behind-TLS-proxy only.
- No forward secrecy, no session key, no channel binding to the TLS layer (a
  TLS-terminating proxy sits between us and the wire). Explicitly out of scope; note it for the
  reviewer as a known limitation of "trusted-ish hub" scope.

---

## 6. Hub routing model — decision

**Decision: the hub is a kernel endpoint (star topology), not a forwarder.**

- The server netlayer authenticates _as its own kernel's identity_ (the `NetlayerParams.keySeed`
  contract requires the netlayer to authenticate as the derived key). It therefore _is_ a peer with
  a neutral peerId, exactly like any spoke. Spokes dial the hub's URL and reach **the hub kernel**.
- Server→spoke traffic rides the **spoke-initiated inbound channel**: the engine's
  `PeerStateManager` holds that channel and `sendRemoteMessage` writes to it; the server never
  dials. Server→(absent spoke) fails fast (§4.3) because the hub cannot originate a connection to a
  spoke that isn't currently connected.
- **Spoke↔spoke is not supported.** Two spokes each have a channel to the hub, but the hub does not
  forward between them. This directly serves master-plan target use case (b), "simple client-server
  app, plain WebSocket to a known endpoint they control": the client kernel talks to the server
  kernel, full stop.

Why not a dumb forwarder? A forwarder would (a) require the hub to route by neutral peerId between
two spokes, i.e. be a relay — an explicit non-goal ("no relays"); (b) force the hub to either
inspect/trust application framing or blindly splice byte streams it cannot authenticate end-to-end;
and (c) reintroduce exactly the relay-shaped complexity the netlayer split is trying to make
_optional_. The star model is the simplest thing that is sound.

**Documented limits** (put in README): (1) only hub↔spoke, never spoke↔spoke; (2) the hub cannot
initiate to a spoke that has not connected; (3) to connect two arbitrary kernels, either make one of
them the hub or use `@metamask/netlayer-libp2p` (relayed). **Follow-up, out of scope:** a future
forwarding rendezvous could live behind a `./relay` subpath (analogous to netlayer-libp2p's relay
server) — note it, do not build it.

---

## 7. Test plan

### 7.1 Unit tests (co-located `*.test.ts`, vitest, mock-endoify shim as needed)

- **`auth-handshake.test.ts`** (highest priority — security code):
  - **Golden vectors:** fixed keySeeds → fixed peerIds, fixed nonces → fixed transcript bytes →
    fixed signatures. Lock the canonical transcript encoding so a future refactor can't silently
    change what is signed. Use `it.each` over a vector table.
  - Happy path: mutual auth succeeds; both sides derive the other's peerId.
  - Server rejects: bad client signature; `clientPeerId` mismatching the signing key; peerId not in
    `allowedPeerIds`; version mismatch; malformed/oversized handshake frame; timeout.
  - Client rejects: bad server signature; `serverPeerId` ≠ requested peerId; wrong `url` in
    transcript (endpoint-binding); replayed nonce (transcript verify fails against fresh nonce).
  - Assert the close code emitted for each failure (4400/4401/4403).
- **`ws-channel.test.ts`** (drive with a fake socket — a small `EventTarget`/emitter exposing
  `send`, `close`, `readyState`, `bufferedAmount`; add `makeFakeSocket()` helper in `test/`):
  - `read()` returns frames in order; `read()` parked before a frame arrives resolves when it does.
  - Message boundaries preserved 1:1 (no reframing).
  - Inbound over `maxPayloadBytes` (client path) → next `read()` throws `MessageTooLargeError` and
    the socket is closed 1009.
  - `write()` on non-open socket throws; `write()` resolves on flush (server callback path).
  - `close()` sets intentional flag → subsequent `read()` throws `IntentionalDisconnectError`.
  - `setInactivityTimeout`: with `vi.useFakeTimers()`, no traffic for the interval → channel closes
    with a reset-class error; inbound/outbound activity resets the timer.
- **`errors.test.ts`:** `it.each` table mapping `(code, wasClean, intentional)` and socket-error
  shapes → the expected neutral class and retryability. Cover 1000/1001/1006/1009 and the 44xx set.
- **`config.test.ts`:** valid configs parse; invalid ones throw; defaults applied;
  `maxPayloadBytes` vs `maxMessageSizeBytes` reconciliation warning.
- **`client-provider.test.ts` / `server-provider.test.ts`:** with fake sockets / a fake
  `WebSocketServer`, assert dial verifies server peerId against the argument; server rejects
  unauthenticated sockets without constructing a channel; `getListenAddresses` returns announce URLs
  (server) / `[]` (client); server `dial()` of an absent spoke throws the documented non-retryable
  error; `stop()` closes everything.
- **Browser-safety guard:** a test (or lint/`no-restricted-imports` rule) asserting `src/index.ts`
  and its transitive imports never reference `ws` or `node:*`. A cheap version: a test that imports
  `../src/index.ts` and asserts it loads without `ws` present.

### 7.2 Integration tests (`packages/netlayer-websocket/src/*.integration.test.ts`, Node)

Real loopback sockets (`ws` server on `127.0.0.1:0`, native client `WebSocket` to the resolved
port):

- Two providers over a real socket: full auth + a round-trip byte exchange through two
  `NetworkChannel`s.
- Two **kernels** over a real WS hub: kernel B runs `makeWebSocketServerNetlayer` (the hub);
  kernel A runs `makeWebSocketNetlayer` (client) and dials B's `ws://127.0.0.1:<port>/`. Reproduce
  the `remote-comms.test.ts` scenario (issue ocap: URL on B, redeem on A, send a message, get a
  reply). Assert delivery and that the hub cannot originate to A after A disconnects (documents §6).
- Auth failure e2e: client with a keySeed not in the hub's `allowedPeerIds` → dial fails with the
  auth error; no channel registered.

### 7.3 `kernel-test` parameterization

Goal: run the existing remote-comms scenarios over multiple netlayers without duplicating the test
bodies. Replace the hand-rolled `DirectNetworkService` in `remote-comms.test.ts` with a netlayer
fixture abstraction.

Design a `NetlayerFixture` in `kernel-test/src/netlayer-fixtures.ts`:

```ts
type KernelRole = 'hub' | 'spoke'; // hub = the listener; spoke = the dialer
type NetlayerFixture = {
  name: string; // 'loopback' | 'websocket' | 'libp2p'
  available: () => boolean; // gate on infra/env
  setup: () => Promise<void>; // e.g. nothing for loopback; nothing extra for ws (hub is a kernel)
  teardown: () => Promise<void>;
  registry: NetlayerRegistry; // passed to the runtime/platform services
  // Produce the per-kernel specifier + role. For websocket, the hub gets a server specifier with a
  // port/announceUrl; spokes get a client specifier and receive the hub's URL as a location hint
  // (via the ocap: URL / registerLocationHints, exactly as in production).
  specifierFor: (role: KernelRole) => NetlayerSpecifier;
  hubUrl?: () => string; // websocket only; used to seed spoke hints
};
```

Then drive the suite with `describe.each(fixtures.filter((f) => f.available()))`:

- **loopback** — always available; in-process hub keyed by peerId; both kernels are peers, no roles
  needed (`specifierFor` returns the same loopback specifier; `hubUrl` unused). This is the
  default/CI path and replaces `DirectNetworkService`.
- **websocket** — available under Node; kernel2 = `hub` (server specifier with an ephemeral port and
  a matching `ws://127.0.0.1:<port>/` announce URL), kernel1 = `spoke` (client specifier). The
  scenario already has kernel2 issue the ocap: URL that kernel1 redeems, so kernel1 naturally
  learns the hub URL as a hint — no test-body change beyond going through the fixture. Because §6
  forbids spoke↔spoke, keep the WS variant to scenarios where the message flow is
  spoke→hub / hub→spoke (the existing sender/receiver and MaaS client/server scenarios already fit:
  make the _receiver_/_server_ the hub).
- **libp2p** — gated behind `available()` checking for a running relay (env flag, e.g.
  `OCAP_TEST_LIBP2P=1` plus a relay address), since it needs `ocap relay` infra. Off by default in
  CI unless the infra is provisioned.

Prefer `describe.each` over the fixtures so each scenario's assertions are shared. Keep fixtures'
`setup`/`teardown` in `beforeAll`/`afterAll`; keep per-test kernel construction in
`beforeEach`/`afterEach` (as today). Avoid global state — the fixture object is created per
`describe.each` iteration.

---

## 8. Step-by-step execution order

1. **Scaffold** the package with the `create-package` skill; set up `.` + `./nodejs` exports
   (copy `kernel-platforms`'s pattern), tsconfig `references`, and the `ws`/`@types/ws` deps. Get an
   empty build + `yarn constraints` green.
2. **`constants.ts`** — protocol version, nonce length, domain separator, default timeouts/limits,
   custom close codes.
3. **`errors.ts` + tests** — WS close/error → neutral kernel-errors mapping. (Depends only on
   kernel-errors; do it early so channel and providers can use it.)
4. **`config.ts` + tests** — the two superstruct configs and defaults.
5. **`@metamask/netlayer` identity wrappers** (if not already present): `signWithSeed`,
   `verifySignature`, `peerIdFromSeed`. Add tests there. (Small; unblocks auth.)
6. **`auth-handshake.ts` + tests** — the protocol, with golden vectors. Review-gate this file.
7. **`ws-channel.ts` + tests** — the WS→`NetworkChannel` adapter with the fake socket helper.
8. **`client-provider.ts` + tests** — dial + auth-initiator + peerId verification.
9. **`server-provider.ts` + tests** — listen + auth-responder + allowlist + never-dial.
10. **`index.ts` (`makeWebSocketNetlayer`)** and **`nodejs.ts` (`makeWebSocketServerNetlayer`)** —
    each validates config, builds its provider, and calls the shared `makeChannelNetlayer` with the
    engine options extracted from config. Add the browser-safety guard test.
11. **Package integration tests** (§7.2) — real loopback sockets, two providers, then two kernels.
12. **`kernel-test` parameterization** (§7.3) — add `netlayer-fixtures.ts`, refactor
    `remote-comms.test.ts` to `describe.each`, replacing `DirectNetworkService` with the loopback
    fixture and adding the websocket fixture. Register the WS netlayers in the test registry.
13. **README** — usage, `ws://` vs `wss://`/TLS guidance, the §6 topology limits, and the crypto
    review flag.
14. **Changelogs** — via the `update-changelogs` skill (new package + any `@metamask/netlayer`
    additions).
15. (Optional follow-up, do **not** build now) note a possible `ocap ws-hub` kernel-cli command in
    the README as future work — a thin wrapper that stands up a standalone hub kernel with a WS
    server netlayer, analogous to `ocap relay`. Out of scope for this PR.

---

## 9. Verification commands

Run from repo root unless noted (root scripts are turbo-cached):

```bash
yarn install                       # after adding deps
yarn constraints                   # workspace/dep-graph constraints (tsconfig references, etc.)
yarn workspace @metamask/netlayer-websocket run lint:fix
yarn build                         # full build; confirms . and ./nodejs typecheck + emit
yarn workspace @metamask/netlayer-websocket run test:dev:quiet --coverage=true
yarn workspace @metamask/netlayer-websocket run test:integration   # if the package defines it; else the *.integration.test.ts run under test:dev
# kernel-test is @ocap/kernel-test; its integration tests run under the normal test
# runner (no separate test:integration script as of writing).
yarn workspace @ocap/kernel-test run test:dev:quiet                # parameterized remote-comms over loopback + websocket
yarn test:dev:quiet                # full unit suite, ensure nothing regressed
```

Browser-safety spot check (client entry must not pull in `ws`/node builtins):

```bash
# Fails if the client entry transitively imports the server-only surface.
yarn workspace @metamask/netlayer-websocket run lint   # relies on the no-restricted-imports rule added in step 10
```

Manual smoke (optional): stand up a hub kernel on one port and a client kernel, exchange an ocap:
URL, confirm a round-trip (the integration test already automates this; do it by hand only if
debugging).

---

## 10. Risks

- **Auth crypto (highest).** New security-sensitive code. Mitigations: keep it minimal; mutual auth
  with nonce+URL-bound transcript; reuse `@metamask/netlayer`'s audited identity/curve helpers;
  golden-vector tests locking the signed transcript; a prominent XXX review flag mirroring
  `remote-comms.ts`. Must be reviewed by someone competent before any non-controlled deployment.
- **WS backpressure.** `bufferedAmount` handling is coarse on the browser (no send callback). A slow
  hub could balloon a browser spoke's buffer. Mitigation: high-water-mark close + the engine's write
  timeout; document the limitation; keep `maxPayloadBytes` tight. The kernel's control messages are
  small, which bounds exposure.
- **Message-size DoS.** A hostile hub could stream oversized frames at a browser client (no native
  `maxPayload`). Mitigation: manual `byteLength` check in `onmessage` before enqueue, close 1009.
  Server side is covered by `ws` `maxPayload`.
- **Half-open connections / keepalive.** TCP half-open (peer vanished, no FIN) leaves a socket that
  looks OPEN. The shared engine provides an _inactivity timeout_ hook (`setInactivityTimeout`) but
  **no active keepalive** — libp2p had `ping()` service; WS must supply its own. Mitigation:
  implement `setInactivityTimeout` for real (do not no-op); on the server, additionally use `ws`
  ping/pong (`WebSocketServer` heartbeat: periodic `ping()`, terminate sockets that miss a `pong`).
  The browser client cannot send WS ping frames (no API) and relies on the inactivity timeout plus
  the engine's ack-timeout retransmission. Document this asymmetry.
- **Engine-contract drift.** The WS provider is the second non-libp2p `ChannelProvider`; if its
  read-loop error semantics (intentional vs reset) or channel-reuse behaviour diverge from what the
  engine expects, reconnection changes silently. Mitigation: mirror the exact intentional/reset
  classification from today's `transport.ts` read loop; cover it with the error-mapping tests; run
  the parameterized `kernel-test` suite (which exercises restart/incarnation paths) against WS.
- **`ws` as a new monorepo dependency.** First use of `ws`; ensure it is confined to `./nodejs` and
  never leaks into browser bundles. Mitigation: subpath isolation + the browser-safety guard test.
- **kernel-test flakiness.** Real sockets on ephemeral ports can race in CI. Mitigation: bind to
  `127.0.0.1:0`, resolve the assigned port from the server's `address()`, generous but bounded
  timeouts, and clean `stop()`/`teardown` per iteration.

---

## 11. Estimate

**3–4 developer-days**, consistent with the master plan's Phase 5 sizing, assuming Phases 1–4 have
already produced the `@metamask/netlayer` engine, shared machinery, neutral-identity helpers, and
the `NetlayerRegistry`/`NetlayerSpecifier` runtime injection. Rough split: ~0.5d scaffold +
config + errors; ~1d auth handshake with vectors (the review-sensitive core); ~1d WS channel
adapter + both providers + factories; ~0.5–1d integration tests + `kernel-test` parameterization;
~0.5d README/changelogs/polish. The auth handshake and the `kernel-test` parameterization are the
two items most likely to expand.
