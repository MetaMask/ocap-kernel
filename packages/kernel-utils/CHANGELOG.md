# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- refactor(ocap-kernel): branded kernel identifiers with runtime validation ([#917](https://github.com/MetaMask/ocap-kernel/pull/917))
- feat(kernel-language-model-service): Add language model client ([#876](https://github.com/MetaMask/ocap-kernel/pull/876))
- chore: fix type error, upgrade turbo, suppress warnings ([#908](https://github.com/MetaMask/ocap-kernel/pull/908))
- feat: upgrade libp2p v2 to v3 ([#900](https://github.com/MetaMask/ocap-kernel/pull/900))
- feat(kernel-cli): queueMessage, redeem-url, OCAP_HOME, e2e tests ([#896](https://github.com/MetaMask/ocap-kernel/pull/896))
- fix(kernel-utils): add `patch-package` as a dev dependency ([#893](https://github.com/MetaMask/ocap-kernel/pull/893))
- fix(ocap-kernel): enforce one delivery per crank, fix rollback cache staleness ([#879](https://github.com/MetaMask/ocap-kernel/pull/879))
- feat: patch-package for SES-compat patches; root patches/ as single source of truth ([#874](https://github.com/MetaMask/ocap-kernel/pull/874))
- refactor(kernel-utils): rename `describe()` to `__getDescription__()` d… ([#869](https://github.com/MetaMask/ocap-kernel/pull/869))

### Added

- Add `./vite-plugins` export with `bundleVat` and `bundleVats` vat bundling utilities (moved from `@ocap/repo-tools`) ([#875](https://github.com/MetaMask/ocap-kernel/pull/875))
- Add `vite` as an optional peer dependency for the `./vite-plugins` subpath ([#875](https://github.com/MetaMask/ocap-kernel/pull/875))

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

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-utils@0.4.0...HEAD
[0.4.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-utils@0.3.0...@metamask/kernel-utils@0.4.0
[0.3.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-utils@0.2.0...@metamask/kernel-utils@0.3.0
[0.2.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-utils@0.1.0...@metamask/kernel-utils@0.2.0
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/kernel-utils@0.1.0
