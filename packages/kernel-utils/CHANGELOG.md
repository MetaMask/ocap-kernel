# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `makeGuardedFetch` and the `FetchGuard` type, wrapping a `fetch` so that a guard runs before every request it makes — the caller's, and every redirect hop. Left to itself `fetch` walks the whole chain and consults nobody, so a guard that sees only the pre-flight URL is one `Location` header away from being bypassed ([#1026](https://github.com/MetaMask/ocap-kernel/pull/1026))
  - A `redirect` of `follow` is overridden rather than merged, on `init` and on a `Request` alike, since it is the only mode that could reach an unapproved host; `manual` and `error` ask for less and are obeyed. A `dispatcher` in `init` is refused rather than dropped — undici honours it in place of the transport, and dropping it would fall back to the global one and egress anyway
  - Hops follow the fetch spec's rewrite rules: a 303 (and a 301 or 302 from a POST) becomes a bodyless GET, credentials are dropped when the hop leaves the origin, and the chain gives up after 20
  - A hop that keeps the body fails unless that body can be sent twice, which is stricter than the spec: the spec replays a stream whose source it kept, and that source is not reachable from here. A `Request`'s body is a stream however it was built, so a `Request` carrying any body fails such a hop
  - A hop to a scheme the fetch spec will not follow is refused by name, and so is an opaque redirect — the response a browser gives for `redirect: 'manual'`, which hides the hop instead of exposing it for checking. Undici returns the real redirect response, so this is a Node-versus-browser difference that fails closed rather than silently
