# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0]

### Added

- Support absolute database paths ([#821](https://github.com/MetaMask/ocap-kernel/pull/821))
- Consolidate extension console logs and capture in Playwright tests ([#798](https://github.com/MetaMask/ocap-kernel/pull/798))
- Add silent Vitest reporter ([#792](https://github.com/MetaMask/ocap-kernel/pull/792))
- Add Turborepo caching for test:dev and fix streams dev tests ([#757](https://github.com/MetaMask/ocap-kernel/pull/757))
- Add Node.js e2e tests and fix shutdown handling ([#692](https://github.com/MetaMask/ocap-kernel/pull/692))
- First pass of support for kernel-kernel network comms ([#578](https://github.com/MetaMask/ocap-kernel/pull/578))

### Changed

- **BREAKING:** Drop Node 20 support ([#837](https://github.com/MetaMask/ocap-kernel/pull/837))

## [0.4.0]

### Changed

- Dual-license package under MIT and/or Apache 2.0 ([#601](https://github.com/MetaMask/ocap-kernel/pull/601))

## [0.3.0]

### Changed

- Bump Endo and Agoric dependencies ([#590](https://github.com/MetaMask/ocap-kernel/pull/590), [#543](https://github.com/MetaMask/ocap-kernel/pull/543))
- Use `@metamask/logger` ([#559](https://github.com/MetaMask/ocap-kernel/pull/559))

## [0.2.0]

### Added

- Make export paths compatible with Browserify ([#533](https://github.com/MetaMask/ocap-kernel/pull/533))

## [0.1.0]

### Added

- Initial release.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-store@0.5.0...HEAD
[0.5.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-store@0.4.0...@metamask/kernel-store@0.5.0
[0.4.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-store@0.3.0...@metamask/kernel-store@0.4.0
[0.3.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-store@0.2.0...@metamask/kernel-store@0.3.0
[0.2.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-store@0.1.0...@metamask/kernel-store@0.2.0
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/kernel-store@0.1.0
