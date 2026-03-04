# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0]

### Added

- Add bundleVats Vite plugin for vat bundling ([#834](https://github.com/MetaMask/ocap-kernel/pull/834))
- Enable offline ocap url methods ([#823](https://github.com/MetaMask/ocap-kernel/pull/823))
- Consolidate extension console logs and capture in Playwright tests ([#798](https://github.com/MetaMask/ocap-kernel/pull/798))
- Add silent Vitest reporter ([#792](https://github.com/MetaMask/ocap-kernel/pull/792))
- Add Turborepo caching for test:dev and fix streams dev tests ([#757](https://github.com/MetaMask/ocap-kernel/pull/757))
- Add `omnium-gatherum` extension ([#654](https://github.com/MetaMask/ocap-kernel/pull/654))
- Add Remote Comms UI panel and testing infrastructure ([#637](https://github.com/MetaMask/ocap-kernel/pull/637))
- First pass of support for kernel-kernel network comms ([#578](https://github.com/MetaMask/ocap-kernel/pull/578))

### Changed

- **BREAKING:** Drop Node 20 support ([#837](https://github.com/MetaMask/ocap-kernel/pull/837))
- Remove reload methods from Kernel and SubclusterManager ([#836](https://github.com/MetaMask/ocap-kernel/pull/836))
- Update MetaMask design system and React to v18 ([#746](https://github.com/MetaMask/ocap-kernel/pull/746))
- Silence Yarn peer dependency warnings ([#738](https://github.com/MetaMask/ocap-kernel/pull/738))
- Move default cluster startup to background ([#709](https://github.com/MetaMask/ocap-kernel/pull/709))
- Migrate to JsonRpcEngineV2 ([#707](https://github.com/MetaMask/ocap-kernel/pull/707))
- Make various updates to `lint-build-test.yml` to unblock CI ([#683](https://github.com/MetaMask/ocap-kernel/pull/683))
- Enable `n/prefer-node-protocol` ESLint rule ([#647](https://github.com/MetaMask/ocap-kernel/pull/647))

### Fixed

- Rationalize build externals and dependency declarations ([#652](https://github.com/MetaMask/ocap-kernel/pull/652))

## [0.3.0]

### Changed

- Dual-license package under MIT and/or Apache 2.0 ([#601](https://github.com/MetaMask/ocap-kernel/pull/601))

## [0.2.0]

### Changed

- Use the MetaMask design system ([#577](https://github.com/MetaMask/ocap-kernel/pull/577))
- Wait for crank to run kernel actions ([#595](https://github.com/MetaMask/ocap-kernel/pull/595))
- Bump Endo and Agoric dependencies ([#590](https://github.com/MetaMask/ocap-kernel/pull/590))

### Fixed

- Restore sourcemaps ([#567](https://github.com/MetaMask/ocap-kernel/pull/567))

## [0.1.0]

### Added

- Initial release.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-ui@0.4.0...HEAD
[0.4.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-ui@0.3.0...@metamask/kernel-ui@0.4.0
[0.3.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-ui@0.2.0...@metamask/kernel-ui@0.3.0
[0.2.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-ui@0.1.0...@metamask/kernel-ui@0.2.0
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/kernel-ui@0.1.0