- Add `resolveFetchInput`, which resolves a `fetch` input to the URL that will actually be requested and returns a stand-in input that cannot resolve to any other URL, along with the `FetchInput` and `ResolvedFetchInput` types ([#1026](https://github.com/MetaMask/ocap-kernel/pull/1026))
  - `fetch` accepts any object with a stringifier and stringifies it itself, so code that validates `new URL(input)` and then forwards the caller's `input` lets the input decide what each read returns. Forwarding the returned `input` instead means the URL checked and the URL requested cannot disagree
  - A `Request` is returned copied and then rebuilt around the resolved URL, keeping the caller's method, headers and body. Reading — or merely copying — the caller's own is not enough: a subclass can override `url`, and undici on Node 22 keeps the state behind it in a configurable own property, so the caller can both make it answer differently on each read and leave a `URL` object of its own in it to mutate after the check. The copy comes first because the rebuild reads its argument as a `RequestInit`, by string name, which would otherwise pick up a planted `dispatcher`
  - The guarantee is over the destination, not the payload: a forwarded `Request` still carries the caller's body stream
  - An input that resolves to a different URL when read again is rejected rather than serviced at whichever URL it showed first
- Add an `interface` variant to `JsonSchema` — `{ type: 'interface', description?, methods }` — describing an object whose methods can be invoked, so a method that returns an object reference can declare that object's API inline and a client need not make a second round-trip to discover it. The `methods` field is recursive, so a returned interface can itself return interfaces. The variant describes an _interface_; whether the reference to the object is unforgeable is a property of the reference plumbing, not of the description ([#1007](https://github.com/MetaMask/ocap-kernel/pull/1007))
- Add a `./described` export with a combinator namespace `S` (`S.string`/`S.number`/`S.boolean`/`S.arrayOf`/`S.record`/`S.object`/`S.nothing` leaves, plus `S.arg`/`S.method`/`S.interface`) that authors an `@endo/patterns` interface guard and a matching `MethodSchema` from a single source, so a discoverable exo's enforced shape and its `__getDescription__` hint cannot drift ([#958](https://github.com/MetaMask/ocap-kernel/pull/958))
- Add an optional `required` field to `MethodSchema` (mirroring `required` on object `JsonSchema`) naming which arguments are required, and a `{ required }` option on `methodArgsToStruct` that validates unlisted arguments as optional, so a method's argument schema can faithfully represent the optional trailing arguments its guard already allows ([#958](https://github.com/MetaMask/ocap-kernel/pull/958))
- Add `getLibp2pRelayHome()` to the `./nodejs` exports, returning the libp2p relay's bookkeeping directory (default `~/.libp2p-relay`, overridable via `$LIBP2P_RELAY_HOME`) — kept separate from `$OCAP_HOME` so one relay can serve daemons with different OCAP_HOMEs ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))
- `startRelay()` accepts an optional `publicIp` that is fed to libp2p's `appendAnnounce`, so a relay running on a NAT-backed host can announce its publicly-reachable IPv4 alongside its bound NIC addresses ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))
- Add `replaceNodeEnvPlugin` to the `./vite-plugins` exports, a Rolldown transform plugin that inlines `process.env.NODE_ENV` as a string literal (configurable via `{ value }`, defaulting to `'production'`) in any module referencing it — used by `bundleVat` in place of a build-config `define`, so vats that pull in libraries like immer resolve the reference at bundle time ([#967](https://github.com/MetaMask/ocap-kernel/pull/967))

## [0.5.0]

### Added

- Add `./vite-plugins` export with `bundleVat` and `bundleVats` vat bundling utilities (moved from `@ocap/repo-tools`) ([#875](https://github.com/MetaMask/ocap-kernel/pull/875))
- Add `vite` as an optional peer dependency for the `./vite-plugins` subpath ([#875](https://github.com/MetaMask/ocap-kernel/pull/875))
- Add `CapDataStruct` export ([#917](https://github.com/MetaMask/ocap-kernel/pull/917))
- Add JSON Schema to superstruct utilities ([#876](https://github.com/MetaMask/ocap-kernel/pull/876))
- Add `@metamask/kernel-cli` utilities ([#896](https://github.com/MetaMask/ocap-kernel/pull/896))
  - `getOcapHome()` for obtaining the CLI config dir
  - `prettifySmallcaps()` for formatting smallcaps values for display
- Add `isCapData()` utility ([#879](https://github.com/MetaMask/ocap-kernel/pull/879))

### Changed

- **BREAKING:** Rename discoverable exo `describe()` method to `__getDescription__()` ([#869](https://github.com/MetaMask/ocap-kernel/pull/869))

## [0.4.0]

### Added

- Add vat bundle utilities ([#763](https://github.com/MetaMask/ocap-kernel/pull/763))
- Add `./libp2p` export with `startRelay()` and `ifDefined()` utility ([#843](https://github.com/MetaMask/ocap-kernel/pull/843))
- Add `Promisified<T>` utility type ([#752](https://github.com/MetaMask/ocap-kernel/pull/752))
- Add `makeDiscoverableExo()` constructor ([#705](https://github.com/MetaMask/ocap-kernel/pull/705))
- Add retry utilities with exponential backoff and wake detection ([#678](https://github.com/MetaMask/ocap-kernel/pull/678))
- Add `mergeDisjointRecords()` utility ([#619](https://github.com/MetaMask/ocap-kernel/pull/619))
- Add `makeDefaultExo` utility ([#612](https://github.com/MetaMask/ocap-kernel/pull/612))
- Add hex encoding utilities ([#578](https://github.com/MetaMask/ocap-kernel/pull/578))

### Changed

- **BREAKING:** Drop Node 20 support ([#837](https://github.com/MetaMask/ocap-kernel/pull/837))

## [0.3.0]

### Changed

- Dual-license package under MIT and/or Apache 2.0 ([#601](https://github.com/MetaMask/ocap-kernel/pull/601))

## [0.2.0]

### Changed

- Bump Endo and Agoric dependencies ([#590](https://github.com/MetaMask/ocap-kernel/pull/590), [#543](https://github.com/MetaMask/ocap-kernel/pull/543))

## [0.1.0]

### Added

- Initial release.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-utils@0.5.0...HEAD
[0.5.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-utils@0.4.0...@metamask/kernel-utils@0.5.0
[0.4.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-utils@0.3.0...@metamask/kernel-utils@0.4.0
[0.3.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-utils@0.2.0...@metamask/kernel-utils@0.3.0
[0.2.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-utils@0.1.0...@metamask/kernel-utils@0.2.0
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/kernel-utils@0.1.0
