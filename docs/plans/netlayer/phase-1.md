# Phase 1 — Internal Seam Refactor (netlayer abstraction)

Part of the 6-phase effort to introduce a pluggable "netlayer" abstraction in ocap-kernel
(master plan: [`master.md`](./master.md),
issue [#968](https://github.com/MetaMask/ocap-kernel/issues/968)).

This document is self-contained: an engineer or agent with no prior context should be able to
execute it end to end. All paths are relative to the repo root
`/Users/rekmarks/Workspaces/metamask/ocap-kernel` unless stated otherwise.

---

## 1. Objective and non-goals

### Objective

Introduce a transport-neutral internal seam inside the `@metamask/ocap-kernel` package's remote
communications subsystem so that later phases can extract it into standalone `@metamask/netlayer*`
packages. Concretely:

1. Replace the libp2p-typed `Channel` (`{ msgStream: LengthPrefixedStream<Stream>; stream: Stream;
peerId }`) with a neutral `NetworkChannel` (`{ peerId; read; write; close; setInactivityTimeout }`)
   and introduce a `ChannelProvider` type describing what a channel-based transport must supply.
2. Move every libp2p touchpoint that currently lives in `transport.ts`, `channel-utils.ts`, and
   `handshake.ts` (length-prefix stream wrapping, inactivity-timeout setting, close-event
   diagnostic listeners, and raw-error sniffing/mapping) **into `connection-factory.ts`**, which
   becomes the sole `ChannelProvider` implementation and the sole libp2p-aware module besides
   `remote-comms.ts` (identity — deferred to Phase 2).
3. Add three neutral error classes to `@metamask/kernel-errors` — `ChannelResetError`,
   `IntentionalDisconnectError`, `MessageTooLargeError` — and have `connection-factory.ts` map the
   raw libp2p read errors onto them, so the engine never imports libp2p error types.
4. Restructure `transport.ts` so its core is `makeChannelNetlayer({ provider, hooks, options })`
   returning a Netlayer-shaped object, with `initTransport` kept as a thin, signature-compatible
   wrapper that constructs a `ConnectionFactory` provider and delegates to `makeChannelNetlayer`.
   After this, `transport.ts` imports no libp2p package.

### Non-goals (explicit)

- **No new packages.** Everything stays inside `@metamask/ocap-kernel` and
  `@metamask/kernel-errors`. Package extraction is Phase 3+.
- **No behavior change.** This is a _mechanical_ refactor. Runtime behavior, log strings, retry
  semantics, and error-classification outcomes must be preserved. Tests move/adapt intact; do not
  "improve" logic while moving it.
- **No identity changes.** `remote-comms.ts`, the `ocap:` URL format, peerId derivation, and
  `@libp2p/crypto` identity usage are untouched (Phase 2).
- **No runtime changes.** `kernel-node-runtime/src/kernel/PlatformServices.ts` and
  `kernel-browser-runtime/src/PlatformServicesServer.ts` must not need edits. This constrains the
  `initTransport` export to keep its exact current signature and return shape (see §3.6).
- **No config split.** `RemoteCommsOptions` is not reshaped; `directTransports`/`allowedWsHosts`
  keep flowing through `initTransport` → `ConnectionFactory` unchanged (config split is Phase 4b).
- **`isRetryableNetworkError` / `getNetworkErrorCode` stay as-is.** The master plan's removal of
  `MuxerClosedError`/name-sniffing from kernel-errors is Phase 2+, not here. Phase 1 only _adds_
  three error classes to kernel-errors; it removes nothing.

---

## 2. Types to introduce

### 2.1 `NetworkChannel` and `ChannelProvider` (in `packages/ocap-kernel/src/remotes/types.ts`)

Replace the current `Channel`, `InboundConnectionHandler`, and `PeerDisconnectHandler` definitions
(lines 1–17 of `types.ts`, including the two libp2p `import type` lines) with:

```ts
// no libp2p imports remain in this file after this change

/**
 * A transport-neutral bidirectional message channel to a single remote peer.
 * Byte-oriented: `read` yields one complete inbound message payload per call,
 * `write` sends one complete outbound message payload. Framing, encryption,
 * and transport-error mapping are the ChannelProvider's responsibility.
 */
export type NetworkChannel = {
  /** The remote peer's id (opaque string; libp2p peerId today). */
  readonly peerId: string;
  /**
   * Read the next complete inbound message payload.
   * Throws a neutral kernel-error on failure:
   * - `MessageTooLargeError` when the peer announced an oversize frame,
   * - `ChannelResetError` on a remote-initiated reset,
   * - `IntentionalDisconnectError` on a locally/remotely intended close,
   * - any other error is re-thrown as-is (engine treats it as connection loss).
   */
  read: () => Promise<Uint8Array>;
  /** Write one complete outbound message payload. Throws if the channel is not writable. */
  write: (data: Uint8Array) => Promise<void>;
  /** Close the channel, releasing transport resources. Idempotent. */
  close: () => Promise<void>;
  /**
   * Set the bidirectional inactivity timeout in ms. May be a no-op for
   * transports without the concept. Called once after the channel is registered.
   */
  setInactivityTimeout: (ms: number) => void;
};

export type InboundChannelHandler = (
  channel: NetworkChannel,
) => Promise<void> | void;

export type PeerDisconnectHandler = (peerId: string) => void;

/**
 * A channel-based transport implementation consumed by `makeChannelNetlayer`.
 * The libp2p `ConnectionFactory` is the only implementation in Phase 1.
 */
export type ChannelProvider = {
  /**
   * Dial a peer, returning a live channel. Deduplicates concurrent dials to
   * the same peer internally (idempotent).
   *
   * @param peerId - The peer to dial.
   * @param hints - Location hints (opaque transport-specific strings).
   * @param withRetry - When true, apply the provider's connect backoff/retry.
   */
  dial: (
    peerId: string,
    hints: string[],
    withRetry: boolean,
  ) => Promise<NetworkChannel>;
  onInboundChannel: (handler: InboundChannelHandler) => void;
  onPeerDisconnect: (handler: PeerDisconnectHandler) => void;
  closeChannel: (channel: NetworkChannel) => Promise<void>;
  getListenAddresses: () => string[];
  stop: () => Promise<void>;
};
```

Notes / rationale:

- `dial` keeps the `withRetry` boolean because the engine relies on the distinction today:
  `sendRemoteMessage` dials with retry (`dialIdempotent(peer, hints, true)`), the reconnection
  lifecycle dials without (`dialIdempotent(peer, hints, false)`). Preserving it keeps the refactor
  mechanical. The master-plan sketch's simpler `dial(peerId, hints)` is a later-phase concern.
- `closeChannel(channel)` drops the current second `peerId` argument
  (`ConnectionFactory.closeChannel(channel, peerId)`) because `NetworkChannel.peerId` now carries
  it. This is the one intentional signature simplification; it touches ~6 call sites in
  `transport.ts` + `reconnection-lifecycle.ts`. If you prefer an even smaller diff, keep the
  `peerId` argument on the `ChannelProvider.closeChannel` type — either is acceptable, pick one and
  be consistent.
- `ChannelProvider` intentionally has **no `peerId` field** in Phase 1. The engine does not read
  the provider's own id today (local identity comes from `remote-comms.ts` via `keySeed`); the
  master sketch's `ChannelProvider.peerId` is added in Phase 3, when the engine moves to
  `@metamask/netlayer` and `Netlayer.peerId` is introduced (Phase 2 changes identity derivation
  but does not touch the provider surface).
- `RemoteCommsOptions`, `ConnectionFactoryOptions`, `DirectTransport`, `RemoteInfo`,
  `RemoteIdentity`, `RemoteComms`, `RemoteMessageHandler`, `SendRemoteMessage`,
  `StopRemoteComms`, `OnRemoteGiveUp`, `OnIncarnationChange` are **unchanged**. Note
  `ConnectionFactoryOptions` already uses only primitives + `DirectTransport` (no libp2p imports),
  so `types.ts` becomes fully libp2p-import-free once `Channel` is gone.

### 2.2 Engine params type (in `transport.ts`)

Add near the top of `transport.ts`:

```ts
export type ChannelNetlayerHooks = {
  handleMessage: RemoteMessageHandler;
  onRemoteGiveUp?: OnRemoteGiveUp | undefined;
  onIncarnationChange?: OnIncarnationChange | undefined;
};

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
  localIncarnationId?: string | undefined;
};

export type ChannelNetlayer = {
  sendRemoteMessage: SendRemoteMessage;
  stop: StopRemoteComms;
  closeConnection: (peerId: string) => Promise<void>;
  registerLocationHints: (peerId: string, hints: string[]) => void;
  reconnectPeer: (peerId: string, hints?: string[]) => Promise<void>;
  resetAllBackoffs: () => void;
  getListenAddresses: () => string[];
};
```

`ChannelNetlayer` is exactly the current `initTransport` return type (the runtimes destructure
these seven members — see §3.6), so the wrapper stays compatible.

---

## 3. File-by-file change list

### 3.1 `packages/ocap-kernel/src/remotes/types.ts`

- Remove `import type { Stream } from '@libp2p/interface';` and
  `import type { LengthPrefixedStream } from '@libp2p/utils';` (lines 1–2).
- Remove `Channel`, `InboundConnectionHandler`, `PeerDisconnectHandler`.
- Add `NetworkChannel`, `ChannelProvider`, `InboundChannelHandler`, `PeerDisconnectHandler` as
  in §2.1. Keep `KRef` import.
- Everything else unchanged.

### 3.2 `packages/ocap-kernel/src/remotes/platform/connection-factory.ts` (absorbs all libp2p seam logic)

This module already imports libp2p and stays the sole `ChannelProvider`. Changes:

**Produce `NetworkChannel`s instead of `Channel`s.** Introduce a private factory
`#makeNetworkChannel(stream: Stream, peerId: string): NetworkChannel` used by both the inbound
handler (currently `connection-factory.ts:236`) and `openChannelOnce` (currently
`connection-factory.ts:413–416`). It wraps the libp2p `stream` with `lpStream(stream,
{ maxDataLength: this.#maxDataLength })` (moved from those two call sites) and returns:

```ts
#makeNetworkChannel(stream: Stream, peerId: string): NetworkChannel {
  const msgStream = lpStream(stream, { maxDataLength: this.#maxDataLength });
  // Diagnostic close listener — MOVED here from transport.registerChannel (transport.ts:343-357).
  stream.addEventListener(
    'close',
    (evt: Event) => {
      const { local, error } = evt as StreamCloseEvent;
      if (local) {
        const suffix = error ? `: ${error.message}` : '';
        this.#logger.log(`${peerId}:: stream closed locally${suffix}`);
      } else if (error) {
        this.#logger.log(`${peerId}:: stream reset by remote: ${error.message}`);
      } else {
        this.#logger.log(`${peerId}:: stream closed by remote (clean)`);
      }
    },
    { once: true },
  );
  return harden({
    peerId,
    read: async () => {
      try {
        const readBuf = await msgStream.read();
        return readBuf.subarray(); // flatten Uint8ArrayList -> Uint8Array here
      } catch (problem) {
        throw mapLibp2pReadError(problem); // see §3.7
      }
    },
    write: async (data: Uint8Array) => {
      if (stream.status !== 'open') {
        // MOVED from channel-utils.writeWithTimeout short-circuit (channel-utils.ts:47-50)
        throw Error(`Stream is ${stream.status}, cannot write`);
      }
      await msgStream.write(data);
    },
    close: async () => this.#closeStream(stream, peerId),
    setInactivityTimeout: (ms: number) => {
      stream.inactivityTimeout = ms; // MOVED from transport.registerChannel (transport.ts:337-340)
    },
  });
}
```

- Move the current `closeChannel(channel: Channel, peerId)` body into a private
  `#closeStream(stream: Stream, peerId: string)` (the graceful-close-then-abort logic,
  `connection-factory.ts:508–528`), and make the public `closeChannel(channel: NetworkChannel)`
  call `channel.close()` — or keep `closeChannel` delegating to `#closeStream` via a channel→stream
  map. Simplest: `closeChannel(channel) { return channel.close(); }`. (The `NetworkChannel.close`
  already routes to `#closeStream`.)
- Rename `onInboundConnection` → `onInboundChannel` and its stored field type
  (`InboundConnectionHandler` → `InboundChannelHandler`). Update the inbound `handle('whatever',
…)` callback to build a `NetworkChannel` via `#makeNetworkChannel` and pass it to
  `#inboundHandler`.
- Rename `dialIdempotent` → `dial` (keep the `(peerId, hints, withRetry)` signature and the
  in-flight dedup map). `openChannelOnce`/`openChannelWithRetry` become private helpers returning
  `NetworkChannel`.
- Add the read-error mapper `mapLibp2pReadError` (module-private function; see §3.7) and the
  `isIntentionalDisconnect` helper — **both moved out of `transport.ts`**. The
  `SCTP_USER_INITIATED_ABORT` constant reference moves with them (stays defined in `constants.ts`).
- Update the type import from `../types.ts`:
  `Channel` → `NetworkChannel`, `InboundConnectionHandler` → `InboundChannelHandler`. Keep
  `ConnectionFactoryOptions`, `DirectTransport`, `PeerDisconnectHandler`.
- `harden(ConnectionFactory)` stays. `harden` the returned channel object literal (as shown).

Nothing else in `connection-factory.ts` changes (relay reconnection, dial candidate generation,
`connectionGater`, `getListenAddresses`, `stop`, `#init` are untouched except the two channel
construction sites and the two renames).

### 3.3 `packages/ocap-kernel/src/remotes/platform/channel-utils.ts`

- Change `writeWithTimeout(channel: Channel, message, timeoutMs)` to
  `writeWithTimeout(channel: NetworkChannel, data, timeoutMs)`.
- **Remove** the `channel.stream.status !== 'open'` short-circuit (lines 46–50): that check moved
  into the provider's `NetworkChannel.write` (§3.2). The timeout race now wraps `channel.write(data)`
  instead of `channel.msgStream.write(message)`.
- `makeErrorLogger` is unchanged.
- Update the `Channel` type import to `NetworkChannel`.

Result: `channel-utils.ts` keeps the write-timeout race (a transport-engine concern parameterized
by `writeTimeoutMs`) but no longer knows about libp2p stream internals.

### 3.4 `packages/ocap-kernel/src/remotes/platform/handshake.ts`

- Change `Channel` → `NetworkChannel` in `performOutboundHandshake`, `performInboundHandshake`,
  `readWithTimeout`.
- `readWithTimeout`: replace `channel.msgStream.read()` + `bufToString(readBuf.subarray())` with
  `channel.read()` + `bufToString(bytes)` (the `.subarray()` flatten now happens inside the
  provider). Keep `writeWithTimeout(channel, fromString(...), …)` calls (they now hit
  `NetworkChannel.write`). `uint8arrays` `fromString`/`toString` stays — it is byte↔string
  encoding, not libp2p, and is a legitimate engine dependency.
- No logic changes. Handshake protocol, timeouts, and messages are identical.

### 3.5 `packages/ocap-kernel/src/remotes/platform/reconnection-lifecycle.ts` and `peer-state-manager.ts`

- Pure type swaps: `Channel` → `NetworkChannel` in the `import type` and in every signature
  (`dialPeer`, `reuseOrReturnChannel`, `closeChannel`, `registerChannel`, `PeerState.channel`).
  No logic changes. These modules are already transport-agnostic.
- `reconnection-lifecycle.ts` `closeChannel(channel, peerId)` calls: if you adopt the
  `closeChannel(channel)` single-arg provider signature (§2.1), update the `ReconnectionLifecycleDeps.closeChannel`
  type and its two call sites accordingly. The engine wires this to `provider.closeChannel`.

### 3.6 `packages/ocap-kernel/src/remotes/platform/transport.ts` (becomes libp2p-import-free)

Remove all libp2p imports (lines 1–6): `StreamResetError`, `StreamCloseEvent`,
`InvalidDataLengthError`, `InvalidDataLengthLengthError`. Remove the local `isIntentionalDisconnect`
function (lines 67–79) and the `SCTP_USER_INITIATED_ABORT` constant import — they move to
`connection-factory.ts` (§3.2/§3.7).

Restructure into two exported functions:

**`makeChannelNetlayer` (the engine)** — synchronous. Signature:

```ts
export function makeChannelNetlayer(params: {
  provider: ChannelProvider;
  hooks: ChannelNetlayerHooks;
  options: ChannelNetlayerOptions;
  logger: Logger;
}): ChannelNetlayer;
```

Its body is the current `initTransport` body **from line 135 onward** (everything after
`ConnectionFactory.make` returns), with these substitutions:

- Replace the local `connectionFactory` variable with `provider`; delete the
  `await ConnectionFactory.make({...})` call (that moves to the wrapper).
- Replace `remoteMessageHandler` / `onRemoteGiveUp` / `localIncarnationId` / `onIncarnationChange`
  reads with `hooks.handleMessage` / `hooks.onRemoteGiveUp` / `options.localIncarnationId` /
  `hooks.onIncarnationChange`.
- `logger` comes from `params.logger` (the wrapper constructs and shares one `Logger`).
- `registerChannel` (currently `transport.ts:324–375`): **delete** the
  `channel.stream.inactivityTimeout = …` block (lines 337–340) and replace with
  `channel.setInactivityTimeout(Math.max(options.streamInactivityTimeoutMs ??
STREAM_INACTIVITY_TIMEOUT_MS, MIN_STREAM_INACTIVITY_TIMEOUT_MS))`. **Delete** the
  `channel.stream.addEventListener('close', …)` diagnostic block (lines 343–357) — moved to the
  provider (§3.2). Keep the rest (readChannel launch, previous-channel close via
  `provider.closeChannel`).
- `readChannel` (currently `transport.ts:460–532`): replace `channel.msgStream.read()` with
  `channel.read()` and `bufToString(readBuf.subarray())` with `bufToString(bytes)`. Replace the
  error `catch` cascade so it switches on the **neutral** error classes instead of libp2p types:

  | Current (libp2p) branch                                                                                                                                                 | New (neutral) branch — same behavior                                                                                     |
  | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
  | `problem instanceof InvalidDataLengthError \|\| InvalidDataLengthLengthError` → wrap in `ResourceLimitError(messageSize)`, `outputError`, `handleConnectionLoss`, throw | `problem instanceof MessageTooLargeError` → `outputError`, `handleConnectionLoss`, throw (see §3.7 note on the wrapping) |
  | `problem instanceof StreamResetError` → log `"…stream reset by remote, reconnecting"`, `handleConnectionLoss`                                                           | `problem instanceof ChannelResetError` → identical log + `handleConnectionLoss`                                          |
  | `isIntentionalDisconnect(problem)` → log `"…remote intentionally disconnected"`, `markIntentionallyClosed`                                                              | `problem instanceof IntentionalDisconnectError` → identical log + `markIntentionallyClosed`                              |
  | else → `outputError`, `handleConnectionLoss`                                                                                                                            | unchanged (else)                                                                                                         |

  Keep the exact log strings and the ordering (`MessageTooLargeError`, then `ChannelResetError`,
  then `IntentionalDisconnectError`, then else). Ordering matters: the current code checks
  `StreamResetError` _before_ `isIntentionalDisconnect`, so a remote reset always reconnects and is
  never treated as intentional — preserve that by checking `ChannelResetError` before
  `IntentionalDisconnectError`.

- `sendRemoteMessage`: `dialIdempotent(peer, hints, true)` → `provider.dial(peer, hints, true)`;
  `connectionFactory.closeChannel(channel, peer)` → `provider.closeChannel(channel)`;
  `writeWithTimeout(channel, fromString(message), …)` unchanged (hits `NetworkChannel.write`).
- `stop()` (currently `transport.ts:855–885`): the "gracefully close all active channel streams"
  loop uses `channel.stream.close()` (line 874). Replace with `channel.close()`
  (`NetworkChannel.close`). Replace `connectionFactory.stop()` with `provider.stop()`.
- `closeRejectedChannel`, `handleInboundConnection`, `reconnectPeer`, `closeConnection`,
  `registerLocationHints`, `resetAllBackoffs`, wake detector, cleanup interval,
  `reuseOrReturnChannel`, `doOutboundHandshake`, `doInboundHandshake`, the
  `provider.onInboundChannel(...)` / `provider.onPeerDisconnect(...)` wiring: swap
  `connectionFactory` → `provider`, `onInboundConnection` → `onInboundChannel`,
  `closeChannel(ch, peer)` → `closeChannel(ch)`, otherwise **unchanged**.
- Return the `ChannelNetlayer` object (same seven members currently returned at
  `transport.ts:897–905`), with `getListenAddresses: () => provider.getListenAddresses()`.

**`initTransport` (compat wrapper)** — keeps its **exact current signature and return shape** so
the runtimes need no edits:

```ts
export async function initTransport(
  keySeed: string,
  options: RemoteCommsOptions,
  remoteMessageHandler: RemoteMessageHandler,
  onRemoteGiveUp?: OnRemoteGiveUp,
  localIncarnationId?: string,
  onIncarnationChange?: OnIncarnationChange,
): Promise<ChannelNetlayer> {
  const logger = new Logger();
  const stopController = new AbortController(); // note: see wiring caveat below
  const provider = await ConnectionFactory.make({
    keySeed,
    knownRelays: options.relays ?? [],
    logger,
    signal: stopController.signal,
    maxRetryAttempts: options.maxRetryAttempts,
    maxMessageSizeBytes: options.maxMessageSizeBytes ?? DEFAULT_MAX_MESSAGE_SIZE_BYTES,
    directTransports: options.directTransports,
    allowedWsHosts: options.allowedWsHosts,
  });
  return makeChannelNetlayer({
    provider,
    hooks: { handleMessage: remoteMessageHandler, onRemoteGiveUp, onIncarnationChange },
    options: { ...pick timeout/limit fields from options..., localIncarnationId },
    logger,
  });
}
```

**Wiring caveat (important, do not skip):** today the single `stopController`/`signal` created in
`initTransport` is shared by _both_ the `ConnectionFactory` (passed as `signal`) _and_ the engine's
`readChannel`/`stop`/reconnection logic (which calls `stopController.abort()` in `stop()`). When you
split, the engine's `stop()` must still abort the same signal the provider was constructed with.
Two acceptable shapes:

- (A) `initTransport` owns the `AbortController`, passes `signal` to `ConnectionFactory.make`, and
  passes the same controller into `makeChannelNetlayer` (add `stopController` to the engine params)
  so `stop()` can `abort()` it. This is the closest to current behavior — recommended.
- (B) The engine owns the controller and exposes the signal; `initTransport` would then need it
  _before_ calling `ConnectionFactory.make`, which is awkward. Prefer (A).

Under (A), add `signal: AbortSignal` (and the ability to abort — pass the controller or an
`abort()` callback) to the engine params. The engine currently reads `signal` in `readChannel`
(abort check), `sendRemoteMessage` (abort check), `onPeerDisconnect` handler, and calls
`stopController.abort()` in `stop()`. Keep all of these pointing at the shared controller.

### 3.7 Error mapping: enumeration of every libp2p error sniffed today and its neutral mapping

The mapper `mapLibp2pReadError(problem: unknown): unknown` lives in `connection-factory.ts` and is
applied inside `NetworkChannel.read`. It is the _only_ place libp2p read-error types are named.

| Raw error (source)                                                                                                | Where sniffed today                                                                                        | Neutral mapping (Phase 1)                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `InvalidDataLengthError` (`@libp2p/utils`)                                                                        | `transport.readChannel` (`transport.ts:472`)                                                               | `MessageTooLargeError` (with `cause: problem`)                                                                                                                                                                               |
| `InvalidDataLengthLengthError` (`@libp2p/utils`)                                                                  | `transport.readChannel` (`transport.ts:473`)                                                               | `MessageTooLargeError` (with `cause: problem`)                                                                                                                                                                               |
| `StreamResetError` (`@libp2p/interface`)                                                                          | `transport.readChannel` (`transport.ts:496`) and (dead-code) `isIntentionalDisconnect` (`transport.ts:68`) | `ChannelResetError` (with `cause: problem`)                                                                                                                                                                                  |
| SCTP user-initiated abort: `errorDetail === 'sctp-failure' && sctpCauseCode === 12` (`SCTP_USER_INITIATED_ABORT`) | `transport.isIntentionalDisconnect` (`transport.ts:71–78`)                                                 | `IntentionalDisconnectError` (with `cause: problem`)                                                                                                                                                                         |
| `UnexpectedEOFError` (`@libp2p/utils`)                                                                            | _not_ explicitly sniffed; falls into `readChannel` `else` → reconnect                                      | **pass through unchanged** (re-throw as-is) → engine `else` branch → `handleConnectionLoss`. Preserves the "EOF = potential mid-message drop = reconnect" behavior asserted by the existing test at `transport.test.ts:743`. |
| any other read error                                                                                              | `readChannel` `else`                                                                                       | pass through unchanged                                                                                                                                                                                                       |

Mapper logic (mirror the current ordering so a `StreamResetError` never maps to intentional):

```ts
function mapLibp2pReadError(problem: unknown): unknown {
  if (
    problem instanceof InvalidDataLengthError ||
    problem instanceof InvalidDataLengthLengthError
  ) {
    return new MessageTooLargeError({ cause: problem as Error });
  }
  if (problem instanceof StreamResetError) {
    return new ChannelResetError({ cause: problem as Error });
  }
  const rtc = problem as { errorDetail?: string; sctpCauseCode?: number };
  if (
    rtc?.errorDetail === 'sctp-failure' &&
    rtc?.sctpCauseCode === SCTP_USER_INITIATED_ABORT
  ) {
    return new IntentionalDisconnectError({ cause: problem as Error });
  }
  return problem; // UnexpectedEOFError and everything else pass through
}
```

**`MessageTooLargeError` and the current `ResourceLimitError` wrapping — behavior-preservation
note.** Today, on `InvalidDataLength*`, `transport.readChannel` builds a `ResourceLimitError` with
`data: { limitType: 'messageSize' }`, logs it via `outputError`, calls `handleConnectionLoss`, and
throws it. That thrown error is only ever _logged_ (it propagates to `registerChannel`'s
`.catch(...)` / the inbound-setup `.catch(...)`, both of which just log) — it is not observed by any
caller or persisted. So swapping it for `MessageTooLargeError` is behavior-preserving at every
observable boundary _except the exact log text_. To keep logs recognizable, give
`MessageTooLargeError` a message like `"Inbound message exceeds size limit"` and, in the engine's
`MessageTooLargeError` branch, keep the same `outputError` + `handleConnectionLoss` + throw
sequence. Do **not** re-introduce `ResourceLimitError` in the engine's read path — the whole point
is to keep libp2p-shaped size errors behind the neutral seam. (The _sender-side_
`validateMessageSize` in `validators.ts` still throws `ResourceLimitError(messageSize)`; that is
untouched and is a separate, observed path.)

Keep `SCTP_USER_INITIATED_ABORT` in `platform/constants.ts` (imported by `connection-factory.ts`
now instead of `transport.ts`). `MuxerClosedError` and `TooManyOutboundProtocolStreamsError`
sniffing in `openChannelOnce` stay in `connection-factory.ts` unchanged.

### 3.8 `packages/ocap-kernel/src/index.ts`

- Keep `export { initTransport } from './remotes/platform/transport.ts';` (line 10) unchanged.
- Optionally also export `makeChannelNetlayer` and the new engine types for future use, but this is
  not required by Phase 1 and adds public surface — **recommend leaving them unexported** for now.
- The `RemoteCommsOptions` / `RemoteComms` / etc. re-exports (lines 35–38) are unchanged. `Channel`
  was never exported from the package index, so no external surface changes.

### 3.9 Runtimes — confirm untouched

`kernel-node-runtime/src/kernel/PlatformServices.ts` (call at line 314) and
`kernel-browser-runtime/src/PlatformServicesServer.ts` (call at line 313) both `await
initTransport(keySeed, options, handler, onRemoteGiveUp, incarnationId, onIncarnationChange)` and
destructure `{ sendRemoteMessage, stop, closeConnection, registerLocationHints, reconnectPeer,
resetAllBackoffs, getListenAddresses }`. Because §3.6 preserves that signature and return shape
exactly, **no runtime files change**. Grep after the refactor to confirm (see §7).

---

## 4. `@metamask/kernel-errors` changes

Add three error classes following the established pattern (see `NetworkStoppedError.ts` /
`PeerRestartedError.ts` — no `data`; and `ResourceLimitError.ts` — with `data`). Each class:
extends `BaseError`, takes `ErrorOptionsWithStack`, calls `super(ErrorCode.X, message, {...options})`,
`harden(this)`, defines a static `struct` and static `unmarshal`, and ends with `harden(ClassName)`.

### 4.1 `ErrorCode` additions — `packages/kernel-errors/src/constants.ts`

Add to the `ErrorCode` object (after `NetworkStoppedError`, line 39):

```ts
  ChannelResetError: 'CHANNEL_RESET_ERROR',
  IntentionalDisconnectError: 'INTENTIONAL_DISCONNECT_ERROR',
  MessageTooLargeError: 'MESSAGE_TOO_LARGE_ERROR',
```

### 4.2 New files (mirror `NetworkStoppedError.ts` exactly)

- `packages/kernel-errors/src/errors/ChannelResetError.ts` — message: `"Channel reset by remote
peer"`; no `data` (`data: optional(never())` in struct); `code: literal(ErrorCode.ChannelResetError)`.
- `packages/kernel-errors/src/errors/IntentionalDisconnectError.ts` — message: `"Remote peer
intentionally disconnected"`; no `data`.
- `packages/kernel-errors/src/errors/MessageTooLargeError.ts` — message: `"Inbound message exceeds
size limit"`. Two options for `data`:
  - **(recommended, simplest)** no `data` (`optional(never())`), rely on `cause`. Sufficient because
    the size limit is only surfaced in logs.
  - or a small `data` shape `{ limit?: number }` following the `ResourceLimitError` struct pattern,
    if you want the limit machine-readable. Not required for Phase 1 parity.

Each also gets a co-located `*.test.ts` following `NetworkStoppedError.test.ts` /
`ResourceLimitError.test.ts` (construct, message, code, `harden`, marshal/unmarshal round-trip).

### 4.3 `packages/kernel-errors/src/index.ts` exports

Add after the `NetworkStoppedError` export (line 12):

```ts
export { ChannelResetError } from './errors/ChannelResetError.ts';
export { IntentionalDisconnectError } from './errors/IntentionalDisconnectError.ts';
export { MessageTooLargeError } from './errors/MessageTooLargeError.ts';
```

### 4.4 Marshaling / unmarshaling registry (required — not optional)

`unmarshalError` dispatches through the `errorClasses` record in
`packages/kernel-errors/src/errors/index.ts` (`errorClasses[marshaledError.code].unmarshal(...)`,
`marshal/unmarshalError.ts:19`). That record currently maps all 13 existing `ErrorCode` values to
their classes. Two consequences make adding the three new classes here **mandatory**:

1. `errorClasses[marshaledError.code]` is indexed by the full `ErrorCode` union, so the record must
   stay total — adding `ErrorCode` entries in §4.1 without matching `errorClasses` entries is a
   compile error.
2. Without the entry, a marshaled `ChannelResetError` / `IntentionalDisconnectError` /
   `MessageTooLargeError` would never route to its `unmarshal`.

Add to `errorClasses` in `packages/kernel-errors/src/errors/index.ts` (plus the three `import` lines
at the top of that file):

```ts
  [ErrorCode.ChannelResetError]: ChannelResetError,
  [ErrorCode.IntentionalDisconnectError]: IntentionalDisconnectError,
  [ErrorCode.MessageTooLargeError]: MessageTooLargeError,
```

Add round-trip coverage in `packages/kernel-errors/src/index.test.ts` alongside the existing
per-error cases.

### 4.5 What Phase 1 does NOT change in kernel-errors

- `isRetryableNetworkError.ts` keeps its `import { MuxerClosedError } from '@libp2p/interface'` and
  all name/code sniffing (Phase 2+).
- `getNetworkErrorCode.ts` unchanged.
- No libp2p import is removed from kernel-errors in Phase 1.

---

## 5. Test plan

### 5.1 Tests that only need type/shape swaps (mechanical)

- `peer-state-manager.test.ts`, `reconnection-lifecycle.test.ts`, `reconnection.test.ts`,
  `rate-limiter.test.ts`, `validators.test.ts` — swap any `Channel`-typed mocks to `NetworkChannel`
  shape (`{ peerId, read, write, close, setInactivityTimeout }`) where they construct fake channels.
  Most of these use minimal `{}`-ish channel stand-ins; update fields to the new shape. No behavior
  assertions change.

### 5.2 `channel-utils.test.ts`

- The `writeWithTimeout` mock channel currently has `{ stream: { status: 'open' }, msgStream: {
write } }` (lines 85–95). Reshape to a `NetworkChannel`: `{ peerId, write: vi.fn()...,
read, close, setInactivityTimeout }`, and assert on `mockChannel.write` instead of
  `mockChannel.msgStream.write`.
- **Move the "throws immediately when stream status is %s" test** (line 148) out of
  `channel-utils.test.ts` and into `connection-factory.test.ts` — the not-open short-circuit now
  lives in the provider's `NetworkChannel.write`. Assert it there against a channel built from a
  stream with `status: 'closed'/'aborted'/'reset'`.

### 5.3 `handshake.test.ts`

- Reshape the mock channel to `NetworkChannel` (`read`/`write` instead of `msgStream.read`/`write`).
  Behavior/assertions unchanged.
- Its only libp2p import is `import { UnexpectedEOFError } from '@libp2p/utils'` (line 1), plus the
  `Channel` type import (line 11). Swap `Channel` → `NetworkChannel`; where the test currently
  injects `UnexpectedEOFError` on a read, a plain `Error` works just as well (the handshake path does
  not special-case it), so drop the `@libp2p/utils` import and make `handshake.test.ts`
  libp2p-import-free.

### 5.4 `transport.test.ts` (the big one, ~110 KB)

Two categories of change:

1. **Mock reshape.** The `MockChannel`/`MockStream` (lines 71–104, `createMockChannel` at
   248–273) currently model `{ stream: { status, inactivityTimeout, addEventListener, close,
abort }, msgStream: { read, write, unwrap } }`. Reshape to `NetworkChannel`:
   `{ peerId, read: vi.fn(), write: vi.fn(), close: vi.fn(), setInactivityTimeout: vi.fn() }`.
   The mocked `ConnectionFactory` (`mockConnectionFactory`, lines 89–104) must implement the new
   `ChannelProvider`: rename `dialIdempotent` → `dial`, `onInboundConnection` → `onInboundChannel`;
   `closeChannel` now takes one arg. Update all `mockChannel.msgStream.read/write` references
   (~30 sites) to `mockChannel.read/write`, `mockChannel.stream.close` → `mockChannel.close`,
   and drop `stream.inactivityTimeout`/`stream.addEventListener` assertions (that behavior moved to
   the provider — assert it in `connection-factory.test.ts` instead, §5.5).
2. **Error-injection tests inject neutral errors.** The engine now only sees neutral errors from
   `channel.read()`. Update:

   - "handles graceful disconnect without error logging" (line 588): instead of the SCTP object
     (`{ errorDetail: 'sctp-failure', sctpCauseCode: 12 }`), reject `read` with a
     `new IntentionalDisconnectError()`. Same assertions (logs "remote intentionally disconnected",
     no reconnection).
   - "treats StreamResetError as connection loss…" (line 620): instead of importing
     `StreamResetError` from `@libp2p/interface`, reject `read` with `new ChannelResetError()`.
     Rename the test to "treats ChannelResetError as connection loss, not intentional close". Same
     assertions (logs "stream reset by remote, reconnecting", starts reconnection).
   - "treats UnexpectedEOFError as connection loss…" (line 743): the pass-through case. It can keep
     rejecting with a generic error (the neutral seam passes non-mapped errors through). Either
     keep `UnexpectedEOFError` (import remains, harmless) or replace with `new Error('stream
closed')` to drop the libp2p import from the test. Prefer the plain `Error` so
     `transport.test.ts` becomes libp2p-import-free. Same assertions (reconnection triggered,
     handler not called).
   - Any inbound-size / `InvalidDataLength` test (none currently in `transport.test.ts`) — add one
     that rejects `read` with `new MessageTooLargeError()` and asserts `handleConnectionLoss`
     (reconnection started) + the size log, to cover the engine's new `MessageTooLargeError` branch.
   - The `ConnectionFactory.make` argument assertions (lines 286–294) are unchanged (the wrapper
     still passes the same options). Only the mock's method names change.

   After this, remove the top-level `import { UnexpectedEOFError } from '@libp2p/utils'` (line 1) if
   you replaced its single use; `transport.test.ts` then imports no libp2p.

### 5.5 `connection-factory.test.ts` — new/moved coverage (this is where the seam behavior now lives)

The provider now owns lp-framing wrapping, the inactivity-timeout setter, the close-event
diagnostic listener, the write not-open short-circuit, and `mapLibp2pReadError`. Add:

- **Per-error-class mapping tests** for `mapLibp2pReadError` via `NetworkChannel.read` (the master
  plan's headline requirement). Construct a `ConnectionFactory` (with the existing libp2p mocks in
  this file), obtain a channel, make the underlying `lpStream.read` reject with each raw error, and
  assert the channel's `read()` throws the mapped neutral class:
  - `InvalidDataLengthError` → `MessageTooLargeError`
  - `InvalidDataLengthLengthError` → `MessageTooLargeError`
  - `StreamResetError` → `ChannelResetError`
  - SCTP object `{ errorDetail: 'sctp-failure', sctpCauseCode: 12 }` → `IntentionalDisconnectError`
  - `UnexpectedEOFError` → re-thrown unchanged (assert `instanceof UnexpectedEOFError`)
  - arbitrary `Error` → re-thrown unchanged
    Each mapped error should also carry the original as `cause`.
- **`setInactivityTimeout`** sets `stream.inactivityTimeout` (moved from the old
  `transport.registerChannel` behavior).
- **close-event diagnostic listener** logs the three cases (local / remote-error / remote-clean) —
  moved from the old `transport.registerChannel` (transport.ts:343–357).
- **write short-circuit** throws `"Stream is <status>, cannot write"` when the underlying stream is
  not `open` (moved from `channel-utils`).
- The existing `@libp2p/utils` mock in this file (lines 230–248) already fakes `lpStream` (a
  `MockByteStream` with `read`/`write`, tracked in a `WeakMap` via `getByteStreamFor`) and already
  exports stub `InvalidDataLengthError`, `InvalidDataLengthLengthError`, and `UnexpectedEOFError`
  classes; `libp2p`'s `createLibp2p` is mocked too. So the per-error mapping tests need no new mock
  infra — build a channel, make the mocked `lpStream.read` reject with each stubbed error (import
  `StreamResetError` from the `@libp2p/interface` mock or add a stub), and assert `channel.read()`
  throws the mapped neutral class. Channel-construction assertions adapt to `#makeNetworkChannel`.
- `lp-framing.test.ts` is unchanged and stays where it is (it tests real `lpStream` framing, which
  the provider now solely owns; conceptually it now belongs with the provider but needs no edits).

### 5.6 `packages/kernel-errors` tests

- New co-located tests for the three error classes (§4.2).
- Extend `packages/kernel-errors/src/index.test.ts` for the new exports + marshal round-trips.

---

## 6. Step-by-step execution order (compilable/greenable intermediate states)

Do it bottom-up so the tree keeps type-checking:

1. **kernel-errors first (independent, self-contained).** Add the three `ErrorCode` entries, three
   error-class files + tests, index exports, and unmarshal-registry wiring (§4). Run
   `yarn workspace @metamask/kernel-errors test:dev:quiet` and `build`. Green before proceeding.
   This lets ocap-kernel import the neutral classes.
2. **types.ts.** Replace `Channel`/handlers with `NetworkChannel`/`ChannelProvider`/handlers (§3.1).
   The package won't compile yet (consumers still reference old shapes) — that's expected; proceed
   directly to steps 3–6 which are one coherent change set.
3. **connection-factory.ts.** Add `#makeNetworkChannel`, `mapLibp2pReadError`,
   `isIntentionalDisconnect`, `#closeStream`; rename `dialIdempotent`→`dial`,
   `onInboundConnection`→`onInboundChannel`; make it produce/consume `NetworkChannel` (§3.2, §3.7).
4. **channel-utils.ts + handshake.ts.** Type swaps + `read`/`write` via `NetworkChannel`; remove the
   status short-circuit from `channel-utils` (§3.3, §3.4).
5. **peer-state-manager.ts + reconnection-lifecycle.ts.** Type swaps; adopt `closeChannel(channel)`
   if chosen (§3.5).
6. **transport.ts.** Split into `makeChannelNetlayer` + `initTransport` wrapper; swap
   `connectionFactory`→`provider`, neutral error branches in `readChannel`, `setInactivityTimeout`
   call, remove libp2p imports, preserve the shared-`AbortController` wiring (§3.6).
7. **Type-check the package.** `yarn workspace @metamask/ocap-kernel build` (or `tsc`) until clean.
8. **Adapt tests** in the order: `channel-utils.test.ts`, `handshake.test.ts`, the small
   transport-agnostic tests, `connection-factory.test.ts` (add mapping/moved-behavior tests),
   then `transport.test.ts` (mock reshape + neutral error injection) (§5).
9. **Full package tests, then repo build + integration** (§7).

Intermediate compilable checkpoints: after step 1 (kernel-errors green), and after step 7
(ocap-kernel type-checks). Between 2 and 7 the package is mid-change and will not compile; keep that
window a single reviewable commit.

---

## 7. Verification

Per `CLAUDE.md`, use `yarn`/`yarn workspace` scripts (root `build`/`test:dev:quiet` are
turbo-cached). Commands:

```bash
# kernel-errors (after §4)
yarn workspace @metamask/kernel-errors lint:fix
yarn workspace @metamask/kernel-errors test:dev:quiet --coverage=true
yarn workspace @metamask/kernel-errors build

# ocap-kernel (after §3, §5)
yarn workspace @metamask/ocap-kernel lint:fix
yarn workspace @metamask/ocap-kernel test:dev:quiet --coverage=true
yarn workspace @metamask/ocap-kernel build

# whole repo (turbo-cached)
yarn lint:fix
yarn build
yarn test:dev:quiet

# integration — @ocap/kernel-test package (remote comms across kernels over the relay).
# Note: kernel-test has no separate test:integration script; its integration tests run under the
# normal test runner. The relevant file is packages/kernel-test/src/remote-comms.test.ts.
yarn workspace @ocap/kernel-test test:dev:quiet
```

Grep-based confirmations (must all be empty / as stated):

```bash
# transport.ts, channel-utils.ts, handshake.ts, types.ts import no libp2p:
grep -nE "@libp2p|@chainsafe|@multiformats|from 'libp2p'" \
  packages/ocap-kernel/src/remotes/types.ts \
  packages/ocap-kernel/src/remotes/platform/transport.ts \
  packages/ocap-kernel/src/remotes/platform/channel-utils.ts \
  packages/ocap-kernel/src/remotes/platform/handshake.ts
# expected: no matches

# libp2p error types are named only in connection-factory.ts (+ its test) and kernel-errors:
grep -rn "StreamResetError|InvalidDataLength|MuxerClosedError|StreamCloseEvent" packages/ocap-kernel/src
# expected: only connection-factory.ts / connection-factory.test.ts

# runtimes still call initTransport unchanged:
grep -rn "initTransport" packages/kernel-node-runtime/src packages/kernel-browser-runtime/src
```

Also run the affected runtimes' unit suites to confirm the unchanged call sites still pass:
`yarn workspace @metamask/kernel-node-runtime test:dev:quiet` and the browser-runtime equivalent.

---

## 8. Phase-specific risks and how to preserve the subtle behavior

The master plan flags `transport.ts` as encoding subtle races. Locate and preserve each:

1. **`reuseOrReturnChannel` race** (`transport.ts:387–427`). Handles simultaneous inbound+outbound
   dials to the same peer, with re-checks of `state.channel` after each `await`. It is transport-
   agnostic already. **Preservation:** move it verbatim into `makeChannelNetlayer`; only swap the
   `Channel` type and the `connectionFactory.closeChannel(dialed, peerId)` call →
   `provider.closeChannel(dialed)`. Do not restructure the null-return branches — the callers
   (`sendRemoteMessage`, `tryReconnect`) depend on `null` meaning "existing died during await,
   re-dial/fail".
2. **Handshake-before-register** (`sendRemoteMessage` lines 638–673; `tryReconnect`
   `reconnection-lifecycle.ts:240–265`; `handleInboundConnection` lines 756–765). The channel is
   handshaked _before_ `registerChannel`, and on `incarnationChanged` the freshly dialed channel is
   closed **without** registering (outbound) / rejected (inbound) to keep pre-restart payloads off a
   fresh-incarnation channel. **Preservation:** keep the exact order (limit re-check → handshake →
   incarnation check → register) and the `PeerRestartedError` throw path. These paths only call
   `provider.closeChannel`/`provider.dial` and the unchanged `doOutboundHandshake`/
   `doInboundHandshake` — do not touch their control flow.
3. **Restart suppression via `onIncarnationChange`** (`doOutboundHandshake` lines 203–244,
   `doInboundHandshake` lines 261–294, and the `OnIncarnationChange` contract documented in
   `types.ts:40–63`). The engine ORs the PSM-detected change with the kernel-callback verdict, and a
   callback throw is treated as handshake failure (fail-closed). **Preservation:** move these two
   functions verbatim; they already only depend on `handshakeDeps`, `performOutbound/InboundHandshake`,
   `hooks.onIncarnationChange`, and `outputError`. Do not "simplify" the try/catch-returns-false
   logic — the inbound side relies on `false` to close the channel.
4. **Read-error ordering** (`ChannelResetError` before `IntentionalDisconnectError`) — see §3.6/§3.7.
   A remote reset must always reconnect, never be swallowed as intentional (security: a malicious
   peer could otherwise permanently suppress a connection). The mapper preserves this by mapping
   `StreamResetError` → `ChannelResetError` and the engine checks it first.
5. **Shared `AbortController` between provider and engine** — §3.6 wiring caveat. If the engine's
   `stop()` aborts a _different_ signal than the one the provider was built with, dials/reads won't
   cancel on shutdown → hung tests / leaked libp2p nodes. Use option (A).
6. **`writeWithTimeout` not-open short-circuit relocation** — the check now runs inside
   `NetworkChannel.write` (provider), _before_ the engine's timeout race. Behavior is identical
   (same throw text), but confirm the moved test (§5.2) still asserts the throw and that
   `sendRemoteMessage`'s catch → `handleConnectionLoss` still fires on a closed-stream write.
7. **`onPeerDisconnect` safety net** (`transport.ts:780–788`): only triggers reconnection when no
   active channel exists, and is suppressed while `signal.aborted`. Preserve exactly; it's easy to
   drop the `signal.aborted` guard when moving.

Lower-severity risks: the diagnostic close-event log strings moving from engine to provider means
any log-scraping test must move too (only `connection-factory.test.ts` should assert them after the
move); and the `MessageTooLargeError`-vs-`ResourceLimitError` log-text change (§3.7) — keep the
message recognizable.

---

## 9. Estimate

**3–4 developer-days**, consistent with the master plan:

- kernel-errors (3 classes + tests + registry): ~0.5 day.
- `types.ts` + `connection-factory.ts` + `channel-utils.ts` + `handshake.ts` +
  `peer-state-manager.ts`/`reconnection-lifecycle.ts` production changes: ~1 day.
- `transport.ts` split (engine + wrapper) with the AbortController wiring and error-branch swap:
  ~0.5–1 day.
- Test adaptation, dominated by `transport.test.ts` (~110 KB, ~30 mock-shape sites + error-injection
  rewrites) plus the new `connection-factory.test.ts` mapping coverage: ~1–1.5 days.
- Full verification incl. `kernel-test` integration and grep audits: ~0.5 day.

The single largest risk to the estimate is `transport.test.ts` breadth; budget accordingly.
