# Writing a netlayer

A **netlayer** is a pluggable network-transport backend for the
[kernel](./glossary.md#kernel)'s remote communications. This guide is for engineers
implementing a new netlayer package. It states the contracts precisely; where a claim here
and the code disagree, the code (`@metamask/netlayer`) wins.

See also the [glossary](./glossary.md#netlayer) for the vocabulary and
[`docs/ken-protocol-assessment.md`](./ken-protocol-assessment.md) for the kernel-side
reliability protocol a netlayer sits beneath.

## 1. Overview

Where a netlayer sits:

```
kernel core  ⇄  Netlayer  ⇄  underlying transport (libp2p / loopback / …)
```

The kernel owns the [Ken protocol](./ken-protocol-assessment.md); a netlayer is a
"dumb pipe + identity + reconnection." The kernel does **not** delegate any of the
following to a netlayer, so do not reimplement them:

- message sequencing and acknowledgement;
- retransmission of un-ACKed messages;
- de-duplication of re-delivered messages;
- [ocap URL](./glossary.md#ocap-url) issue/redeem and object-reference encryption;
- persistence of the per-peer [location-hint](./glossary.md#location-hint) pool.

There are two ways to implement a netlayer:

- **(a) Implement `Netlayer` directly.** Suitable for transports with no real bytestream
  (the [loopback netlayer](./glossary.md#loopback-netlayer) does this: an in-memory hub).
- **(b) Implement `ChannelProvider` + `NetworkChannel` and let `makeChannelNetlayer` supply
  the engine.** Recommended for any connection-oriented bytestream transport. The engine
  handles the incarnation handshake, reconnection/backoff, rate limiting, message-size
  validation, stale-peer cleanup, and channel-reuse races for you. The libp2p netlayer takes
  this path.

Everything a netlayer needs — the contract types, the engine, the shared machinery, and the
neutral identity helpers — is exported from
[`@metamask/netlayer`](../packages/netlayer/src/index.ts). Implementations depend on that
package, not on the whole kernel; `@metamask/ocap-kernel` re-exports the contract types for
its own consumers.

## 2. The `Netlayer` contract

```ts
export type Netlayer = {
  readonly peerId: string;
  sendRemoteMessage: (to: string, message: string) => Promise<void>;
  closeConnection: (peerId: string) => Promise<void>;
  registerLocationHints: (peerId: string, hints: string[]) => void;
  reconnectPeer: (peerId: string, hints?: string[]) => Promise<void>;
  resetAllBackoffs: () => void;
  getListenAddresses: () => string[];
  stop: () => Promise<void>;
};
```

- **`peerId`** — the [neutral peer id](./glossary.md#neutral-peer-id): the base58btc-multibase
  encoding of the raw Ed25519 public key derived from the `keySeed` the netlayer was
  constructed with. It **must** equal `deriveNeutralPeerId(fromHex(keySeed))`.
- **`sendRemoteMessage(to, message)`** — best-effort send. Resolves once the message has been
  handed to the transport, **not** on delivery. May reject on hard failures (peer
  unreachable, message exceeds the size limit).
- **`closeConnection(peerId)`** — intentionally drop the connection to a peer. The peer should
  be treated as intentionally closed (no automatic reconnection) until a subsequent
  `reconnectPeer` or a fresh inbound connection.
- **`registerLocationHints(peerId, hints)`** — record netlayer-specific opaque hint strings
  for a peer, to be used on a future dial. May be a no-op if the netlayer needs no hints.
- **`reconnectPeer(peerId, hints?)`** — re-establish a connection (clearing any
  intentional-close/backoff state). May be a no-op.
- **`resetAllBackoffs()`** — clear reconnection backoff for all peers (the kernel calls this
  after detecting a cross-incarnation wake). May be a no-op.
- **`getListenAddresses()`** — netlayer-specific hint strings at which this node can be
  reached. These become the location hints the kernel embeds in the [ocap
  URLs](./glossary.md#ocap-url) it issues. Return `[]` if the node cannot be dialed
  (e.g. a browser client).
- **`stop()`** — tear everything down; after `stop`, sends reject.

`Netlayer` (and its methods' return values, where object literals) should be `harden`ed.

## 3. The `ChannelProvider` / `NetworkChannel` seam

For path (b), implement these and pass the provider to `makeChannelNetlayer`:

```ts
export type NetworkChannel = {
  peerId: string; // the authenticated remote neutral peer id
  read: () => Promise<Uint8Array>; // throws mapped kernel-errors on close/reset
  write: (data: Uint8Array) => Promise<void>; // sends one framed message
  close: () => Promise<void>;
  setInactivityTimeout: (ms: number) => void; // may be a no-op
};

export type ChannelProvider = {
  readonly peerId: string;
  dial: (
    peerId: string,
    hints: string[],
    withRetry: boolean,
  ) => Promise<NetworkChannel>;
  onInboundChannel: (handler: (channel: NetworkChannel) => void) => void;
  onPeerDisconnect: (handler: (peerId: string) => void) => void;
  closeChannel: (channel: NetworkChannel) => Promise<void>;
  getListenAddresses: () => string[];
  stop: () => Promise<void>;
};
```

Notes on the landed shape:

- `dial` takes a third `withRetry: boolean` argument. The engine distinguishes retry-dials
  from reconnection-lifecycle dials; honor it if your transport can retry internally,
  otherwise ignore it.
- `closeChannel` is single-argument — the channel carries its own `peerId`.
- `read()` is a pull-based loop: the engine calls it repeatedly until it throws. Map every
  terminal transport event to one of the neutral kernel-error classes (see §9); an inbound
  message that arrives is returned as `Uint8Array` bytes (the engine does UTF-8
  encode/decode itself).
- `setInactivityTimeout` may be a real timer (recommended for bytestream transports with
  half-open hazards) or a no-op.

Wire it up:

```ts
import { makeChannelNetlayer } from '@metamask/netlayer';

const netlayer = makeChannelNetlayer({
  provider, // your ChannelProvider
  hooks, // NetlayerHooks (from NetlayerParams)
  options, // ChannelNetlayerOptions incl. options.localIncarnationId
  logger,
  stopController, // the AbortController shared with the provider; stop() aborts it
});
```

The engine owns handshake-before-register, the `reuseOrReturnChannel` race, the single
inbound read loop per channel, reconnection/backoff, per-peer rate limiting, outbound
size validation, stale-peer cleanup, and intentional-close bookkeeping. Share one
`AbortController` between the provider and the engine: `Netlayer.stop()` aborts it.

## 4. Hooks (`NetlayerHooks`)

```ts
export type NetlayerHooks = {
  handleMessage: (from: string, message: string) => Promise<string | null>;
  onRemoteGiveUp?: (peerId: string) => void;
  onIncarnationChange?: (
    peerId: string,
    observedIncarnation: string,
  ) => Promise<boolean>;
};
```

- **`handleMessage(from, message)`** — deliver an inbound message to the kernel. A non-null
  return value is a piggyback reply to send back on the same connection.
- **`onRemoteGiveUp(peerId)`** — reconnection was exhausted for a peer.
- **`onIncarnationChange(peerId, observedIncarnation)`** — see §7. Returns whether a real
  restart occurred.

## 5. Delivery-semantics contract

State the guarantee precisely, because the kernel depends on exactly this and no more:

- **Best-effort, ordered per live connection.** Messages written to one live connection are
  delivered in order or not at all. You **MUST NOT** reorder messages within a single
  connection.
- You **MAY** drop messages on disconnect/reconnect. You need not persist messages,
  de-duplicate, or guarantee anything across connection boundaries.
- The kernel's Ken protocol tolerates loss and duplication: it retransmits from its own
  sender log until ACKed and drops duplicates by sequence number on receive.

Corollary: a correct netlayer can be quite lossy and still be correct — it just must never
silently corrupt order on a single connection. This is the normative statement of what a
transport must provide; the libp2p and loopback netlayers both satisfy it.

## 6. Identity requirements

- The netlayer **must** authenticate as the Ed25519 key derived from its `keySeed`, and must
  prove to each peer that it controls that key. (libp2p's noise handshake does this for free;
  a transport without built-in authentication needs an application-level Ed25519
  challenge-signature handshake. That pattern will be worked out with the planned WebSocket
  netlayer; see [`docs/plans/netlayer/phase-5.md`](./plans/netlayer/phase-5.md).)
- Neutral peer id recipe: derive the raw Ed25519 public key from the seed, then base58btc
  multibase encode it. Use the helpers exported from `@metamask/netlayer`
  ([`identity.ts`](../packages/netlayer/src/identity.ts)): `deriveNeutralPeerId`,
  `neutralPeerIdToPublicKey`, `publicKeyToNeutralPeerId`. Each netlayer converts the neutral
  id to and from its native identity at its own boundary (a libp2p `PeerId`, an iroh
  `NodeId` — both wrap the same raw Ed25519 key).

> The cryptography in the kernel's own ocap-URL code carries an "amateur cryptography"
> caveat (see `remotes/kernel/remote-comms.ts`). New security-sensitive netlayer code (peer
> authentication especially) should be kept minimal and flagged for review.

## 7. The incarnation handshake

Purpose: detect a peer **restart** even after the receiver's own in-memory peer state was
lost.

Mechanism: a versioned handshake message (a `v` field; current `HANDSHAKE_VERSION = 1`)
carrying each side's `incarnationId`, exchanged when a connection is established and reported
on **every** successful handshake (not only on change). The engine calls
`onIncarnationChange(peerId, observedIncarnation)`; the kernel compares against persisted
state and returns whether a real restart occurred; the engine uses that verdict to suppress
stale in-flight messages on the connection.

- Path (b) netlayers get this for free from the shared
  [`handshake.ts`](../packages/netlayer/src/handshake.ts) via `makeChannelNetlayer`.
- A hand-written `Netlayer` (like loopback) must call `onIncarnationChange` itself.

See the `onIncarnationChange` hook in
[`remotes/types.ts`](../packages/ocap-kernel/src/remotes/types.ts).

## 8. Config and registration

- A netlayer's config is superstruct-validated by the implementation. It **must** be `Json`,
  because a [`NetlayerSpecifier`](./glossary.md#netlayer)'s `config` crosses the browser
  `postMessage` boundary. No functions, class instances, or `Uint8Array` in config.
- A runtime is constructed with a `NetlayerRegistry` (`Record<string, NetlayerFactory>`); a
  kernel selects one per instance with a `NetlayerSpecifier` (`{ netlayer: string; config:
Json }`). Because the registry's factories are typed `NetlayerFactory<Json>`, validate and
  narrow the config **inside** the factory (as `libp2pNetlayerFactory` does).
- **Kernel config convention.** The kernel understands exactly one config key by convention:
  `knownRelays: string[]` — the opaque [location-hint](./glossary.md#location-hint) pool it
  persists and re-injects. The kernel merges any bootstrap `config.knownRelays` into its
  store, then overwrites `config.knownRelays` with the full persisted pool before handing the
  config to the netlayer. (The key retains the `knownRelays` name for compatibility with the
  libp2p netlayer's config; the kernel treats its contents as opaque hint strings.)

## 9. Error mapping and retryability

Map every raw transport error that can escape `read`/`write`/`dial` to one of the neutral
kernel-error classes in `@metamask/kernel-errors`:

| Class                        | Meaning                                 | Retryable |
| ---------------------------- | --------------------------------------- | --------- |
| `ChannelResetError`          | remote reset / went away                | yes       |
| `IntentionalDisconnectError` | peer intentionally disconnected         | no        |
| `MessageTooLargeError`       | inbound/outbound message over the limit | no        |

`isRetryableNetworkError` (in `@metamask/kernel-errors`) acts on the **neutral taxonomy
only**. Any transport-specific name-sniffing lives in the netlayer's own error mapper — see
`@metamask/netlayer-libp2p`'s
[`error-mapper.ts`](../packages/netlayer-libp2p/src/error-mapper.ts) for the reference
(`mapLibp2pReadError`, `mapLibp2pDialError`, `isRetryableLibp2pError`). An unmapped error
silently changes reconnection behavior, so map completely and cover each class with a test.

## 10. Location hints

Location hints are opaque, netlayer-defined strings (for libp2p, relay multiaddrs). The
kernel persists a bounded pool per peer, embeds a few in issued ocap URLs, and supplies them
back on dial — but never interprets them. Your netlayer decides what a hint means:

- `getListenAddresses()` returns the hints at which this node is reachable.
- `dial(peerId, hints, withRetry)` receives the kernel's stored hints for a peer.
- `registerLocationHints(peerId, hints)` records freshly-learned hints.

## 11. Testing guidance

- Use the [loopback netlayer](./glossary.md#loopback-netlayer) as the reference and as a
  golden test of the shared engine.
- Parameterize the `@ocap/kernel-test` integration suite over netlayers (loopback always;
  libp2p where the relay infra is available). WebSocket parameterization is future work,
  landing with the deferred WebSocket netlayer.
- Write per-error-class mapping tests — error-classification completeness is a known risk: an
  unmapped error changes reconnection behavior silently.
- Two-kernel round-trip: issue an ocap URL on kernel A, redeem on B, exchange messages,
  restart A, and confirm incarnation handling.

> Note on coverage: v8 under-credits async fire-and-forget `.catch` branches. Prefer driving
> the synchronous path when writing a test purely to cover error handling.

## 12. Worked example

A minimal `ChannelProvider` delegating to `makeChannelNetlayer`:

```ts
import { makeChannelNetlayer } from '@metamask/netlayer';
import type {
  ChannelProvider,
  NetworkChannel,
  NetlayerFactory,
} from '@metamask/netlayer';
import { ChannelResetError } from '@metamask/kernel-errors';

const makeMyProvider = (
  keySeed: string,
  signal: AbortSignal,
): ChannelProvider => {
  const peerId = /* deriveNeutralPeerId(fromHex(keySeed)) */ '';
  return harden({
    peerId,
    async dial(remotePeerId, hints, _withRetry): Promise<NetworkChannel> {
      // open your transport to one of `hints`, authenticate `remotePeerId`,
      // then wrap the connection as a NetworkChannel whose read() throws
      // mapped kernel-errors (e.g. ChannelResetError) on reset.
      throw new ChannelResetError('not implemented');
    },
    onInboundChannel(_handler) {
      /* register `_handler`; call it with each authenticated inbound channel */
    },
    onPeerDisconnect(_handler) {
      /* call `_handler(peerId)` when a connection drops */
    },
    async closeChannel(channel) {
      await channel.close();
    },
    getListenAddresses() {
      return [];
    },
    async stop() {
      /* close everything; the shared AbortController is already aborted */
    },
  });
};

export const myNetlayerFactory: NetlayerFactory = async ({
  keySeed,
  hooks,
  incarnationId,
  logger,
}) => {
  const stopController = new AbortController();
  const provider = makeMyProvider(keySeed, stopController.signal);
  return makeChannelNetlayer({
    provider,
    hooks,
    options: { localIncarnationId: incarnationId },
    logger,
    stopController,
  });
};
```

For full references, read the loopback netlayer
([`@metamask/netlayer-loopback`](../packages/netlayer-loopback/src)) and the libp2p netlayer
([`@metamask/netlayer-libp2p`](../packages/netlayer-libp2p/src)).

## Packaging: subpath exports and tsconfig mappings

If your netlayer package ships **subpath exports** (as `@metamask/netlayer-libp2p` does with
`./nodejs` and `./relay`), every subpath needs an explicit mapping to its `src` entry point in
the root `tsconfig.packages.json`. This is **load-bearing**, not cosmetic: without the mapping,
vitest resolves the subpath to the built `dist` output instead of `src`. For a libp2p-backed
netlayer that means a _second_ post-lockdown instance of `@libp2p/webrtc` / `@peculiar/x509`
gets initialized, which crashes SES with `privateMap.get is not a function`. Any new
netlayer-libp2p subpath export **must** get the same `tsconfig.packages.json` mapping. More
generally, follow the subpath-export pattern already used by `@metamask/kernel-platforms`, and
add each new workspace dependency to `references` in both `tsconfig.json` and
`tsconfig.build.json` (per the repo's `CLAUDE.md`).

## Next netlayer: iroh

The intended next netlayer is [iroh](https://www.iroh.computer/), tracked in issue
[#968](https://github.com/MetaMask/ocap-kernel/issues/968). iroh 1.0 ships a stable wire
protocol and official Node.js napi bindings, and its `NodeId` is the same raw Ed25519 public
key the neutral peer id already encodes — so an iroh netlayer converts identity at its
boundary exactly as the libp2p netlayer does. The plan is to ship `@metamask/netlayer-iroh`
Node-only first (via the napi bindings), with an optional browser/wasm entry point later.
Browser support in iroh is wasm-only and relay-only today (no direct connections or hole
punching from the browser), which is a regression from libp2p's WebRTC upgrade path — so the
browser trade-off is deferred, and the netlayer abstraction is precisely what turns "swap
libp2p for iroh" from an architectural decision into a per-netlayer packaging one.

A **DRAFT, unscheduled** plan for `@metamask/netlayer-iroh` (proposed to supersede the deferred
WebSocket phase as the second real `ChannelProvider`, and to ship a provider-conformance test
kit) lives at
[`docs/plans/netlayer/phase-7-iroh.md`](./plans/netlayer/phase-7-iroh.md).
