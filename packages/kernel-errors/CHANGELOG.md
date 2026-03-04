# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0]

### Added

- Add permanent failure detection for reconnection ([#789](https://github.com/MetaMask/ocap-kernel/pull/789))
- Consolidate extension console logs and capture in Playwright tests ([#798](https://github.com/MetaMask/ocap-kernel/pull/798))
- Add silent Vitest reporter ([#792](https://github.com/MetaMask/ocap-kernel/pull/792))
- Add rate limiting for messages and connections ([#776](https://github.com/MetaMask/ocap-kernel/pull/776))
- Add Turborepo caching for test:dev and fix streams dev tests ([#757](https://github.com/MetaMask/ocap-kernel/pull/757))
- Add resource limits for remote communications ([#714](https://github.com/MetaMask/ocap-kernel/pull/714))
- Add REPL agent ([#695](https://github.com/MetaMask/ocap-kernel/pull/695))
- Automatic reconnection with exponential backoff for remote comms ([#678](https://github.com/MetaMask/ocap-kernel/pull/678))
- Prevent overriding endowment names ([#619](https://github.com/MetaMask/ocap-kernel/pull/619))
- First pass of support for kernel-kernel network comms ([#578](https://github.com/MetaMask/ocap-kernel/pull/578))

### Changed

- Drop Node 20 support ([#837](https://github.com/MetaMask/ocap-kernel/pull/837))
- Update MetaMask ESLint dependencies and fix JSDoc compliance ([#741](https://github.com/MetaMask/ocap-kernel/pull/741))
- Add Claude Code commands for common development and git workflows ([#725](https://github.com/MetaMask/ocap-kernel/pull/725))
- Update vite & vitest dependencies to latest versions ([#717](https://github.com/MetaMask/ocap-kernel/pull/717))
- Clean up `__dirname` use ([#701](https://github.com/MetaMask/ocap-kernel/pull/701))
- Enable `n/prefer-node-protocol` ESLint rule ([#647](https://github.com/MetaMask/ocap-kernel/pull/647))
- Clean script removes .turbo cache ([#643](https://github.com/MetaMask/ocap-kernel/pull/643))
- Add `@ocap/repo-tools` ([#641](https://github.com/MetaMask/ocap-kernel/pull/641))
- Use Turborepo for root build script ([#634](https://github.com/MetaMask/ocap-kernel/pull/634))

### Fixed

- Fix message queueing and add e2e tests ([#697](https://github.com/MetaMask/ocap-kernel/pull/697))
- Remove circular internal dependency relationships ([#630](https://github.com/MetaMask/ocap-kernel/pull/630))

## [0.4.0]

### Changed

- Dual-license package under MIT and/or Apache 2.0 ([#601](https://github.com/MetaMask/ocap-kernel/pull/601))

## [0.3.0]

### Changed

- Bump Endo and Agoric dependencies ([#590](https://github.com/MetaMask/ocap-kernel/pull/590))

## [0.2.0]

### Added

- Add `SubclusterNotFoundError` ([#530](https://github.com/MetaMask/ocap-kernel/pull/530))

## [0.1.0]

### Added

- Initial release.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-errors@0.5.0...HEAD
[0.5.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-errors@0.4.0...@metamask/kernel-errors@0.5.0
[0.4.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-errors@0.3.0...@metamask/kernel-errors@0.4.0
[0.3.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-errors@0.2.0...@metamask/kernel-errors@0.3.0
[0.2.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-errors@0.1.0...@metamask/kernel-errors@0.2.0
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/kernel-errors@0.1.0
