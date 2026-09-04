# Phase 6 — Cleanup + Docs (Netlayer abstraction)

This is the final phase of the 6-phase effort to introduce a pluggable "netlayer"
abstraction (see the master plan for full context and issue
[#968](https://github.com/MetaMask/ocap-kernel/issues/968)). Phases 1–5 are assumed
complete: the packages `@metamask/netlayer`, `@metamask/netlayer-loopback`,
`@metamask/netlayer-libp2p`, and `@metamask/netlayer-websocket` exist; `@metamask/ocap-kernel`
is libp2p-free; kernel identity is neutral (base58btc-encoded raw Ed25519 pubkey); and the
runtimes accept a `NetlayerRegistry` / `NetlayerSpecifier`.

Phase 6 contains no functional changes. It is a terminology rename, glossary and changelog
maintenance, and documentation. An engineer with no prior context should be able to execute
it from this document.

> **Revision required before execution.** This plan was written before Phases 1–5 landed.
> Symbol names, file locations, and line numbers referencing prior-phase output are
> indicative — reconcile against the merged code (especially: where the identity helpers
> ended up, whether `relays` still exists on any kernel surface, and the final shape of
> `RemoteCommsOptions`) and update this document first.

---

## 1. Objective and non-goals

### Objective

1. Rename the libp2p-flavored term **"relay"** to the netlayer-neutral term **"location
   hint"** across the kernel-generic surfaces where the concept is no longer libp2p-specific
   (store, `RemoteIdentity`, kernel-level config options).
2. Add glossary entries for the vocabulary the abstraction introduces: netlayer, location
   hint, neutral peer id, loopback netlayer, hub-and-spoke.
3. Update changelogs for every package with consumer-facing changes across Phases 1–5
   (the rename in this phase is folded in).
4. Write a new architecture doc, `docs/writing-a-netlayer.md`, describing the
   `Netlayer` / `ChannelProvider` contracts, delivery semantics, the incarnation handshake,
   identity requirements, and testing guidance.
5. Correct existing docs that assert libp2p specifics (transport guarantees, `peerId`
   derivation, relay-based setup examples).
6. Add a short note recording iroh as the intended next netlayer, pointing at #968.

### Non-goals

- **No functional/behavioral changes.** The only code that changes is symbol names, the
  persisted KV key string, config option names, and the tests/docs that reference them.
- **No iroh implementation.** `@metamask/netlayer-iroh` is explicitly out of scope; Phase 6
  only records the intent.
- **No rename inside `@metamask/netlayer-libp2p`.** libp2p relays are a real, libp2p-specific
  concept and keep the "relay" name there (relay server, `/p2p-circuit`, bootstrap relay
  config, relay-connectivity tests).
- **No changelog cutting / version bumps.** Entries go under `## [Unreleased]` only.

---

## 2. Rename scope recommendation

### Recommendation: **GO**, scoped to the kernel-generic surface only.

The concept the kernel persists and embeds in `ocap:` URLs is "an opaque, netlayer-specific
string that helps re-locate a peer." That is a **location hint**. It is only called a "relay"
because libp2p was the only netlayer. Now that the kernel is libp2p-free and future netlayers
(iroh, WebSocket) have their own notions of reachability, leaving `knownRelays` /
`RelayEntry` / `addKnownRelays` in the kernel core permanently bakes libp2p vocabulary into a
netlayer-agnostic layer — exactly the coupling this whole effort removes. The rename is
well-bounded (one store method file, one type, three config options, one `RemoteIdentity`
method, and their tests) and compatibility is allowed to break with no migration, so the
churn is proportionate. Note it is disproportionate only in the _test files_, where "relay"
appears hundreds of times; most of those occurrences are in libp2p-specific tests
(`connection-factory.test.ts`, `remote-comms.test.ts`) that legitimately keep the term. Do
not chase the raw grep count — rename by symbol, not by string.

Because Phase 4 already establishes that persisted keys, the `ocap:` URL format, and config
shapes may change **without migration**, this rename also lets us **delete** the legacy
`string[] → RelayEntry[]` migration path in `store/methods/relay.ts` rather than port it.

### Rename surface (kernel-generic — DO rename)

Terminology mapping applied throughout:

| Old                             | New                       |
| ------------------------------- | ------------------------- |
| relay (the kernel-side concept) | location hint             |
| `RelayEntry`                    | `LocationHintEntry`       |
| `RelayEntryStruct`              | `LocationHintEntryStruct` |
| `knownRelays` (KV key)          | `knownLocationHints`      |
| `maxKnownRelays`                | `maxKnownLocationHints`   |
| `maxUrlRelayHints`              | `maxUrlLocationHints`     |
| `addKnownRelays`                | `addKnownLocationHints`   |

**Files and symbols:**

- `packages/ocap-kernel/src/store/methods/relay.ts` → rename file to `location-hints.ts`.
  - `getRelayMethods` → `getLocationHintMethods`
  - `getRelayEntries` → `getLocationHintEntries`
  - `setRelayEntries` → `setLocationHintEntries`
  - `getKnownRelayAddresses` → `getKnownLocationHintAddresses`
  - KV key `'knownRelays'` → `'knownLocationHints'` (breaking; no migration)
  - **Delete** `parseStoredJSON`'s legacy `string[]` migration branch and its log line;
    keep only the `LocationHintEntry[]` validation path.
  - The remote-identity KV accessors (`getRemoteIdentityValue*`, `setRemoteIdentityValue`)
    stay as-is — `peerId`/`keySeed`/`ocapURLKey` are unaffected. Consider moving them to a
    separately-named methods file only if trivial; otherwise leave in place and just rename
    the location-hint parts. (These accessors sharing a file with the hint pool is incidental;
    do not expand scope to split them.)
- `packages/ocap-kernel/src/store/methods/relay.test.ts` → rename to `location-hints.test.ts`;
  update assertions and the deleted-migration test cases.
- `packages/ocap-kernel/src/store/types.ts`
  - `RelayEntry` → `LocationHintEntry`; `RelayEntryStruct` → `LocationHintEntryStruct`;
    update doc comments (`Relay multiaddr string.` → `Netlayer-specific opaque location-hint
string.`, etc.). Note the `addr` field name can stay `addr` (still an address-like hint)
    or become `hint`; **recommend keeping `addr`** to minimize churn — it is already opaque.
- `packages/ocap-kernel/src/store/index.ts`
  - import + `getRelayMethods(...)` call + `const relay =` binding + `...relay` spread +
    `export type { RelayEntry }` → the new names.
- `packages/ocap-kernel/src/store/index.test.ts` — update references.
- `packages/ocap-kernel/src/remotes/types.ts`
  - `RemoteIdentity.addKnownRelays` → `addKnownLocationHints`.
  - `RemoteCommsOptions.maxKnownRelays` → `maxKnownLocationHints`;
    `RemoteCommsOptions.maxUrlRelayHints` → `maxUrlLocationHints`; update the doc comments to
    drop "relay" phrasing ("Maximum number of location hints embedded in a single OCAP URL",
    "Maximum number of location-hint entries stored in the kernel's hint pool").
  - `RemoteCommsOptions.relays` — **leave named `relays`** if it is still the libp2p bootstrap
    set consumed by the libp2p netlayer config; per the master plan (Phase 4b) most of
    `RemoteCommsOptions` becomes per-netlayer config, so `relays` belongs to the libp2p
    netlayer's config surface and keeps its name. Confirm during execution where `relays` now
    lives; if it has already moved into `@metamask/netlayer-libp2p` config, there is nothing to
    do here.
  - `ConnectionFactoryOptions.knownRelays` lives in / moved to `@metamask/netlayer-libp2p`
    (libp2p-specific) — **do not rename**.
- `packages/ocap-kernel/src/rpc/kernel-control/init-remote-comms.ts`
  - struct fields `maxUrlRelayHints` / `maxKnownRelays` → `maxUrlLocationHints` /
    `maxKnownLocationHints`. (`relays: optional(array(string()))` stays if it is still the
    libp2p bootstrap option; otherwise it has already moved.)
- `packages/ocap-kernel/src/rpc/kernel-control/init-remote-comms.test.ts` — update.
- Any callers of the renamed store methods / `addKnownRelays` (grep after renaming):
  `remotes/kernel/remote-comms.ts`, `remotes/kernel/RemoteManager.ts`, `OcapURLManager.ts`,
  and their tests. Follow the compiler.

**Persisted KV key:** `knownRelays` → `knownLocationHints`. Breaking; existing kernels lose
their learned hint pool on upgrade (acceptable per fixed decision #3 — break freely).

**UI touchpoints:** effectively none. `packages/kernel-ui/src/components/RemoteComms.tsx`
renders only the peer id and exported ocap URLs; it does not display relay/hint strings. No
user-facing string changes are required. (The component name `RemoteComms` is unrelated and
stays.)

### What stays "relay" (libp2p-specific — DO NOT rename)

- Everything in `@metamask/netlayer-libp2p`, including the relay server (moved from
  `kernel-utils/src/libp2p-relay.ts` to the `./relay` subpath), `getLibp2pRelayHome`, the
  `/p2p-circuit` multiaddr handling, and the libp2p bootstrap `relays` config.
- `packages/kernel-cli/src/commands/relay.ts` and `relay.test.ts` — the `ocap relay` command
  operates a libp2p relay server; keep the name. (It now imports from
  `@metamask/netlayer-libp2p/relay` rather than `@metamask/kernel-utils/libp2p`.)
- `packages/kernel-node-runtime/test/e2e/relay-connectivity.test.ts` and
  `libp2p-v3-features.test.ts` — libp2p transport tests; keep.
- libp2p error-mapper and multiaddr utilities.

---

## 3. Glossary entries (drafts)

Add these to `docs/glossary.md`. Placement: create a new `## Networking` section (after
`## Concepts`, before `## Abbreviations`) to group the netlayer vocabulary, or interleave
alphabetically within `## Concepts` — recommend the grouped `## Networking` section for
discoverability. Use the existing entry style (`### term`, cross-links via `[term](#term)`,
implementation links via `[term](../path/to/file.ts)`). Draft definitions:

### netlayer

A pluggable network-transport backend for the [kernel](#kernel)'s remote communications. A
netlayer moves opaque message strings between kernels and authenticates each peer as the
[neutral peer id](#neutral-peer-id) derived from the kernel's key seed. The kernel core is
netlayer-agnostic: it consumes the `Netlayer` contract and handles the [Ken
protocol](../docs/ken-protocol-assessment.md) (sequencing, acknowledgement, retransmission,
deduplication) itself, so a netlayer need only provide best-effort ordered delivery per live
connection. Netlayers ship as separate packages — `@metamask/netlayer` (contracts + shared
machinery), `@metamask/netlayer-loopback`, `@metamask/netlayer-libp2p`,
`@metamask/netlayer-websocket` — and are supplied to a runtime via a `NetlayerRegistry` and
selected per kernel with a `NetlayerSpecifier`. See [writing a
netlayer](../docs/writing-a-netlayer.md).

### location hint

A netlayer-specific, opaque string that helps a netlayer re-locate and reconnect to a peer —
for example a libp2p relay multiaddr. The kernel treats location hints as opaque: it persists
a bounded pool of them per peer, embeds a few in issued [ocap URLs](#ocap-url) to aid
redemption, and hands them back to the netlayer on reconnect, but never parses them. Formerly
called "relays" in kernel-facing surfaces. See the [location-hint store
methods](../packages/ocap-kernel/src/store/methods/location-hints.ts).

### neutral peer id

The netlayer-independent identifier for a kernel: the base58btc [multibase] encoding of the
raw Ed25519 public key derived from the kernel's key seed. The kernel uses the neutral peer id
for all persisted remote state and as the host of the [ocap URL](#ocap-url); each netlayer
converts it to and from its own native identity at its boundary (libp2p `PeerId`, iroh
`NodeId` — both wrap the same raw Ed25519 key). A netlayer **must** authenticate every peer as
the neutral peer id derived from that peer's key seed. See the identity helpers in
`@metamask/netlayer` (moved there in Phase 3 from ocap-kernel; link the actual file, e.g.
`../packages/netlayer/src/identity.ts`, after verifying the landed location).

### loopback netlayer

An in-process [netlayer](#netlayer) that connects kernels running in the same JavaScript
realm through an in-memory hub keyed by [neutral peer id](#neutral-peer-id), with no real
transport. It is the reference netlayer implementation: used as a test fake in place of
hand-rolled `PlatformServices` mocks and for embedded multi-kernel setups. Because it exercises
the full `Netlayer` contract (including the [incarnation handshake](#incarnation-handshake)) it
is the recommended baseline when writing or testing a new netlayer. See
`@metamask/netlayer-loopback`.

### hub-and-spoke

A network topology in which kernels ("spokes") connect to a central endpoint ("hub") rather
than to one another. The hub's role differs by netlayer: a libp2p relay is a _forwarding_
hub (spokes reach each other through it), whereas the plain-WebSocket server netlayer's hub
is a _kernel endpoint_ — spokes talk to the hub kernel itself, and spoke↔spoke traffic is
deliberately unsupported (see the `@metamask/netlayer-websocket` README). The
[loopback netlayer](#loopback-netlayer)'s in-memory hub is the degenerate single-process
case. Contrast with direct/peer-to-peer connections (e.g. libp2p QUIC/TCP, or a WebRTC
upgrade), where peers dial each other after an initial rendezvous.

### incarnation handshake

The exchange a [netlayer](#netlayer) performs when a connection is established, in which each
side reports its `incarnationId` — a value that changes when a kernel restarts. Reporting it on
every successful handshake (not only on change) lets the receiving kernel detect a peer restart
even after its own in-memory peer state was lost, and suppress stale in-flight messages. The
handshake message is versioned (`v` field). See the shared `handshake.ts` in
`@metamask/netlayer` and the `onIncarnationChange` hook in
[`remotes/types.ts`](../packages/ocap-kernel/src/remotes/types.ts).

> Note: `[multibase]` and `[ocap URL]` above should be either linked to their own glossary
> entries if added, or de-linked. `ocap URL` does not currently have a glossary entry;
> consider adding a short one, or render it as plain text. Do not leave dangling anchors.

---

## 4. New doc: `docs/writing-a-netlayer.md` (section outline)

Audience: an engineer implementing a new netlayer package. State the contracts precisely.

1. **Overview**

   - What a netlayer is and where it sits: kernel core ↔ `Netlayer` ↔ underlying transport.
   - The kernel owns the [Ken protocol](./ken-protocol-assessment.md); a netlayer is "dumb
     pipe + identity + reconnection." Enumerate what the kernel does NOT delegate: sequencing,
     ACK, retransmission, dedup, ocap-URL issue/redeem, hint-pool persistence.
   - Two implementation paths: (a) implement `Netlayer` directly (loopback does this); (b) for
     any real bytestream transport, implement `ChannelProvider` + `NetworkChannel` and let
     `makeChannelNetlayer` supply the engine (handshake, reconnection, backoff, rate limiting,
     validators). Recommend path (b) for anything connection-oriented.

2. **The `Netlayer` contract** — reproduce the type and specify each method:

   - `peerId` — the [neutral peer id](../docs/glossary.md#neutral-peer-id); must equal the
     base58btc-multibase encoding of the raw Ed25519 pubkey derived from `keySeed`.
   - `sendRemoteMessage(to, message)` — best-effort; resolves when handed to the transport, not
     on delivery. May reject on hard failures (peer unreachable, size limit).
   - `closeConnection`, `registerLocationHints`, `reconnectPeer` (may be no-op),
     `resetAllBackoffs` (may be no-op), `getListenAddresses` (netlayer-specific hint strings),
     `stop`.

3. **The `ChannelProvider` / `NetworkChannel` seam**

   - Reproduce both types. `NetworkChannel.read()` throws **mapped kernel-errors** (see §9);
     `write()` sends one framed message; `setInactivityTimeout` may be a no-op.
   - `ChannelProvider.dial(peerId, hints)`, `onInboundChannel`, `onPeerDisconnect`,
     `closeChannel`, `getListenAddresses`, `stop`.
   - `makeChannelNetlayer({ provider, hooks, options, keySeed, incarnationId, logger })` →
     `Netlayer`. What the engine handles for you.

4. **Hooks (`NetlayerHooks`)**

   - `handleMessage(from, message) → Promise<string | null>` — deliver an inbound message to
     the kernel; the returned string (if any) is a piggyback reply to send back.
   - `onRemoteGiveUp?(peerId)` — reconnection exhausted.
   - `onIncarnationChange?(peerId, observedIncarnation) → Promise<boolean>` — see §7.

5. **Delivery-semantics contract** (state precisely)

   - Guarantee required: **best-effort, ordered per live connection.** Messages written to one
     live connection are delivered in order or not at all; you MUST NOT reorder within a
     connection.
   - You MAY drop messages on disconnect/reconnect. You need NOT persist messages, dedup, or
     guarantee anything across connection boundaries.
   - The kernel's Ken protocol tolerates loss and duplication: it retransmits from its own
     sender log until ACKed and drops duplicates by sequence number on receive. Do not
     reimplement any of this in the netlayer.
   - Corollary: a correct netlayer can be quite lossy and still be correct; it just must never
     silently corrupt order on a single connection.

6. **Identity requirements**

   - Must authenticate as the Ed25519 key derived from `keySeed` (link the "amateur
     cryptography" caveat that already lives in `remote-comms.ts`).
   - Neutral peer id encoding recipe: derive raw Ed25519 pubkey from seed → base58btc multibase.
   - Peer authentication: the netlayer must prove the remote controls the private key for the
     neutral peer id it claims (libp2p noise does this for free; the WebSocket netlayer uses a
     challenge-signature handshake — cite it as the example for transports without built-in
     auth).

7. **The incarnation handshake**

   - Purpose: detect peer restarts across receiver-side state loss.
   - Mechanism: versioned handshake message (`v` field) carrying `incarnationId`; fired on
     every successful handshake. Engine calls `onIncarnationChange`; the kernel compares against
     persisted state and returns whether a real restart occurred; the engine uses the verdict
     to suppress stale outbound messages on that connection.
   - `makeChannelNetlayer` users get this from shared `handshake.ts`. A hand-written `Netlayer`
     (like loopback) must call `onIncarnationChange` itself.

8. **Config and registration**

   - Netlayer-specific config is superstruct-validated by the impl; it must be `Json` because
     `NetlayerSpecifier.config` crosses the browser `postMessage` boundary.
   - `NetlayerFactory`, `NetlayerRegistry` (map of name → factory), `NetlayerSpecifier`
     (`{ netlayer, config }`). How a runtime wires the registry and how a kernel selects one.

9. **Error mapping and retryability**

   - Map raw transport errors to the neutral kernel-error classes in `@metamask/kernel-errors`:
     `ChannelResetError`, `IntentionalDisconnectError`, `MessageTooLargeError`.
   - `isRetryableNetworkError` acts on the neutral taxonomy only; any transport-specific
     name-sniffing lives in the netlayer's own error mapper. Every code path that could throw
     from `read`/`write`/`dial` must map completely — an unmapped error silently changes
     reconnection behavior.

10. **Location hints**

    - Opaque strings, netlayer-defined. `registerLocationHints`, `getListenAddresses`,
      `dial(peerId, hints)`. The kernel persists and re-supplies them but never interprets them.

11. **Testing guidance**

    - Use the [loopback netlayer](../docs/glossary.md#loopback-netlayer) as the reference and as
      a golden test of the shared engine.
    - Parameterize the `kernel-test` integration suite over netlayers (loopback always;
      libp2p/websocket where infra allows).
    - Write per-error-class mapping tests (the master plan flags error-classification
      completeness as a risk).
    - Two-kernel round-trip: issue an ocap URL on A, redeem on B, exchange messages, restart A
      and confirm incarnation handling.

12. **Worked example** — a minimal `ChannelProvider` skeleton (~30 lines) delegating to
    `makeChannelNetlayer`, with pointers to loopback and websocket for full references.

---

## 5. Stale-docs correction list

Format: **file** → _claim_ → correction.

**`docs/ken-protocol-assessment.md`**

- Line 137 → "We use TCP-based transports (libp2p streams) which guarantee in-order delivery
  during normal operation." → Generalize: the kernel now depends on the **netlayer delivery
  contract** (best-effort, ordered per live connection), not on TCP/libp2p specifically. State
  that FIFO within a live connection is a netlayer guarantee, and out-of-order/duplicate
  arrival after reconnect is handled by sequence-number dedup regardless of transport.
- Line 194 (summary table, "FIFO ordering … TCP transport") → change "TCP transport" to
  "netlayer per-connection ordering guarantee."
- Line 153 (summary table row) → same generalization ("TCP guarantees in-order" →
  "netlayer guarantees per-connection order").
- Add a one-line pointer to `docs/writing-a-netlayer.md` §5 (delivery-semantics contract) as
  the normative statement of what transports must provide.

**`docs/identity-backup-recovery.md`**

- Lines 178–189 (Scenario 4) → imports `@libp2p/crypto/keys` (`generateKeyPairFromSeed`) and
  `@libp2p/peer-id` (`peerIdFromPrivateKey`) and returns a `12D3KooW…` libp2p peer id. This is
  now wrong: identity is neutral. Replace with the neutral derivation (raw Ed25519 pubkey via
  `@noble/curves` → base58btc multibase) exported from `@metamask/ocap-kernel`, and update the
  example `expectedPeerId` away from the `12D3KooW…` libp2p form. If the kernel exposes a helper
  (e.g. `peerIdFromMnemonic` / `peerIdFromSeed`), use it; otherwise show the neutral recipe.
- Lines 85–92 and 118, 133–135, 164, 219, 279 → examples call
  `initRemoteComms({ relays: [...] })` / `{ relays }` with `/ip4/.../p2p/12D3KooW…` multiaddrs.
  These now describe the **libp2p netlayer specifically**. Either (a) keep them but frame them
  as "using the libp2p netlayer" with the new `NetlayerSpecifier` shape, or (b) switch the
  primary examples to be netlayer-agnostic and move the libp2p relay multiaddr into the
  netlayer config. Recommend (a) with a note that the identity/mnemonic behavior is
  netlayer-independent.
- Every `12D3KooW…` string used as a _kernel peer id_ (lines 121, 138, 168, 192) → replace with
  a neutral-format example id. `12D3KooW…` inside a **relay multiaddr** (the libp2p netlayer's
  bootstrap hint) stays.

**`docs/usage.md`**

- Lines 52–80 ("Configuring Remote Comms for Workers") and 62–68 → `relays: ['/ip4/.../p2p/…']`
  - `RemoteCommsOptions` example. Reframe as libp2p-netlayer config via `NetlayerSpecifier`;
    rename `maxUrlRelayHints`/`maxKnownRelays` mentions if present.
- Lines 276–306 ("Remote Communications") → "enables peer-to-peer communication between kernels
  using libp2p relay servers" and "Relay addresses must be libp2p multiaddrs…". Generalize:
  remote comms now goes through a selected **netlayer**; the libp2p netlayer uses relay
  multiaddrs, but WebSocket/loopback have their own hint formats. Show `initRemoteComms` taking
  a `NetlayerSpecifier` (or however Phase 4b shaped it) and note the libp2p example as one
  option.
- Line 297 note ("For browser environments, only WebSocket transports (`/ws`) are supported.")
  → scope this to the libp2p netlayer.

**`docs/platform-specific.md`**

- Lines 31, 78, 81 → reference package path `../packages/nodejs/` and a `nodejs` package /
  `vat-worker.ts` / `make-kernel.ts` paths. Per memory, the Node runtime package is
  `@metamask/kernel-node-runtime` at `packages/kernel-node-runtime/`, not `packages/nodejs/`.
  Fix these paths (pre-existing staleness surfaced during this pass). Also add a short
  subsection noting that network transport is now a **platform-injected netlayer**: runtimes
  construct platform services with a `NetlayerRegistry`, and netlayers are the recommended way
  to add platform-specific transports (mirrors the existing platform-specific-implementation
  guidance). Cross-link `docs/writing-a-netlayer.md`.

**`docs/kernel-guide.md`**

- Grep result was minimal (lines 592–593 show a `remoteComms` status union with `peerId` /
  `listenAddresses` — already neutral, no change). Do a full read pass for any prose that says
  "libp2p", "relay", or "peer ID" in a way that implies libp2p; correct to netlayer-neutral
  language. If none beyond the status type, note "no changes required."

**`packages/ocap-kernel/README.md`**

- Line 15 (entire "SES/Lockdown Compatibility" section, lines 13–39) → asserts a dependency on
  `@chainsafe/libp2p-yamux` and documents applying its patch. After Phase 4, ocap-kernel has
  **zero** libp2p deps, so this is wrong. Move this SES/patch guidance to
  `@metamask/netlayer-libp2p`'s README (that package now owns the libp2p dep and the yamux
  patch), and replace the ocap-kernel section with a plain SES/lockdown compatibility note that
  no longer mentions libp2p. Verify against the final `packages/ocap-kernel/package.json`
  `patchedDependencies`.
- Add a short "Remote communications" paragraph pointing to the netlayer packages and
  `docs/writing-a-netlayer.md`, and noting that ocap-kernel re-exports the netlayer types.

**New package READMEs** (created in Phases 3–5; ensure they exist and are non-stub):

- `packages/netlayer/README.md`, `packages/netlayer-loopback/README.md`,
  `packages/netlayer-libp2p/README.md`, `packages/netlayer-websocket/README.md` — each: one-
  line purpose, install line, a "Contributing → monorepo README" footer (match existing README
  conventions), and a link to `docs/writing-a-netlayer.md`. `netlayer-libp2p` additionally
  carries the yamux/SES patch note moved from ocap-kernel and documents its `./nodejs` and
  `./relay` subpaths.

**Runtime READMEs** (`kernel-node-runtime`, `kernel-browser-runtime`) → if they describe remote
comms setup, update to the `NetlayerRegistry` construction and `NetlayerSpecifier` selection.

---

## 6. Changelog matrix (consumer-facing changes, Phases 1–5 + this rename)

Under `## [Unreleased]`, "Keep a Changelog" categories, `**BREAKING:**` prefix for breaking
changes, PR links. The `update-changelogs` skill does the writing; this matrix tells it which
packages changed and how.

| Package                            | Type          | Consumer-facing summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@metamask/netlayer`               | **new**       | Added: initial release — `Netlayer`/`NetlayerHooks`/`NetlayerFactory`/`NetlayerSpecifier`/`NetlayerRegistry` contracts, `NetworkChannel`/`ChannelProvider` seam, `makeChannelNetlayer` engine, shared reconnection/backoff/peer-state/rate-limit/validators/handshake, neutral Ed25519 identity helpers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `@metamask/netlayer-loopback`      | **new**       | Added: initial release — in-process hub netlayer (test fake + embedded multi-kernel).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `@metamask/netlayer-libp2p`        | **new**       | Added: initial release — libp2p `ChannelProvider`, error mapper, multiaddr utils; `./nodejs` (QUIC/TCP direct transports) and `./relay` (relay server, moved from `@metamask/kernel-utils`) subpaths. Carries the libp2p deps and the `@chainsafe/libp2p-yamux` SES patch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@metamask/netlayer-websocket`     | **new**       | Added: initial release — plain-WebSocket `ChannelProvider` (browser + node client); `./nodejs` server with Ed25519 challenge-signature peer auth.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@metamask/ocap-kernel`            | modified      | **BREAKING:** removed all libp2p/`@libp2p`/`@chainsafe`/`@multiformats` dependencies. **BREAKING:** kernel identity is now a neutral base58btc-multibase Ed25519 peer id (was libp2p `12D3KooW…`); the `ocap:` URL format changed accordingly (no migration). **BREAKING:** `initRemoteComms` / `initializeRemoteComms` now take a `NetlayerSpecifier` (was libp2p-specific options); `RemoteCommsOptions` split into kernel-level options + per-netlayer config. **BREAKING:** renamed relay→location-hint surface — `RelayEntry`→`LocationHintEntry`, `maxKnownRelays`→`maxKnownLocationHints`, `maxUrlRelayHints`→`maxUrlLocationHints`, `RemoteIdentity.addKnownRelays`→`addKnownLocationHints`; persisted `knownRelays` KV key renamed to `knownLocationHints` (learned hint pool not migrated); removed legacy `string[]` hint-pool migration. Added: re-exports of `@metamask/netlayer` types. Changed: internal `Channel`→`NetworkChannel` (note only if any of these were part of the public export surface). |
| `@metamask/kernel-errors`          | modified      | Added: neutral network error classes `ChannelResetError`, `IntentionalDisconnectError`, `MessageTooLargeError`. Changed: `isRetryableNetworkError` no longer sniffs libp2p error names (`MuxerClosedError` etc.) — that logic moved into `@metamask/netlayer-libp2p`. **BREAKING (if applicable):** dropped libp2p imports from the public surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@metamask/kernel-utils`           | modified      | **BREAKING:** removed the libp2p relay server (the `@metamask/kernel-utils/libp2p` subpath / `startRelay`) — moved to `@metamask/netlayer-libp2p/relay`. Note `getLibp2pRelayHome` **stays** in `@metamask/kernel-utils/nodejs` per the Phase 4 plan (it is a plain path helper); mention it only if this phase's optional rename touches it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `@metamask/kernel-node-runtime`    | modified      | **BREAKING:** `NodejsPlatformServices` is now constructed with a `NetlayerRegistry`; QUIC/TCP transport detection moved into the libp2p netlayer; the internal `directTransports` option was removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `@metamask/kernel-browser-runtime` | modified      | **BREAKING:** `PlatformServicesServer`/`PlatformServicesClient` now take a `NetlayerRegistry`; `initializeRemoteComms` RPC struct changed to carry a `NetlayerSpecifier`; `createCommsQueryString`/`getCommsParamsFromCurrentLocation` updated for the new config shape (`maxUrlRelayHints`/`maxKnownRelays` → renamed).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `@metamask/kernel-cli`             | modified      | Changed: the `relay` command now runs the relay server from `@metamask/netlayer-libp2p/relay`; kernel/daemon config accepts a `NetlayerSpecifier`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `@metamask/kernel-shims`           | modified      | Changed: the bare `import '@libp2p/webrtc'` moved out of `endoify-node.js` alongside the libp2p netlayer (flag for review — verify whether this is consumer-facing).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@ocap/extension`                  | app (private) | Not published — likely `no-changelog`. Internal: hard-coded relay in `offscreen.ts` replaced by netlayer config. Confirm the package's changelog policy before writing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Notes for the skill run:

- New packages get a single `### Added` "Initial release" entry.
- Do not invent PR numbers; use the actual PRs from Phases 1–5 (and this Phase 6 PR for the
  rename). If unknown at execution time, leave a `#TODO-PR` placeholder and fill before merge.
- Private/app packages (`extension`, `omnium-gatherum`, `evm-wallet-experiment`,
  `kernel-test`, `kernel-ui` if unpublished) generally take the `no-changelog` label rather
  than entries — verify each `package.json` `private` flag.

---

## 7. Step-by-step execution order

1. **Branch.** Create a feature branch off `main` (e.g. `phase-6-cleanup-docs`).
2. **Rename (code).** Apply §2:
   1. Rename `store/methods/relay.ts` → `location-hints.ts` and its test; rename symbols;
      delete the legacy migration branch; change the KV key.
   2. Update `store/types.ts`, `store/index.ts`, `store/index.test.ts`.
   3. Update `remotes/types.ts` (`addKnownRelays`, `maxKnownRelays`, `maxUrlRelayHints`).
   4. Update `rpc/kernel-control/init-remote-comms.ts` + test.
   5. Build to surface every caller (`yarn workspace @metamask/ocap-kernel build`); fix each
      until the compiler is clean. Update the callers' tests.
   6. Grep `packages/kernel-browser-runtime` and `kernel-cli` for `maxUrlRelayHints` /
      `maxKnownRelays` and update.
3. **Verify the rename in isolation** before touching docs: `yarn lint:fix`, `yarn build`,
   `yarn test:dev:quiet` (see §8). Commit: `refactor: rename relay → location hint in kernel
surfaces`.
4. **New doc.** Write `docs/writing-a-netlayer.md` per §4.
5. **Glossary.** Invoke the `glossary` skill / follow §3; add the five entries (plus an
   `ocap URL` entry if you linked to it). Ensure no dangling anchors.
6. **Stale-doc corrections.** Apply §5 to each file. Do a full read of `docs/kernel-guide.md`
   for libp2p/relay prose. Move the yamux/SES note from ocap-kernel README to
   netlayer-libp2p README. Verify claims against the final `package.json` files.
7. **iroh note.** Add a short "Next netlayer: iroh" subsection to
   `docs/writing-a-netlayer.md` (or a small standalone note) — Node-only first via napi
   bindings, optional browser/wasm entry later (relay-only in browser), pointer to
   [#968](https://github.com/MetaMask/ocap-kernel/issues/968).
8. **Commit docs**: `docs: add writing-a-netlayer guide, glossary entries, correct stale
libp2p references`.
9. **Changelogs.** Run the `update-changelogs` skill with §6 as input. It commits
   `docs: Update changelogs` and returns the hash.
10. **Final verification** (§8), then open the PR.

Rationale for order: code rename first and verified independently (so a docs mistake can't mask
a compile/test break), docs next, changelogs last (they describe the finished state and the
skill commits on its own).

---

## 8. Verification

- **Lint / build / test** (root, turbo-cached) after the rename and again at the end:
  - `yarn lint:fix`
  - `yarn build`
  - `yarn test:dev:quiet` (add `--coverage=true` if you want coverage)
  - Affected packages' integration tests where touched: `yarn workspace @ocap/kernel-test
test:dev:quiet` (kernel-test's integration tests run under the normal test runner; no
    separate `test:integration` script as of writing) and any netlayer package integration
    suites. The rename should not change behavior, so these must stay green with no logic
    edits.
- **Constraints:** `yarn constraints` (referenced in the master plan's Phase 3 verification) —
  run after any `package.json`/tsconfig `references` edits (README moves don't need it, but the
  changelog skill and any dep touch might).
- **Grep gate:** confirm no kernel-generic `relay` symbols remain — e.g.
  `git grep -nE 'RelayEntry|maxKnownRelays|maxUrlRelayHints|addKnownRelays|knownRelays' packages`
  should only match `@metamask/netlayer-libp2p` (and legitimately-named libp2p tests/CLI).
- **Docs link check:** the repo uses `@metamask/auto-changelog` for changelog validation
  (runs in CI). For markdown links, check whether a link-lint step exists
  (`grep -r "markdown-link\|remark\|lint:docs" package.json .github`); if none, manually verify
  every new/edited relative link resolves and every glossary `#anchor` has a matching heading.
  In particular verify the implementation-file links in the new glossary entries point at the
  post-rename paths (`store/methods/location-hints.ts`).
- **Glossary skill:** used per §3/step 5; confirm entries follow the `### term` + cross-link
  - implementation-link conventions already in `docs/glossary.md`.
- **`build:docs` smoke** (optional): `yarn build:docs` to ensure TypeDoc still builds after the
  symbol renames.

---

## 9. Estimate

**~1–2 dev-days**, matching the master plan.

- Rename + fix callers + tests: ~0.3–0.5 day (mechanical; compiler-driven).
- `docs/writing-a-netlayer.md`: ~0.5 day (the substantive writing task).
- Glossary + stale-doc corrections + README moves + iroh note: ~0.3–0.5 day.
- Changelogs (skill-driven) + verification + PR: ~0.2–0.3 day.

Risks to the estimate: (a) the stale-doc pass can expand if `kernel-guide.md`/`usage.md`
contain more libp2p prose than the grep suggested — budget a full read; (b) if `relays` has
_not_ fully moved to the libp2p netlayer config by end of Phase 4b, decide during execution
whether it stays in ocap-kernel (and thus whether it participates in the rename) — this is the
one open question that could add scope.
