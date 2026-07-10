# Phase 4 — Extract `@metamask/netlayer-libp2p` + flip runtime injection

Implementation plan for Phase 4 of the pluggable-netlayer effort (issue
[#968](https://github.com/MetaMask/ocap-kernel/issues/968)). Master plan:
[`master.md`](./master.md).

This is the largest phase, split into two PRs (**4a** and **4b**), each of which must
leave CI green.

## Assumed starting state (Phases 1–3 done)

> **Reconciled against landed Phases 1–3** (branches `rekm/netlayer-1/2/3`). The prior
> DELTA notes are resolved; the state below is what actually merged. Read master.md's
> "Phase 3 — Landed decisions" block for the exact `@metamask/netlayer` /
> `@metamask/netlayer-loopback` surface. Cross-phase line numbers elsewhere are indicative;
> the landed code wins.

Landed and true as of the start of Phase 4:

- **`@metamask/netlayer` exists** (published, `0.1.0`, single `.` export) and owns the
  kernel-facing contract types (`Netlayer`, `NetlayerFactory`, `NetlayerParams`,
  `NetlayerHooks`, `NetlayerSpecifier`, `NetlayerRegistry`), the channel seam
  (`NetworkChannel`, `ChannelProvider` — the latter now carries `readonly peerId`), the
  channel-session engine `makeChannelNetlayer` (`src/channel-netlayer.ts`), the shared
  machinery (`handshake.ts` — now with a versioned message, `peer-state-manager.ts`,
  `reconnection.ts`, `reconnection-lifecycle.ts`, `rate-limiter.ts`, `validators.ts`,
  `channel-utils.ts`, the neutral engine `constants.ts`), and the neutral Ed25519 identity
  helpers (`identity.ts`: `deriveNeutralPeerId`/`neutralPeerIdToPublicKey`/
  `publicKeyToNeutralPeerId`). Tests moved with them.
  - **`makeChannelNetlayer` signature (LANDED, use this — the §2.3/§2.6 sketches below
    predate it):** `makeChannelNetlayer({ provider, hooks, options, logger, stopController })`
    returning `Netlayer` (synchronous). It does **not** take a bare `incarnationId`; the
    local incarnation is `options.localIncarnationId`. `stopController` is a shared
    `AbortController` — `stop()` aborts it and it is the same signal the provider was
    constructed with. `make-libp2p-netlayer.ts` must construct that `AbortController`, pass
    `signal` to `ConnectionFactory.make` and the whole controller to `makeChannelNetlayer`
    (this is exactly what ocap-kernel's thin `initTransport` does today — copy it).
- **`@metamask/netlayer-loopback` exists** (published, `0.1.0`). It is **not** a
  `ChannelProvider` — it implements `Netlayer` directly over an in-process `LoopbackHub`
  (`makeLoopbackHub`/`makeLoopbackNetlayer`, config `{ hub }`). Used as the standard test
  fake; `packages/ocap-kernel/test/loopback-platform-services.ts` wraps it as a
  `PlatformServices` and `packages/ocap-kernel/src/remotes/loopback.test.ts` is a two-party
  in-process demonstration.
- **Identity is neutral (Phase 2, unchanged in 3).** `remotes/kernel/remote-comms.ts`
  derives the peerId via `deriveNeutralPeerId` (now imported from `@metamask/netlayer`) +
  WebCrypto for the ocap-URL oid; `@libp2p/crypto`/`@libp2p/peer-id` are gone from the
  kernel identity path; the `ocap:` URL host is the neutral id; hints are opaque strings.
  - **Still-open DELTA for Phase 4:** `kernel-test/src/remote-comms.test.ts`'s fake
    platform-services derives its peerId with `deriveNeutralPeerId` (from `@metamask/ocap-kernel`),
    **not** `@libp2p/*` — that was already fixed in Phase 2. Its `initializeRemoteComms` is
    still the positional signature; update it to the 4b options-bag shape.
- **kernel-errors is libp2p-free (Phase 2).** It exports the neutral error classes
  (`ChannelResetError`, `IntentionalDisconnectError`, `MessageTooLargeError`); the
  libp2p→neutral read-error mapper is `mapLibp2pReadError`/`isIntentionalDisconnect`,
  **module-private functions in `connection-factory.ts`** (not a standalone file yet).
  `isRetryableNetworkError` still name-sniffs `MuxerClosedError`/`Dial`/`Transport`/
  `NO_RESERVATION` **by string** (annotated in kernel-errors to move to netlayer-libp2p's
  error mapper here in Phase 4).
- **ocap-kernel still physically hosts the libp2p implementation:** the libp2p
  `ChannelProvider` (`remotes/platform/connection-factory.ts`, which now has a
  `get peerId()` returning `deriveNeutralPeerId(fromHex(keySeed))` and imports
  `NetworkChannel`/`InboundChannelHandler`/`PeerDisconnectHandler` +
  `DEFAULT_MAX_MESSAGE_SIZE_BYTES` + the three identity helpers from `@metamask/netlayer`),
  the module-private error mapper, `utils/multiaddr.ts`, `utils/network.ts`, a reduced
  `constants.ts` (**libp2p-only: `SCTP_USER_INITIATED_ABORT`, `RELAY_RECONNECT_BASE_DELAY_MS`,
  `RELAY_RECONNECT_MAX_DELAY_MS`, `RELAY_RECONNECT_MAX_ATTEMPTS`** — the engine constants
  moved to `@metamask/netlayer` in Phase 3), and a thin `transport.ts` whose
  `initTransport` constructs `ConnectionFactory` and delegates to `makeChannelNetlayer`. It
  re-exports the netlayer types and depends on `@metamask/netlayer`. It still carries all
  libp2p deps.

The file-move maps below assume this landed state. Where a sketch (esp. §2.3/§2.6) shows
`makeChannelNetlayer({ ..., incarnationId, ...engineOptions })`, use the landed signature
above instead.

---

## 1. Objective, PR split, non-goals

### Objective

Physically remove the libp2p implementation from `@metamask/ocap-kernel` into a new
`@metamask/netlayer-libp2p` package, and invert control so runtimes **inject** a
`NetlayerRegistry` and callers select an implementation with a `NetlayerSpecifier`
(`{ netlayer: string; config: Json }`) rather than the kernel hard-wiring libp2p. At the
end of Phase 4, `packages/ocap-kernel/package.json` has **zero**
`libp2p`/`@libp2p`/`@chainsafe`/`@multiformats` dependencies. (Plain `multiformats` is not
libp2p and stays — `base58btc` is the neutral encoding; see §6.)

### PR 4a — Extract `@metamask/netlayer-libp2p` (no behavior change)

Create the package; move the libp2p `ChannelProvider`, error mapper, multiaddr/network
utils, browser-default + `./nodejs` (QUIC/TCP) netlayer factories, and the relay server
(`./relay`) into it. ocap-kernel **temporarily depends on** `@metamask/netlayer-libp2p`
and **re-exports `initTransport`** so every current caller keeps compiling unchanged.
kernel-cli's `relay` command repoints to the new `./relay` subpath. No runtime wiring
changes; no RPC changes. This PR is a pure move + re-export — CI green with the existing
injection path intact.

### PR 4b — Flip runtime injection

`PlatformServices.initializeRemoteComms` becomes an options bag taking a
`NetlayerSpecifier`; `NodejsPlatformServices` and `PlatformServicesServer` are constructed
with a `NetlayerRegistry`. Update the RPC superstruct shapes (config is `Json`, so it
crosses postMessage), the kernel→platform option flow (with persisted hint-pool injection
as `config.knownRelays`), kernel-cli daemon config, extension `offscreen.ts` (hard-coded
relay → config), and `comms-query-string.ts` (→ specifier passthrough). Remove the
`initTransport` re-export and **all** libp2p deps from ocap-kernel. Relocate kernel-shims'
pre-lockdown `import '@libp2p/webrtc'` alongside the libp2p netlayer.

### Non-goals

- No new netlayer capabilities; the libp2p behavior is preserved byte-for-byte.
- No WebSocket netlayer (Phase 5), no iroh, no terminology rename (Phase 6).
- No change to the Ken protocol, `RemoteHandle`, ocap-URL issue/redeem, or store schema
  (the hint pool stays; only the field carrying it to the netlayer is renamed to
  `config.knownRelays`).
- No public third-party extension point — the registry is internal.

---

## 2. PR 4a — Extract `@metamask/netlayer-libp2p`

### 2.1 New package layout

Scaffold with `yarn create-package --name netlayer-libp2p --description "libp2p netlayer
implementation for the ocap kernel"`, then edit `package.json` to publish as
`@metamask/netlayer-libp2p` (mirror `packages/ocap-kernel/package.json`: `private:
false`, the `@metamask/` publish config, and the `.`/`require`/`import` conditions).
Follow the multi-subpath export pattern already used by `@metamask/kernel-utils`
(which exports `.`, `./nodejs`, `./libp2p`).

```
packages/netlayer-libp2p/
  src/
    index.ts                     # browser default: libp2pNetlayerFactory + Libp2pNetlayerConfig(Struct)
    make-libp2p-netlayer.ts      # shared: ConnectionFactory + makeChannelNetlayer wiring (the old initTransport body)
    connection-factory.ts        # moved from ocap-kernel; the libp2p ChannelProvider
    connection-factory.test.ts
    config.ts                    # Libp2pNetlayerConfigStruct + Libp2pNetlayerConfig
    config.test.ts
    error-mapper.ts              # moved libp2p→neutral error mapper (from Phase 1)
    error-mapper.test.ts
    lp-framing.test.ts           # moved (exercises @libp2p/utils lpStream framing)
    constants.ts                 # libp2p-provider-only constants (relay reconnect delays, etc.)
    utils/
      multiaddr.ts               # moved from ocap-kernel/src/utils/multiaddr.ts
      multiaddr.test.ts
      network.ts                 # moved from ocap-kernel/src/utils/network.ts
      network.test.ts
    nodejs/
      index.ts                   # nodejsLibp2pNetlayerFactory (QUIC/TCP direct transports)
      index.test.ts
      direct-transports.ts       # QUIC/TCP sniffing moved from kernel-node-runtime PlatformServices
      direct-transports.test.ts
      endoify.ts                 # side-effect module: import '@libp2p/webrtc' then run kernel-shims endoify-node (see 3.7)
    relay/
      index.ts                   # startRelay, moved from kernel-utils/src/libp2p-relay.ts
      index.test.ts
  package.json
  tsconfig.json
  tsconfig.build.json
```

**Exports map** (`packages/netlayer-libp2p/package.json`):

```jsonc
"exports": {
  ".":            { "import": {...index.d.mts / index.mjs}, "require": {...} },
  "./nodejs":     { "import": {...nodejs/index...}, "require": {...} },
  "./nodejs/endoify": { "import": {...nodejs/endoify...}, "require": {...} },
  "./relay":      { "import": {...relay/index...}, "require": {...} },
  "./package.json": "./package.json"
}
```

`@metamask/netlayer-libp2p` depends on `@metamask/netlayer` (types +
`makeChannelNetlayer` + shared machinery), `@metamask/kernel-errors`,
`@metamask/kernel-utils`, `@metamask/logger`, `@metamask/superstruct`,
`@metamask/kernel-shims` (only for `./nodejs/endoify`), and **all** the libp2p-family
deps enumerated in §6. Add tsconfig `references` to `@metamask/netlayer`,
`kernel-errors`, `kernel-utils`, `logger`, `kernel-shims` per CLAUDE.md.

### 2.2 File-move map (source → destination)

| From (ocap-kernel / kernel-utils)                                                                                                                    | To (`@metamask/netlayer-libp2p`)    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `ocap-kernel/src/remotes/platform/connection-factory.ts` (+`.test.ts`)                                                                               | `src/connection-factory.ts` (+test) |
| `ocap-kernel/src/remotes/platform/` libp2p error mapper (from Phase 1) (+test)                                                                       | `src/error-mapper.ts` (+test)       |
| `ocap-kernel/src/remotes/platform/lp-framing.test.ts`                                                                                                | `src/lp-framing.test.ts`            |
| `ocap-kernel/src/remotes/platform/constants.ts` — the provider-only subset (`RELAY_RECONNECT_*`, `DEFAULT_MAX_MESSAGE_SIZE_BYTES` if provider-owned) | `src/constants.ts`                  |
| `ocap-kernel/src/utils/multiaddr.ts` (+`.test.ts`)                                                                                                   | `src/utils/multiaddr.ts` (+test)    |
| `ocap-kernel/src/utils/network.ts` (+`.test.ts`)                                                                                                     | `src/utils/network.ts` (+test)      |
| The thin `initTransport` body (post-Phase-3, wiring `ConnectionFactory` → `makeChannelNetlayer`)                                                     | `src/make-libp2p-netlayer.ts`       |
| QUIC/TCP sniffing block in `kernel-node-runtime/src/kernel/PlatformServices.ts` lines 262–304                                                        | `src/nodejs/direct-transports.ts`   |
| `kernel-utils/src/libp2p-relay.ts`                                                                                                                   | `src/relay/index.ts`                |

Notes:

- `utils/network.ts` has no libp2p imports but is consumed only by the libp2p provider's
  `connectionGater` (plain-`ws://` gating) — move it (matches the task's "if
  libp2p-specific"). Confirm no other ocap-kernel importer with
  `grep -rn "utils/network" packages/ocap-kernel/src` before deleting; today the only
  importer is `connection-factory.ts`.
- `constants.ts` is shared: the timeout/limit constants consumed by `makeChannelNetlayer`
  already moved to `@metamask/netlayer` in Phase 3; only the libp2p-provider-only
  constants (`RELAY_RECONNECT_BASE_DELAY_MS`, `RELAY_RECONNECT_MAX_DELAY_MS`,
  `RELAY_RECONNECT_MAX_ATTEMPTS`, `SCTP_USER_INITIATED_ABORT`) come to netlayer-libp2p.
  `DEFAULT_MAX_MESSAGE_SIZE_BYTES` stays in `@metamask/netlayer` — `connection-factory.ts`
  already imports it (and the three identity helpers) from there, so those imports need no
  change when the file moves (netlayer-libp2p depends on netlayer).
- The "libp2p error mapper (from Phase 1)" is not a standalone file today: it is the
  module-private `mapLibp2pReadError` + `isIntentionalDisconnect` functions at the top of
  `connection-factory.ts` (covered by `connection-factory.test.ts`, which stubs the
  identity helpers via `vi.mock('@metamask/netlayer', ...)`). Extracting them to
  `error-mapper.ts` (+ a new test) is Phase-4 work; also fold in the
  `MuxerClosedError`/`Dial`/`Transport`/`NO_RESERVATION` name-sniffing that still lives in
  kernel-errors' `isRetryableNetworkError`.

### 2.3 Factory signatures

The contract (from `@metamask/netlayer`, unchanged here):

```ts
export type NetlayerParams<Config> = {
  keySeed: string;
  incarnationId?: string;
  hooks: NetlayerHooks; // { handleMessage, onRemoteGiveUp?, onIncarnationChange? }
  config: Config;
  logger?: Logger;
};
export type NetlayerFactory<Config = Json> = (
  params: NetlayerParams<Config>,
) => Promise<Netlayer>;
```

Browser default (`src/index.ts`):

```ts
import type { NetlayerFactory } from '@metamask/netlayer';
import { assert } from '@metamask/superstruct';
import { Libp2pNetlayerConfigStruct } from './config.ts';
import type { Libp2pNetlayerConfig } from './config.ts';
import { makeLibp2pNetlayer } from './make-libp2p-netlayer.ts';

export const libp2pNetlayerFactory: NetlayerFactory<
  Libp2pNetlayerConfig
> = async ({ keySeed, incarnationId, hooks, config, logger }) => {
  assert(config, Libp2pNetlayerConfigStruct); // validate at the boundary
  return makeLibp2pNetlayer({ keySeed, incarnationId, hooks, config, logger });
};
harden(libp2pNetlayerFactory);

export { Libp2pNetlayerConfigStruct } from './config.ts';
export type { Libp2pNetlayerConfig } from './config.ts';
```

Node (`src/nodejs/index.ts`) — owns direct-transport injection:

```ts
export const nodejsLibp2pNetlayerFactory: NetlayerFactory<
  Libp2pNetlayerConfig
> = async ({ keySeed, incarnationId, hooks, config, logger }) => {
  assert(config, Libp2pNetlayerConfigStruct);
  const directTransports = buildDirectTransports(
    config.directListenAddresses ?? [],
  );
  return makeLibp2pNetlayer({
    keySeed,
    incarnationId,
    hooks,
    config,
    logger,
    directTransports,
  });
};
```

`buildDirectTransports` (`src/nodejs/direct-transports.ts`) is the QUIC/TCP sniffing moved
verbatim from `kernel-node-runtime/src/kernel/PlatformServices.ts`: for each address,
`/quic-v1` → `quic()`, `/tcp/` → `tcp()`, else throw the same "Unsupported direct listen
address" error. It returns `DirectTransport[]` (`{ transport, listenAddresses }`), whose
type also moves to netlayer-libp2p (it is libp2p-shaped: `transport: unknown` +
`listenAddresses: string[]`).

`makeLibp2pNetlayer` is the post-Phase-3 `initTransport` body: construct
`ConnectionFactory` (the `ChannelProvider`) from `config` + `keySeed` (+ `directTransports`
in node), then `return makeChannelNetlayer({ provider, hooks, incarnationId, logger,
...engineOptions })`. Split `config` inside: provider options (`knownRelays`,
`allowedWsHosts`, `maxMessageSizeBytes`, `maxRetryAttempts`, `directTransports`) →
`ConnectionFactory`; engine options (rate/reconnect/timeout fields) →
`makeChannelNetlayer`.

### 2.4 `Libp2pNetlayerConfig` (superstruct)

`src/config.ts`. Every field is JSON-serializable (string/number/array) so the config
survives the browser postMessage boundary. These are the `RemoteCommsOptions` fields that
**move out** of ocap-kernel into per-netlayer config:

```ts
import {
  array,
  integer,
  min,
  object,
  optional,
  string,
  type Infer,
} from '@metamask/superstruct';

export const Libp2pNetlayerConfigStruct = object({
  knownRelays: optional(array(string())), // was RemoteCommsOptions.relays
  maxRetryAttempts: optional(min(integer(), 0)),
  maxConcurrentConnections: optional(min(integer(), 1)),
  maxMessageSizeBytes: optional(min(integer(), 1)),
  cleanupIntervalMs: optional(min(integer(), 0)),
  stalePeerTimeoutMs: optional(min(integer(), 0)),
  maxMessagesPerSecond: optional(min(integer(), 1)),
  maxConnectionAttemptsPerMinute: optional(min(integer(), 1)),
  reconnectionBaseDelayMs: optional(min(integer(), 0)),
  reconnectionMaxDelayMs: optional(min(integer(), 0)),
  handshakeTimeoutMs: optional(min(integer(), 0)),
  writeTimeoutMs: optional(min(integer(), 0)),
  streamInactivityTimeoutMs: optional(min(integer(), 0)),
  allowedWsHosts: optional(array(string())),
  directListenAddresses: optional(array(string())), // nodejs factory only
});
export type Libp2pNetlayerConfig = Infer<typeof Libp2pNetlayerConfigStruct>;
```

Field-source table (`RemoteCommsOptions` → destination):

| `RemoteCommsOptions` field                                                                                                                                                                                                                                                                                                                      | Destination                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `relays`                                                                                                                                                                                                                                                                                                                                        | `Libp2pNetlayerConfig.knownRelays` (renamed; carries the merged pool) |
| `maxRetryAttempts`, `maxConcurrentConnections`, `maxMessageSizeBytes`, `cleanupIntervalMs`, `stalePeerTimeoutMs`, `maxMessagesPerSecond`, `maxConnectionAttemptsPerMinute`, `reconnectionBaseDelayMs`, `reconnectionMaxDelayMs`, `handshakeTimeoutMs`, `writeTimeoutMs`, `streamInactivityTimeoutMs`, `allowedWsHosts`, `directListenAddresses` | `Libp2pNetlayerConfig` (same names)                                   |
| `directTransports` (`@internal`)                                                                                                                                                                                                                                                                                                                | **deleted** — the `./nodejs` factory builds them internally           |
| `mnemonic`, `maxQueue`, `ackTimeoutMs`, `maxUrlRelayHints`, `maxKnownRelays`                                                                                                                                                                                                                                                                    | **stay** on the kernel-level `RemoteCommsOptions` (see §3.3)          |

`maxMessageSizeBytes` is used both by the `ConnectionFactory` (`lpStream` `maxDataLength`)
and by the engine's message-size validator, so it lives in config and the factory forwards
it to both.

### 2.5 Relay server move + kernel-cli repoint

Move `packages/kernel-utils/src/libp2p-relay.ts` → `packages/netlayer-libp2p/src/relay/
index.ts` unchanged (single export `startRelay(logger, { publicIp? })`, plus the
`RELAY_LOCAL_ID = 200` seed and ports `9001`/`9002`). Remove `kernel-utils`'s `./libp2p`
subpath export and its libp2p deps (see §6). `getLibp2pRelayHome` is a plain path helper
in `@metamask/kernel-utils/nodejs` with no libp2p import — **leave it** in kernel-utils
(a Phase 6 rename to drop "libp2p" is optional).

Repoint `packages/kernel-cli/src/commands/relay.ts` line 1:

```ts
// before
import { startRelay } from '@metamask/kernel-utils/libp2p';
// after
import { startRelay } from '@metamask/netlayer-libp2p/relay';
```

`getLibp2pRelayHome` import (line 2, from `@metamask/kernel-utils/nodejs`) is unchanged.
Add `@metamask/netlayer-libp2p` to `kernel-cli`'s `package.json` deps and tsconfig
references.

### 2.6 Temporary ocap-kernel re-export

In `packages/ocap-kernel/src/remotes/platform/transport.ts` (or wherever the thin
`initTransport` lives post-Phase-3), replace the body with a compatibility shim that
adapts the old positional `initTransport(keySeed, options, handler, onRemoteGiveUp,
incarnationId, onIncarnationChange)` signature to the new factory.

**Bundling constraint — the shim must NOT import `@metamask/netlayer-libp2p/nodejs`.**
In 4a, `initTransport` is still called by **both** runtimes, including the browser's
`PlatformServicesServer`; importing the `./nodejs` subpath from ocap-kernel would drag
QUIC/TCP (native, Node-only deps) into the extension's bundle graph. Instead, the shim
imports the **browser-default factory**, and `directTransports` keeps flowing exactly as
today: `NodejsPlatformServices` continues its own QUIC/TCP sniffing until 4b, and
`makeLibp2pNetlayer` accepts the pre-built `directTransports` as an internal (non-`Json`,
documented `@internal`) parameter that the shim forwards. The `./nodejs` factory's
`buildDirectTransports` takes over only in 4b, when `NodejsPlatformServices` stops
calling `initTransport`:

```ts
import { libp2pNetlayerFactoryInternal } from '@metamask/netlayer-libp2p';
// (the internal variant additionally accepts { directTransports }; the public
// libp2pNetlayerFactory does not)
export async function initTransport(
  keySeed,
  options,
  remoteMessageHandler,
  onRemoteGiveUp,
  localIncarnationId,
  onIncarnationChange,
) {
  const {
    relays,
    mnemonic,
    maxQueue,
    ackTimeoutMs,
    maxUrlRelayHints,
    maxKnownRelays,
    directTransports,
    ...rest
  } = options;
  const netlayer = await libp2pNetlayerFactoryInternal({
    keySeed,
    incarnationId: localIncarnationId,
    hooks: {
      handleMessage: remoteMessageHandler,
      onRemoteGiveUp,
      onIncarnationChange,
    },
    config: { ...rest, knownRelays: relays },
    directTransports,
  });
  return {
    sendRemoteMessage: netlayer.sendRemoteMessage,
    stop: netlayer.stop,
    closeConnection: netlayer.closeConnection,
    registerLocationHints: netlayer.registerLocationHints,
    reconnectPeer: netlayer.reconnectPeer,
    resetAllBackoffs: netlayer.resetAllBackoffs,
    getListenAddresses: netlayer.getListenAddresses,
  };
}
```

(The exact mechanism — internal factory variant vs. an extra `makeLibp2pNetlayer`
parameter re-exported for the shim — is an implementation detail; the hard requirements
are: no `./nodejs` import reachable from ocap-kernel, and `directTransports` behavior
unchanged in 4a.)

Keep `export { initTransport } from './remotes/platform/transport.ts';` in
`ocap-kernel/src/index.ts`. This lets `NodejsPlatformServices` and
`PlatformServicesServer` compile untouched in 4a. All the QUIC/TCP dep imports in
`NodejsPlatformServices` remain until 4b.

Add `@metamask/netlayer-libp2p` to `packages/ocap-kernel/package.json` deps and tsconfig
references. **Remove ocap-kernel's direct libp2p deps in 4a** (they are now transitive via
netlayer-libp2p) — see §6.

---

## 3. PR 4b — Flip runtime injection

### 3.1 New `initializeRemoteComms` options-bag signature

`packages/ocap-kernel/src/types.ts` `PlatformServices` (lines ~546–553):

```ts
// before
initializeRemoteComms: (
  keySeed: string,
  options: RemoteCommsOptions,
  remoteMessageHandler: RemoteMessageHandler,
  onRemoteGiveUp?: OnRemoteGiveUp,
  incarnationId?: string,
  onIncarnationChange?: OnIncarnationChange,
) => Promise<void>;

// after
initializeRemoteComms: (params: {
  keySeed: string;
  specifier: NetlayerSpecifier; // { netlayer: string; config: Json }
  hooks: NetlayerHooks; // handleMessage + optional callbacks
  incarnationId?: string;
}) => Promise<void>;
```

`NetlayerSpecifier`, `NetlayerHooks`, `NetlayerRegistry`, `NetlayerFactory` are imported
from `@metamask/netlayer` and re-exported from ocap-kernel (Phase 3 already re-exports
netlayer types). `NetlayerHooks.handleMessage` replaces the old `remoteMessageHandler`;
`onRemoteGiveUp`/`onIncarnationChange` become `hooks.onRemoteGiveUp`/
`hooks.onIncarnationChange`.

### 3.2 `NetlayerRegistry` injection points

**`NodejsPlatformServices` constructor** (`kernel-node-runtime/src/kernel/
PlatformServices.ts`):

```ts
// before
constructor(args: { workerFilePath?: string; logger?: Logger });
// after
constructor(args: { workerFilePath?: string; logger?: Logger; netlayers: NetlayerRegistry });
```

`initializeRemoteComms` looks up `args.netlayers[specifier.netlayer]`, throws a clear
error if absent, then calls `factory({ keySeed, incarnationId, hooks, config:
specifier.config, logger })` and captures the returned `Netlayer`'s methods into the
existing `#sendRemoteMessageFunc` etc. **Delete** the QUIC/TCP sniffing block (lines
262–304) and the `import { quic } from '@chainsafe/libp2p-quic'` / `import { tcp } from
'@libp2p/tcp'` / `@libp2p/webrtc` / `@libp2p/interface` imports — that logic now lives in
`@metamask/netlayer-libp2p/nodejs`. Remove the `initTransport` import.

`make-kernel.ts` builds the registry and passes it (default to libp2p; loopback added for
in-process use):

```ts
import { nodejsLibp2pNetlayerFactory } from '@metamask/netlayer-libp2p/nodejs';
// optionally: import { loopbackNetlayerFactory } from '@metamask/netlayer-loopback';

const platformServicesClient = new NodejsPlatformServices({
  workerFilePath,
  logger: rootLogger.subLogger({ tags: ['platform-services-manager'] }),
  netlayers: args.netlayers ?? { libp2p: nodejsLibp2pNetlayerFactory },
});
```

Add an optional `netlayers?: NetlayerRegistry` to `makeKernel`'s options bag so kernel-cli
/ tests can override (e.g. inject loopback). Add `@metamask/netlayer-libp2p` (and drop the
direct `@chainsafe/libp2p-quic`, `@libp2p/tcp`, `@libp2p/webrtc`, `@libp2p/interface`
deps) in `kernel-node-runtime/package.json`; update tsconfig references.

**`PlatformServicesServer` constructor** (`kernel-browser-runtime/src/
PlatformServicesServer.ts`):

```ts
// before
constructor(stream, makeWorker, logger?);
static make(messageTarget, makeWorker, logger?);
// after
constructor(stream, makeWorker, args: { netlayers: NetlayerRegistry; logger?: Logger });
static make(messageTarget, makeWorker, args: { netlayers: NetlayerRegistry; logger?: Logger });
```

`#initializeRemoteComms(keySeed, specifier, incarnationId)` looks up
`args.netlayers[specifier.netlayer]`, reconstructs `hooks` locally (the same reverse-RPC
handlers it uses today: `#handleRemoteMessage`, `#handleRemoteGiveUp`,
`#handleRemoteIncarnationChange`), calls the factory, and captures the netlayer methods —
including `getListenAddresses`, which the browser server currently drops. Remove the
`import { initTransport } from '@metamask/ocap-kernel'`. Add `@metamask/netlayer-libp2p`
to `kernel-browser-runtime/package.json`.

**`PlatformServicesClient`** (`kernel-browser-runtime/src/PlatformServicesClient.ts`)
constructs no netlayer — it is a pure RPC proxy. Its `initializeRemoteComms` (lines
207–228) changes only its argument shape (see §3.1): it keeps the callbacks locally and
sends `{ keySeed, specifier, incarnationId }` over RPC (config is `Json` — serializable).
`getListenAddresses()` stays hard-coded `[]` (direct transport is Node-only).

### 3.3 Kernel-level `RemoteCommsOptions` after the split

`packages/ocap-kernel/src/remotes/types.ts` — `RemoteCommsOptions` shrinks to the
kernel-owned fields plus the specifier:

```ts
export type RemoteCommsOptions = {
  specifier?: NetlayerSpecifier; // which netlayer + its Json config
  mnemonic?: string; // sensitive; never forwarded to the netlayer
  maxQueue?: number; // per-peer pending-ACK queue (kernel/RemoteHandle)
  ackTimeoutMs?: number; // Ken-protocol retransmit timeout (RemoteManager)
  maxUrlRelayHints?: number; // ocap-URL hint count (identity)
  maxKnownRelays?: number; // persisted hint-pool cap (identity)
};
```

Delete `DirectTransport` and `ConnectionFactoryOptions` from `remotes/types.ts` (both move
to netlayer-libp2p) and drop their re-exports from `ocap-kernel/src/index.ts` (line 31
`DirectTransport`). Keep re-exporting `RemoteIdentity`, `RemoteMessageHandler`,
`SendRemoteMessage`, `StopRemoteComms`, `RemoteCommsOptions`, `OnIncarnationChange`, and
add the netlayer types.

### 3.4 Kernel → platform flow of the specifier (incl. knownRelays injection)

The specifier flows unchanged through `Kernel.initRemoteComms(options)` →
`RemoteManager.initRemoteComms(options)`. `RemoteManager` already extracts `ackTimeoutMs`
and merges `mnemonic`; it now also forwards `options.specifier`. The hint-pool injection
happens in `remotes/kernel/remote-comms.ts` `initRemoteComms`, replacing the old
`relays`/`platformOptions` split (current lines 397–429):

```ts
const { specifier, mnemonic, maxUrlRelayHints, maxKnownRelays } = options;
const netlayer = specifier?.netlayer ?? DEFAULT_NETLAYER; // 'libp2p'
const config = { ...(specifier?.config ?? {}) };

// Bootstrap hints the caller supplied travel in config.knownRelays (opaque strings).
const bootstrapHints = Array.isArray(config.knownRelays)
  ? config.knownRelays
  : [];

const result = await initRemoteIdentity(
  kernelStore,
  { relays: bootstrapHints, mnemonic, maxUrlRelayHints, maxKnownRelays },
  logger,
  keySeed,
);

// Overwrite with the full persisted pool the store now owns.
config.knownRelays = result.knownRelays;

const wakeDetected = kernelStore.detectWake();

await platformServices.initializeRemoteComms({
  keySeed: result.keySeed,
  specifier: { netlayer, config }, // config is Json; mnemonic is NOT in it
  hooks: {
    handleMessage: remoteMessageHandler,
    onRemoteGiveUp,
    onIncarnationChange,
  },
  incarnationId,
});
```

`initRemoteIdentity` keeps its existing signature (`{ relays, mnemonic, maxUrlRelayHints,
maxKnownRelays }` → merges bootstrap relays into the store, returns `knownRelays` =
`kernelStore.getKnownRelayAddresses()`). The store stays libp2p-agnostic — it holds
`RelayEntry` (`{ addr, lastSeen, isBootstrap }`) with `addr` treated as an opaque hint
string. **Design decision:** ocap-kernel knows exactly one netlayer-config key by
convention — `knownRelays: string[]` — which it treats as the opaque hint pool it
persists and re-injects. Document this on `RemoteCommsOptions.specifier` and in the
netlayer-authoring notes. Add `const DEFAULT_NETLAYER = 'libp2p'` so callers that omit a
specifier keep working during the transition.

`OcapURLManager` still calls `identity.addKnownRelays(hints)` on redemption to fold
URL-embedded hints back into the store pool — unchanged.

### 3.5 RPC superstruct changes

**`rpc/platform-services/initializeRemoteComms.ts`** — replace the inlined option fields
with the specifier; `config` uses the `Json` struct from `@metamask/utils` so it crosses
postMessage:

```ts
import { JsonStruct } from '@metamask/utils';
import { object, optional, string } from '@metamask/superstruct';

const initializeRemoteCommsParamsStruct = object({
  keySeed: string(),
  specifier: object({ netlayer: string(), config: JsonStruct }),
  incarnationId: optional(string()),
});
```

Update the hand-written `InitializeRemoteCommsParams` type and the `InitializeRemoteComms`
hook type to `(params: { keySeed; specifier; hooks; incarnationId? }) => Promise<null>`.
The handler no longer copies fields into a `RemoteCommsOptions` bag; it forwards
`{ keySeed, specifier, incarnationId }` and lets `PlatformServicesServer` supply
`hooks`. Note hooks (functions) never cross this RPC — only `keySeed` + `specifier`
(Json) + `incarnationId`.

**`rpc/kernel-control/init-remote-comms.ts`** — this is the CLI/panel → kernel boundary.
Replace the current per-field struct with the specifier + kernel-level options (no
`mnemonic` — sensitive):

```ts
const initRemoteCommsParamsStruct = object({
  specifier: optional(object({ netlayer: string(), config: JsonStruct })),
  maxQueue: optional(min(integer(), 0)),
  ackTimeoutMs: optional(min(integer(), 0)),
  maxUrlRelayHints: optional(min(integer(), 1)),
  maxKnownRelays: optional(min(integer(), 1)),
});
```

The handler continues to `kernel.initRemoteComms(ifDefined(params))`. The derived-type and
`ifDefined` passthrough pattern are unchanged.

Barrels (`rpc/platform-services/index.ts`, `rpc/kernel-control/index.ts`, `rpc/index.ts`)
need no structural change. Update the co-located tests (`initializeRemoteComms.test.ts`,
`init-remote-comms.test.ts`) to the new shapes.

### 3.6 Consumer touchpoints (before/after)

**kernel-cli daemon** (`kernel-cli/src/commands/daemon.ts`, `handleDaemonStart`). The
relay address is still read from `relay.addr`; wrap it in a specifier:

```ts
// before
const initResponse = await sendCommand({
  socketPath,
  method: 'initRemoteComms',
  params: { relays: [relayAddr] },
  timeoutMs: 30_000,
});
// after
const initResponse = await sendCommand({
  socketPath,
  method: 'initRemoteComms',
  params: {
    specifier: { netlayer: 'libp2p', config: { knownRelays: [relayAddr] } },
  },
  timeoutMs: 30_000,
});
```

**extension offscreen** (`extension/src/offscreen.ts`). The hard-coded relay multiaddr
becomes config carried through the query string; the browser libp2p factory is registered
when constructing `PlatformServicesServer`:

```ts
// before
const workerUrlParams = createCommsQueryString({
  relays: ['/ip4/127.0.0.1/tcp/9001/ws/p2p/12D3KooW...WB4uc'],
});
// ...
await PlatformServicesServer.make(worker as PostMessageTarget, (vatId) => makeIframeVatWorker({...}));

// after
import { libp2pNetlayerFactory } from '@metamask/netlayer-libp2p';
const workerUrlParams = createCommsQueryString({
  netlayer: 'libp2p',
  config: {
    knownRelays: [process.env.RELAY_MULTIADDR
      ?? '/ip4/127.0.0.1/tcp/9001/ws/p2p/12D3KooW...WB4uc'],
  },
});
// ...
await PlatformServicesServer.make(
  worker as PostMessageTarget,
  (vatId) => makeIframeVatWorker({...}),
  { netlayers: { libp2p: libp2pNetlayerFactory } },
);
```

The kernel worker reads the specifier from its URL and calls
`kernel.initRemoteComms({ specifier })`. Add `@metamask/netlayer-libp2p` to
`extension/package.json`. (The multiaddr still defaults to the fixed
`RELAY_LOCAL_ID = 200` peer; making it an env override is a small improvement, not
required.)

**`comms-query-string.ts`** (`kernel-browser-runtime/src/utils/`) — becomes a specifier
passthrough instead of a per-field `RemoteCommsOptions` serializer:

```ts
// before: CommsQueryParams = Omit<RemoteCommsOptions, 'directTransports' | 'mnemonic'>
//         + ARRAY_PARAM_NAMES / NUMBER_PARAM_NAMES field-by-field (de)serialization
// after
export type CommsQueryParams = {
  netlayer: string;
  config: Json;
  // plus kernel-level options the worker forwards: maxQueue, ackTimeoutMs,
  // maxUrlRelayHints, maxKnownRelays
};
export function createCommsQueryString(
  params: CommsQueryParams,
): URLSearchParams {
  const search = new URLSearchParams();
  search.set('netlayer', params.netlayer);
  search.set('netlayer-config', JSON.stringify(params.config));
  // set kernel-level numeric params as before
  return search;
}
```

`parseCommsQueryString` / `getCommsParamsFromCurrentLocation` parse `netlayer` +
`JSON.parse(netlayer-config)` (validate with `JsonStruct`). This drops the hand-rolled
array/number param lists.

### 3.7 endoify-node.js resolution (recommended)

**Context.** `packages/kernel-shims/src/endoify-node.js` does
`import './endoify-repair.js'; import '@libp2p/webrtc'; hardenIntrinsics();` — the webrtc
import mutates Node globals and MUST run before lockdown. `@libp2p/webrtc` is a
`peerDependency` of kernel-shims. It is consumed ~19× as a bare side-effect import at the
top of Node entrypoints, plus 7× as a vitest `setupFiles` entry. Browsers use `endoify`
(not `endoify-node`) and do not need the pre-lockdown webrtc import (the file comment says
"Node.js only").

**Recommendation: move the webrtc import into a `@metamask/netlayer-libp2p/nodejs/endoify`
side-effect module, and make kernel-shims' `endoify-node.js` libp2p-free.**

- `kernel-shims/src/endoify-node.js` becomes `import './endoify-repair.js';
hardenIntrinsics();` (a generic Node endoify). Drop the `@libp2p/webrtc` peerDependency
  and the un-bundled-copy special case in `kernel-shims/scripts/bundle.js` (lines 32–35).
- `netlayer-libp2p/src/nodejs/endoify.ts` = `import '@libp2p/webrtc'; import
'@metamask/kernel-shims/endoify-node';` — imports webrtc first (source order is honored
  for side-effect imports), then runs the generic repair+harden.
- Consumers that use the libp2p netlayer in Node repoint their side-effect import from
  `@metamask/kernel-shims/endoify-node` to `@metamask/netlayer-libp2p/nodejs/endoify`
  (a one-line change, same ergonomics as today). Consumers that do **not** use libp2p
  (loopback/no-remote-comms) keep `@metamask/kernel-shims/endoify-node`.

**Why this over the alternatives.** A separate "preamble" module
(`import '@libp2p/webrtc'` alone, imported before endoify-node) works but forces every
consumer to add two import lines in the right order — more churn and a new ordering
foot-gun. Keeping a libp2p-flavored variant inside kernel-shims keeps `@libp2p/webrtc` as
a dep of the package everything depends on, defeating the colocation goal. The
re-export module gives one-line consumer edits **and** puts libp2p entirely inside
netlayer-libp2p (netlayer-libp2p already depends on kernel-shims for this).

**Consumers to repoint** (all use libp2p remote comms; verify each before editing):
runtime bare imports in `kernel-node-runtime/src/vat/vat-worker.ts`, `kernel-cli/src/
app.ts`, `kernel-cli/src/commands/daemon-entry.ts`, the `evm-wallet-experiment/docker/*`
and `test/{integration,e2e}/*` runners; vitest `setupFiles` in `kernel-node-runtime/
vitest.config.ts` + `vitest.config.e2e.ts`, `kernel-cli/vitest.e2e.config.ts`,
`ocap-kernel/vitest.config.ts`, `kernel-browser-runtime/vitest.integration.config.ts`,
`kernel-test/vitest.config.ts`, `evm-wallet-experiment/vitest.config.integration.ts`. Any
consumer that turns out to use only loopback stays on `kernel-shims/endoify-node`. Update
the root `package.json` `dependenciesMeta` entry (line ~129,
`@metamask/kernel-cli>@metamask/kernel-shims>@libp2p/webrtc>node-datachannel`) to reflect
the new dependency path through netlayer-libp2p.

### 3.8 Final dependency removals from ocap-kernel

After 4b, remove from `packages/ocap-kernel/package.json` the temporary
`@metamask/netlayer-libp2p` dependency (runtimes now depend on it directly; ocap-kernel no
longer re-exports `initTransport`). Delete
`ocap-kernel/src/remotes/platform/transport.ts`'s compatibility shim and the
`export { initTransport }` line in `ocap-kernel/src/index.ts`. Confirm ocap-kernel has
zero libp2p-family deps (§6) and update `ocap-kernel/tsconfig.json` +
`tsconfig.build.json` to drop the `@metamask/netlayer-libp2p` reference.

---

## 4. Test plan

- **Moves with the code (4a):** `connection-factory.test.ts`, `lp-framing.test.ts`,
  `multiaddr.test.ts`, `network.test.ts`, and the libp2p error-mapper test move to
  `@metamask/netlayer-libp2p` intact (only import paths change). Add `config.test.ts`
  (superstruct accept/reject of `Libp2pNetlayerConfig`) and
  `nodejs/direct-transports.test.ts` (QUIC vs TCP sniffing, the "Unsupported direct listen
  address" throw). Add `relay/index.test.ts` (moved relay-server coverage). Add a
  factory-level test that `libp2pNetlayerFactory` / `nodejsLibp2pNetlayerFactory` return a
  `Netlayer` and reject an invalid config.
- **RPC struct tests (4b):** rewrite `rpc/platform-services/initializeRemoteComms.test.ts`
  and `rpc/kernel-control/init-remote-comms.test.ts` for the specifier shape; assert a
  non-Json `config` is rejected by `JsonStruct` and that hooks never appear in the RPC
  params. Update `rpc/index.test.ts` only if export surface assertions reference the old
  fields.
- **PlatformServices tests (4b):** `NodejsPlatformServices` and `PlatformServicesServer`
  tests inject a fake `NetlayerRegistry` (a factory returning a stub `Netlayer`) and
  assert the specifier's `netlayer` is looked up, `config` is passed through, an unknown
  netlayer name throws, and `getListenAddresses` is now captured on the browser server.
  The loopback netlayer (`@metamask/netlayer-loopback`) is the natural registry entry for
  these — no libp2p in unit tests.
- **Kernel flow (4b):** `remotes/kernel/remote-comms.test.ts` asserts bootstrap
  `config.knownRelays` are merged into the store and that the value passed to
  `platformServices.initializeRemoteComms` is the full persisted pool, and that `mnemonic`
  never appears in `specifier.config`.
- **Integration — `kernel-test/src/remote-comms.test.ts`:** its `DirectNetworkService`
  fake implements `PlatformServices`; update its `initializeRemoteComms` to the new
  options-bag shape and drop the `@libp2p/crypto`/`@libp2p/peer-id` imports (post-Phase-2
  the neutral peerId helper from `@metamask/netlayer` derives the id — the DELTA to fix
  here). `utils.ts` `makeKernel` gains an optional `netlayers` passthrough;
  `NodejsPlatformServices` construction there passes a registry (loopback for the fake,
  libp2p by default). Loopback-based tests are unaffected.
- **Extension e2e:** run the extension example end-to-end (offscreen registers
  `libp2pNetlayerFactory`, specifier carries the relay multiaddr through the query string)
  to confirm ocap-URL redemption and message delivery across the new injection path.

---

## 5. Step-by-step execution order

### PR 4a (each step compiles)

1. `yarn create-package --name netlayer-libp2p --description "..."`; adjust
   `package.json` to `@metamask/netlayer-libp2p` (publish config, exports map §2.1),
   tsconfig references (`@metamask/netlayer`, kernel-errors, kernel-utils, logger,
   kernel-shims). Add to root `tsconfig.json` + `tsconfig.build.json` references.
2. Move `connection-factory.ts`, error mapper, `lp-framing.test.ts`, provider-only
   `constants.ts`, `utils/multiaddr.ts`, `utils/network.ts` (+ their tests) into the new
   package; fix imports to pull shared machinery/constants from `@metamask/netlayer`. Add
   `config.ts` (`Libp2pNetlayerConfigStruct`) and `make-libp2p-netlayer.ts`.
3. Add `src/nodejs/direct-transports.ts` (QUIC/TCP sniffing) + `src/nodejs/index.ts`
   (`nodejsLibp2pNetlayerFactory`) and `src/index.ts` (`libp2pNetlayerFactory`).
4. Move `kernel-utils/src/libp2p-relay.ts` → `src/relay/index.ts`; remove kernel-utils's
   `./libp2p` export + libp2p deps; repoint `kernel-cli/src/commands/relay.ts`; add
   `@metamask/netlayer-libp2p` to kernel-cli deps + references.
5. In ocap-kernel, replace the thin `initTransport` body with the compatibility shim
   (§2.6) delegating to `nodejsLibp2pNetlayerFactory`; keep the `initTransport` re-export.
   Add `@metamask/netlayer-libp2p` dep + references; **remove ocap-kernel's direct libp2p
   deps** (§6). Delete the now-empty `remotes/platform/` files that moved.
6. `yarn install`, `yarn constraints --fix`, `yarn lint:fix`, `yarn build`,
   `yarn test:dev:quiet`. Runtimes (`NodejsPlatformServices`, `PlatformServicesServer`)
   are untouched — CI green via the re-export.

### PR 4b (each step compiles)

1. `@metamask/netlayer` types are already re-exported; add
   `DEFAULT_NETLAYER = 'libp2p'` in ocap-kernel. Shrink `RemoteCommsOptions` (§3.3),
   delete `DirectTransport`/`ConnectionFactoryOptions` + their re-exports.
2. Change the `PlatformServices.initializeRemoteComms` type to the options bag (§3.1) and
   update `remotes/kernel/remote-comms.ts` for specifier + `config.knownRelays` injection
   (§3.4). This breaks the two runtime impls' compile — fix them in the same commit.
3. Update `NodejsPlatformServices` (registry ctor, delete QUIC/TCP block + libp2p
   imports); `make-kernel.ts` builds the registry; `makeKernel` gains `netlayers?`.
4. Update `PlatformServicesServer` (registry ctor, capture `getListenAddresses`, drop
   `initTransport`) and `PlatformServicesClient` (new arg shape; send
   `{ keySeed, specifier, incarnationId }`).
5. Update RPC structs + their tests (§3.5).
6. Update consumers: daemon.ts, offscreen.ts (+register factory, +dep),
   comms-query-string.ts (§3.6).
7. endoify resolution (§3.7): add `netlayer-libp2p/src/nodejs/endoify.ts`; make
   kernel-shims' `endoify-node.js` libp2p-free (drop peer dep + bundle special-case);
   repoint consumers.
8. Remove the `initTransport` re-export + shim + the `@metamask/netlayer-libp2p` dep from
   ocap-kernel; drop its tsconfig reference (§3.8).
9. `yarn install`, `yarn constraints --fix`, `yarn dedupe`, `yarn lint:fix`,
   `yarn build`, `yarn test:dev:quiet`, affected `test:integration`, extension e2e.

---

## 6. Verification

Per-PR commands (root, turbo-cached where applicable):

```bash
yarn lint:fix
yarn build
yarn test:dev:quiet --coverage=true
yarn constraints            # workspace dependency consistency
# kernel-test is @ocap/kernel-test; its integration tests run under the normal test
# runner (no separate test:integration script as of writing). Confirm script names for
# kernel-node-runtime's integration/e2e suites before running.
yarn workspace @ocap/kernel-test test:dev:quiet
yarn workspace @metamask/kernel-node-runtime test:integration   # confirm script name
```

Extension e2e (4b):

```bash
yarn workspace @ocap/extension test:e2e
```

Manual `ocap relay` smoke test (4b): start the relay, then run the two-kernel Node
scenario to confirm ocap-URL redemption + delivery across the new injection path:

```bash
ocap relay start
yarn workspace @ocap/kernel-test test:dev:quiet -- remote-comms
ocap relay stop
```

Final zero-libp2p check (must be empty after 4b). Note the checks deliberately cover the
**libp2p family only** — plain `multiformats` is _not_ libp2p and stays (see below):

```bash
node -e "const p=require('./packages/ocap-kernel/package.json');
  const d={...p.dependencies,...p.devDependencies};
  console.log(Object.keys(d).filter(k=>/@libp2p|chainsafe|@multiformats|^libp2p$|netlayer-libp2p/.test(k)))"
# → []
grep -rn "@libp2p\|@chainsafe\|@multiformats\|from 'libp2p'" packages/ocap-kernel/src
# → no matches
```

libp2p-family deps to remove from `packages/ocap-kernel/package.json` (exact list from the
current file; some — e.g. `@libp2p/peer-id` — may already be gone after Phases 2–3, remove
whatever remains):

`@chainsafe/libp2p-noise ^17.0.0`, `@chainsafe/libp2p-yamux 8.0.1`,
`@libp2p/bootstrap 12.0.15`, `@libp2p/circuit-relay-v2 4.1.7`, `@libp2p/crypto 5.1.14`,
`@libp2p/identify 4.0.14`, `@libp2p/interface 3.1.1`, `@libp2p/peer-id 6.0.5`,
`@libp2p/ping 3.0.14`, `@libp2p/utils 7.0.14`, `@libp2p/webrtc 6.0.15`,
`@libp2p/websockets 10.1.7`, `@libp2p/webtransport 6.0.16`,
`@multiformats/multiaddr ^13.0.1`, `libp2p 3.1.7`.
**Keep** `@scure/bip39 ^2.0.1` (mnemonic → seed, kernel identity) and
`multiformats ^13.3.6` — per the Phase 2 plan, `base58btc` remains the neutral encoding
used by `remote-comms.ts` for the oid ciphertext and (via the identity helpers) the
neutral peerId, so it stays past Phase 4. `uint8arrays ^5.1.0`: verify actual imports in
ocap-kernel before removing — the engine/handshake usage moves to `@metamask/netlayer` in
Phase 3, but `remote-comms.ts` may still use it; remove only if unimported.

kernel-utils loses (moved to netlayer-libp2p/relay): `@chainsafe/libp2p-noise`,
`@chainsafe/libp2p-yamux`, `@libp2p/autonat`, `@libp2p/circuit-relay-v2`,
`@libp2p/crypto`, `@libp2p/identify`, `@libp2p/interface`, `@libp2p/ping`, `@libp2p/tcp`,
`@libp2p/websockets`, `@multiformats/multiaddr`, `libp2p`, and the `./libp2p` export.

kernel-node-runtime loses direct `@chainsafe/libp2p-quic`, `@libp2p/tcp`,
`@libp2p/webrtc`, `@libp2p/interface` (now transitive via `@metamask/netlayer-libp2p/
nodejs`), gains `@metamask/netlayer-libp2p`. kernel-browser-runtime and extension gain
`@metamask/netlayer-libp2p`. kernel-shims loses the `@libp2p/webrtc` peerDependency.

Update `references` in root `tsconfig.json` + `tsconfig.build.json` (add
`netlayer-libp2p`), and in the tsconfigs of ocap-kernel (add then remove),
kernel-node-runtime, kernel-browser-runtime, kernel-cli, extension (add).

---

## 7. Risks

- **Extension bundle size/format.** libp2p is already in the extension's transitive graph
  via ocap-kernel today, so the net bundled weight should be roughly unchanged — but 4b
  makes `@metamask/netlayer-libp2p` an explicit extension dep and moves the registration
  into `offscreen.ts`. Verify the bundle still builds and tree-shakes (`webRTC`,
  `webTransport`, `circuitRelayTransport` are all reachable through the browser factory, so
  none should be dropped) and compare bundle size before/after. Watch for ESM/CJS
  interop: netlayer-libp2p must ship both conditions (mirror kernel-utils), because the
  extension and Node consumers resolve different ones.
- **postMessage boundary.** `specifier.config` must be `Json`-serializable — validated by
  `JsonStruct` in both RPC structs and in `comms-query-string`. `Libp2pNetlayerConfig` is
  deliberately all strings/numbers/arrays. A future netlayer that wants a non-Json config
  (functions, `Uint8Array`) cannot cross the browser boundary — call this out in the
  netlayer-authoring doc (Phase 6).
- **Hidden libp2p peerId-format assumptions.** Phase 2 neutralized identity, but sweep for
  code that still assumes the base58 `12D3KooW…` shape or `/p2p/<id>` multiaddr suffixes:
  the hard-coded relay peer in `offscreen.ts`, `getLastPeerId`/`candidateAddressStrings`
  in the moved `connection-factory.ts` (fine — that is libp2p's own boundary), and
  `kernel-test/src/remote-comms.test.ts` deriving the peerId via `@libp2p/peer-id` (must
  switch to the neutral helper). Anything in the kernel core or store that pattern-matches
  a peerId string is a bug.
- **`initTransport` shim fidelity (4a).** The compatibility shim maps the old positional
  signature onto the factory. Two hard requirements (§2.6): the shim must not make
  `@metamask/netlayer-libp2p/nodejs` reachable from ocap-kernel (browser bundling), and
  `directTransports` must keep flowing unchanged from `NodejsPlatformServices`'s existing
  sniffing through the shim to the provider (the `./nodejs` factory's own
  `buildDirectTransports` takes over only in 4b). Verify the browser path (no direct
  transports) is unaffected.
- **endoify ordering / consumer sweep (3.7).** Missing a consumer that needs the
  pre-lockdown webrtc import produces a silent lockdown failure at runtime, not a compile
  error. Grep-verify every `endoify-node` importer and decide libp2p-vs-not per consumer;
  when unsure, repoint to `@metamask/netlayer-libp2p/nodejs/endoify` (safe superset).

---

## 8. Estimate

- **PR 4a (extract package, re-export shim):** ~2.5–3 days. Mostly mechanical moves +
  scaffolding; risk concentrated in the shim signature adaptation and the relay/endoify
  packaging.
- **PR 4b (flip injection):** ~2.5–3 days. Touches two runtimes, three RPC/consumer
  boundaries, the extension, and the endoify consumer sweep; risk concentrated in the
  browser postMessage boundary and the endoify migration.
- **Total Phase 4:** ~5–6 dev-days, matching the master-plan budget.
