# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add a `./described` export with a combinator namespace `S` (`S.string`/`S.number`/`S.boolean`/`S.arrayOf`/`S.record`/`S.object`/`S.nothing` leaves, plus `S.arg`/`S.method`/`S.interface`) that authors an `@endo/patterns` interface guard and a matching `MethodSchema` from a single source, so a discoverable exo's enforced shape and its `__getDescription__` hint cannot drift ([#958](https://github.com/MetaMask/ocap-kernel/pull/958))
- Add an optional `required` field to `MethodSchema` (mirroring `required` on object `JsonSchema`) naming which arguments are required, and a `{ required }` option on `methodArgsToStruct` that validates unlisted arguments as optional, so a method's argument schema can faithfully represent the optional trailing arguments its guard already allows ([#958](https://github.com/MetaMask/ocap-kernel/pull/958))
- Add `getLibp2pRelayHome()` to the `./nodejs` exports, returning the libp2p relay's bookkeeping directory (default `~/.libp2p-relay`, overridable via `$LIBP2P_RELAY_HOME`) — kept separate from `$OCAP_HOME` so one relay can serve daemons with different OCAP_HOMEs ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))
- `startRelay()` accepts an optional `publicIp` that is fed to libp2p's `appendAnnounce`, so a relay running on a NAT-backed host can announce its publicly-reachable IPv4 alongside its bound NIC addresses ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))
- Add `./session` export path with `makeChannel`, `Channel`, and `ModalStream` session channel primitives
- Add `SessionSummary`, `PendingRequest`, and `SessionApi` transport-agnostic types to `./session`
- Add `makeSessionRegistry`, `Session`, `SessionRegistry`, and `SessionHistoryEntry` to `./session`

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
