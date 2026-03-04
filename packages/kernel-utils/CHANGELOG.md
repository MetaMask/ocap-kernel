# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0]

### Added

- Add daemon process with ocap daemon CLI ([#843](https://github.com/MetaMask/ocap-kernel/pull/843))
- Consolidate extension console logs and capture in Playwright tests ([#798](https://github.com/MetaMask/ocap-kernel/pull/798))
- Add silent Vitest reporter ([#792](https://github.com/MetaMask/ocap-kernel/pull/792))
- Add controller architecture ([#752](https://github.com/MetaMask/ocap-kernel/pull/752))
- Add Turborepo caching for test:dev and fix streams dev tests ([#757](https://github.com/MetaMask/ocap-kernel/pull/757))
- Add makeDiscoverableExo constructor ([#705](https://github.com/MetaMask/ocap-kernel/pull/705))
- Automatic reconnection with exponential backoff for remote comms ([#678](https://github.com/MetaMask/ocap-kernel/pull/678))
- Prevent overriding endowment names ([#619](https://github.com/MetaMask/ocap-kernel/pull/619))
- First pass of support for kernel-kernel network comms ([#578](https://github.com/MetaMask/ocap-kernel/pull/578))

### Changed

- Drop Node 20 support ([#837](https://github.com/MetaMask/ocap-kernel/pull/837))
- Bundle vats with vite ([#763](https://github.com/MetaMask/ocap-kernel/pull/763))
- Update MetaMask ESLint dependencies and fix JSDoc compliance ([#741](https://github.com/MetaMask/ocap-kernel/pull/741))
- Add Claude Code commands for common development and git workflows ([#725](https://github.com/MetaMask/ocap-kernel/pull/725))
- Update vite & vitest dependencies to latest versions ([#717](https://github.com/MetaMask/ocap-kernel/pull/717))
- Clean up `__dirname` use ([#701](https://github.com/MetaMask/ocap-kernel/pull/701))
- Fix flaky network tests by mocking classes instead of libp2p ([#693](https://github.com/MetaMask/ocap-kernel/pull/693))
- Clean script removes .turbo cache ([#643](https://github.com/MetaMask/ocap-kernel/pull/643))
- Add `@ocap/repo-tools` ([#641](https://github.com/MetaMask/ocap-kernel/pull/641))
- Use Turborepo for root build script ([#634](https://github.com/MetaMask/ocap-kernel/pull/634))
- Migrate from `Far` to `makeExo` ([#612](https://github.com/MetaMask/ocap-kernel/pull/612))

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
