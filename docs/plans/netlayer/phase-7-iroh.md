# Phase 7 — `@metamask/netlayer-iroh` (DRAFT)

> **DRAFT — NOT YET SCHEDULED.** Proposed follow-up to the pluggable-netlayer effort
> ([issue #968](https://github.com/MetaMask/ocap-kernel/issues/968); master plan at
> [`master.md`](./master.md), Phases 1–4 + 6 landed). This phase supersedes the deferred
> WebSocket netlayer ([`phase-5.md`](./phase-5.md)) as the **second real `ChannelProvider`**
> proving the abstraction isn't libp2p-shaped — with the caveat noted in §1 that iroh is a
> weaker generality test than WebSocket on some axes, which §3 (conformance kit) compensates
> for. Phase 5 remains deferred and independent; nothing here blocks it.
>
> Before execution, reconcile against the then-current state of `@metamask/netlayer` and
> `@metamask/netlayer-libp2p`; the landed code wins over this document. This plan assumes the
> netlayer contract described in [writing a netlayer](../../writing-a-netlayer.md) and the
> [`## Networking` glossary section](../../glossary.md#netlayer) (netlayer, neutral peer id,
> location hint, incarnation handshake) landed in Phase 6.

---

## 1. Objective and non-goals

### Objective

Ship `@metamask/netlayer-iroh`: a Node-only `ChannelProvider` over [iroh](https://iroh.computer)
(QUIC with relays and hole-punching), driving the shared `makeChannelNetlayer` engine — the
netlayer that issue #968 originally asked for. Alongside it, ship a **provider-conformance test
kit** so that this and every future provider is verified against the engine's behavioral
contract rather than trusting prose.

What iroh gives us over libp2p: a stable wire protocol (1.0, June 2026), official napi Node
bindings, markedly less dependency surface than the ~15-package libp2p stack, and an identity
model that matches ours exactly — an iroh NodeId **is** the raw 32-byte Ed25519 public key that
the neutral peerId base58btc-encodes, so identity conversion is a re-encoding, not a derivation,
and authenticated peer identity comes free from QUIC TLS (no application-level auth handshake,
unlike the deferred WebSocket plan's §5).

Honest scope note: iroh is from the same transport family as libp2p (connection-oriented,
stream-muxed bytestreams, P2P topology, transport-level identity). It proves the seam supports a
second stack; it does **not** stress the assumptions WebSocket would have (message-oriented
framing, client-server topology, app-level auth). The conformance kit (§3) recovers most of that
assurance; the rest waits for Phase 5.

### Non-goals (explicit)

- **No browser support.** iroh in the browser is wasm-only, relay-only, with no npm package (we
  would have to maintain a Rust wrapper crate + wasm-bindgen build). Browsers keep
  `@metamask/netlayer-libp2p`. Document; do not attempt.
- **No self-hosted relay tooling.** iroh nodes use n0's public relays by default; a deployer can
  configure their own. We ship configuration for relay URLs, not a relay server (unlike
  netlayer-libp2p's `./relay`).
- **No engine changes beyond §2.** The engine's contract is the thing under test; if iroh cannot
  be implemented against it without engine surgery, that is a finding to report, not a license to
  fork the engine.
- **Not a public third-party extension point** (unchanged from the master plan).

---

## 2. Seam cleanups before implementation

Two pre-steps from the post–Phase 6 engine assessment, done first so the second provider doesn't
cement known warts:

1. **`dial(peerId, hints, withRetry)` — decide the retry seam.** Today the engine pushes retry
   policy into the provider (send-path dials pass `true`, reconnection-lifecycle dials pass
   `false`), so every provider must implement connect-backoff in addition to the engine's
   reconnection backoff. **Recommended:** fold connect-retry into the engine (it already has
   `retryWithBackoff` available via kernel-utils) and reduce the provider contract to
   `dial(peerId, hints)`; update `netlayer-libp2p` accordingly (behavior-preserving: same
   attempt counts/delays). This is a breaking change to the `ChannelProvider` type — cheap now
   with one provider, expensive after two. If descoped, iroh must implement its own connect
   backoff mirroring `openChannelWithRetry`, and this item moves to the debt list.
2. **Neutralize libp2p-flavored engine comments/names** (cosmetic, zero behavior): the
   "length-prefixed framing is now poisoned" rationale on the `MessageTooLargeError` branch, the
   "(SCTP user abort)" gloss, the TCP-FIN framing of `stop()`, and the `stream*` naming of the
   inactivity-timeout options. Re-state each in terms of the `NetworkChannel` contract.

---

## 3. Provider-conformance test kit (ships with this phase)

New module in `@ocap/test-utils` (per repo convention: multi-package test utilities live there):
`makeChannelProviderConformanceSuite({ makeProviderPair, name })`, where `makeProviderPair()`
yields two connected providers (A dials B) plus hooks to inject faults. The suite drives any
provider through the scenarios the engine's correctness depends on, which today are enforced
only by prose:

- `read()` error taxonomy: remote reset → `ChannelResetError`; locally-initiated close →
  `IntentionalDisconnectError`; oversize inbound frame → `MessageTooLargeError`; other transport
  errors pass through. **Ordering assertion:** a remote reset is never classified intentional
  (reconnection-suppression vulnerability otherwise).
- Dial semantics: concurrent dials to the same peer dedup (single channel); dial to an
  unreachable peer rejects; `withRetry` semantics if §2.1 is descoped.
- `closeChannel`/`channel.close()` idempotence; post-close `read()` throws the terminal error
  (does not hang); parked readers settle.
- `onPeerDisconnect` fires after the transport-level disconnect of a peer with no live channel,
  and not for channels the engine already tore down.
- `setInactivityTimeout`: traffic resets the timer; expiry closes with a reset-class error (or
  the provider documents it as a no-op and the suite skips).
- `stop()`: closes all channels, causes in-flight `read()`s to settle, and is bounded (no hang on
  a wedged channel).
- Message-boundary integrity: N distinct payloads written arrive as N reads, bytes identical, in
  order.

Wire the suite into `netlayer-libp2p` (using its existing mocked-libp2p test infra) **first** —
it must pass unchanged there before iroh implementation starts, so suite failures during iroh
development indict the provider, not the kit. Loopback is exempt (it implements `Netlayer`
directly, not `ChannelProvider`).

---

## 4. Package layout and design

Scaffold with the `create-package` skill, then rename to `@metamask/netlayer-iroh` (copy
`publishConfig`/`exports` from a published package; tsconfig `references` in both tsconfig.json
and tsconfig.build.json; `yarn constraints`).

```
packages/netlayer-iroh/
  src/
    index.ts            # '.'       — types + config structs only (browser-bundle-safe, no napi import)
    nodejs.ts           # './nodejs' — makeIrohNetlayer factory (imports the napi bindings)
    iroh-provider.ts    # ChannelProvider over an iroh Endpoint
    iroh-channel.ts     # bi-stream -> NetworkChannel adapter (lp-framing, inactivity timer)
    framing.ts          # 4-byte BE length prefix + max-size check (small, self-contained)
    error-mapper.ts     # iroh/QUIC errors -> neutral kernel-errors
    config.ts           # superstruct config (Json-safe: crosses NetlayerSpecifier)
  README.md
```

- **Dependency:** the official iroh napi bindings from npm (verify the current package name and
  1.x version at execution time; pin it). It is a native module — see §6 (SES) before adding it
  anywhere.
- **Exports:** follow the `kernel-platforms` subpath pattern. `.` carries only types/config so
  nothing browser-bundled ever evaluates the napi module; `./nodejs` carries the factory.
  **The tsconfig subpath-mapping rule applies** (master.md Phase 4 landed decisions / the
  `privateMap.get` lesson, documented in the [writing-a-netlayer packaging
  section](../../writing-a-netlayer.md#packaging-subpath-exports-and-tsconfig-mappings)): add
  explicit `tsconfig.packages.json` path mappings for `@metamask/netlayer-iroh/nodejs` → src, or
  vitest resolves it to dist.
- **Identity:** `NetlayerParams.keySeed` → Ed25519 secret key handed to the iroh `Endpoint`;
  `provider.peerId` = `publicKeyToNeutralPeerId(nodeId bytes)` via `@metamask/netlayer`'s landed
  helpers. Conversion is bit-exact by construction (NodeId == raw pubkey); assert it in tests
  anyway, as Phase 2 did for libp2p.
- **ALPN:** a dedicated constant (e.g. `ocap-netlayer/1`); reject other ALPNs.
- **Channels:** one QUIC connection per peer, one bidirectional stream per connection, adapted to
  `NetworkChannel` with the length-prefix framing from `framing.ts` (QUIC streams are
  bytestreams; the engine expects one complete payload per `read()`). Frame size cap wired to the
  engine's `maxMessageSizeBytes`; an announced-oversize frame maps to `MessageTooLargeError`
  _before_ buffering the body. On stream or connection loss the channel's `read()` throws the
  mapped error and the engine drives reconnection. The engine's one-channel-per-peer model means
  we deliberately do not multiplex additional streams.
- **Hints:** an iroh dial needs a NodeAddr — relay URL and/or direct socket addresses. Serialize
  as opaque hint strings (e.g. `relay:<url>` / `addr:<host:port>`; exact scheme is
  provider-internal). `getListenAddresses()` returns the endpoint's current NodeAddr serialized
  the same way; `dial(peerId, hints)` reconstructs the NodeAddr, with the NodeId taken from the
  neutral peerId argument (never from hints — hints locate, identity authenticates).
- **Error mapping (`error-mapper.ts`)** — enumerate with per-class tests, mirroring the
  netlayer-libp2p mapper:

  | iroh/QUIC signal                                                          | Neutral error                |
  | ------------------------------------------------------------------------- | ---------------------------- |
  | Application close with our `INTENTIONAL` code (local or remote `close()`) | `IntentionalDisconnectError` |
  | Connection reset / lost / idle-timeout / stream reset                     | `ChannelResetError`          |
  | Frame length prefix exceeds cap                                           | `MessageTooLargeError`       |
  | Provider stopped                                                          | `NetworkStoppedError`        |
  | Anything else                                                             | pass through unchanged       |

- **`setInactivityTimeout`:** QUIC has its own keepalive/idle machinery; prefer configuring the
  endpoint's idle timeout to the engine's value (loss surfaces as a reset-class `read()` error)
  over running a duplicate JS timer. If the bindings don't expose per-connection idle config,
  fall back to the timer approach from the WebSocket plan (§4.1 of phase-5.md).
- **Config (superstruct, Json-safe):** `relayUrls?: string[]` (empty/omitted → relay disabled —
  the CI-safe default; deployers opt into n0's or their own relays explicitly, so tests never
  silently depend on external infra), `directAddrPort?: number`, `knownRelays?: string[]` (the
  kernel's one config-key convention — the opaque location-hint pool it persists and re-injects,
  here iroh-serialized NodeAddr hints; the factory seeds known peer locations from it exactly as
  `netlayer-libp2p` does — see the writing-a-netlayer guide's config section), plus the shared
  engine-knob subset as the other netlayers take it.

---

## 5. Test plan

- **Conformance suite (§3)** against the iroh provider with two real endpoints on
  `127.0.0.1` (relay disabled, direct addresses) — this is the phase's core deliverable.
- **Unit tests:** framing round-trip + oversize rejection; error-mapper table (`it.each`);
  hint serialization round-trip; config validation; identity round-trip (seed → NodeId →
  neutral peerId → pubkey bytes).
- **Integration:** two kernels over iroh on localhost reproducing the remote-comms scenario
  (issue ocap: URL on B, redeem on A, message + reply); restart/incarnation-change scenario
  (kernel B restarts with a new incarnationId; engine suppresses pre-restart payloads —
  exercises the handshake path the engine owns).
- **kernel-test:** add an `iroh` case alongside the loopback-based remote-comms coverage
  (Node-only; relay-disabled localhost, so CI-safe with no external network).
- **CI note:** napi prebuilds must exist for the CI runners' platforms; verify before committing
  to the dependency. No test may reach n0's public relay infrastructure.

---

## 6. Risks

- **Native module vs SES lockdown (highest; the `@libp2p/webrtc` lesson).** Determine
  empirically whether the napi bindings initialize module state that lockdown breaks
  (tslib/private-field WeakMaps, lazy native loading). If pre-lockdown eval is required, do NOT
  quietly extend `kernel-shims/endoify-node.js` — that decision is already review-gated for
  `@libp2p/webrtc` (master.md Phase 4 deviations) and this phase must surface its own case to
  the same human review, ideally converging on one pluggable pre-lockdown-preamble mechanism for
  both.
- **Bindings API coverage.** The provider needs: endpoint with caller-supplied secret key,
  custom ALPN accept/connect, bi-stream open/accept, close with application code, connection
  events, idle-timeout config, NodeAddr introspection. Spike this first (§7 step 0); any gap is
  a stop-and-report, not a workaround.
- **One-channel-per-peer vs QUIC multiplexing.** The engine registers a single channel per peer;
  a peer opening a second stream must be rejected or the stream reused per the engine's
  `reuseOrReturnChannel` race rules. The conformance suite's dedup scenarios cover this.
- **Platform/CI surface of napi prebuilds** (darwin/linux × x64/arm64 at minimum).
- **Dependency weight/审查:** a native binary dependency needs supply-chain review (Socket runs
  in CI, but flag it in the PR for human attention).

---

## 7. Execution order

0. **Spike (timeboxed, ~0.5d):** bindings API coverage check (§6) + a two-endpoint
   localhost echo over a custom ALPN + a lockdown smoke test (import the bindings after
   `lockdown()` in a scratch script). Go/no-go gate; report findings before proceeding.
1. Seam cleanups (§2) — the `withRetry` decision first, since it changes the contract iroh
   implements.
2. Conformance kit in `@ocap/test-utils`, passing against `netlayer-libp2p`.
3. Scaffold `@metamask/netlayer-iroh`; framing + error-mapper + config with unit tests.
4. `iroh-channel.ts`, `iroh-provider.ts`; conformance suite green against iroh.
5. `./nodejs` factory via `makeChannelNetlayer`; identity assertions; tsconfig subpath mappings.
6. Integration + kernel-test scenarios.
7. README (topology, relay configuration, Node-only stance, browser story), glossary entry,
   changelogs, master.md update (per the established landed-decisions pattern).

## 8. Estimate

**5–7 developer-days:** ~0.5d spike; ~1d seam cleanups + conformance kit (kit is the long pole);
~2d provider + channel + factory; ~1–1.5d integration/kernel-test + SES/native-module handling;
~0.5–1d docs/changelogs/CI hardening. The spike (step 0) can invalidate the estimate — that is
its job.
