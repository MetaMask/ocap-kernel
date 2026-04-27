# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `@metamask/kernel-utils/sheaf` subpath export ([#870](https://github.com/MetaMask/ocap-kernel/pull/870))
  - `sheafify()` for building a `Sheaf` capability authority from a collection of `PresheafSection`s, each an exo with optional invocation-dependent metadata
  - `constant()`, `source()`, `callable()` for constructing metadata specs (static value, compartment-evaluated code string, and per-call function respectively)
  - `noopLift()`, `proxyLift()`, `withFilter()`, `withRanking()`, `fallthrough()` for composing lifts to route and rank sections at dispatch time
  - `makeSection()` for constructing a typed exo section from a guard and handler map
  - `makeRemoteSection()` for wrapping a remote CapTP reference as a `PresheafSection`, fetching its interface guard once at construction and forwarding method calls via `E()`
  - Types: `Sheaf<M>`, `Section`, `PresheafSection<M>`, `EvaluatedSection<M>`, `MetadataSpec<M>`, `Lift<M>`, `LiftContext<M>`

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
