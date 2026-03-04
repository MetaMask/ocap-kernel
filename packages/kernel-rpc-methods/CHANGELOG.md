# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: Drop Node 20 support ([#837](https://github.com/MetaMask/ocap-kernel/pull/837))
- feat: Consolidate extension console logs and capture in Playwright tests ([#798](https://github.com/MetaMask/ocap-kernel/pull/798))
- feat(repo-tools): Add silent Vitest reporter ([#792](https://github.com/MetaMask/ocap-kernel/pull/792))
- Add message sequencing and acknowledgment to remote messaging ([#744](https://github.com/MetaMask/ocap-kernel/pull/744))
- feat: Add Turborepo caching for test:dev and fix streams dev tests ([#757](https://github.com/MetaMask/ocap-kernel/pull/757))
- chore(deps): Update MetaMask ESLint dependencies and fix JSDoc compliance ([#741](https://github.com/MetaMask/ocap-kernel/pull/741))
- chore: Add Claude Code commands for common development and git workflows ([#725](https://github.com/MetaMask/ocap-kernel/pull/725))
- chore: Update vite & vitest dependencies to latest versions ([#717](https://github.com/MetaMask/ocap-kernel/pull/717))
- Clean up `__dirname` use ([#701](https://github.com/MetaMask/ocap-kernel/pull/701))
- chore(root): clean script removes .turbo cache ([#643](https://github.com/MetaMask/ocap-kernel/pull/643))
- refactor: Add `@ocap/repo-tools` ([#641](https://github.com/MetaMask/ocap-kernel/pull/641))
- build: Use Turborepo for root build script ([#634](https://github.com/MetaMask/ocap-kernel/pull/634))
- First pass of support for kernel-kernel network comms ([#578](https://github.com/MetaMask/ocap-kernel/pull/578))

## [0.4.0]

### Changed

- Dual-license package under MIT and/or Apache 2.0 ([#601](https://github.com/MetaMask/ocap-kernel/pull/601))

## [0.3.0]

### Changed

- Bump Endo and Agoric dependencies ([#590](https://github.com/MetaMask/ocap-kernel/pull/590))

## [0.2.0]

### Changed

- Support `Promise<void>` in addition to `void` for result types ([#528](https://github.com/MetaMask/ocap-kernel/pull/528))

## [0.1.0]

### Added

- Initial release.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-rpc-methods@0.4.0...HEAD
[0.4.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-rpc-methods@0.3.0...@metamask/kernel-rpc-methods@0.4.0
[0.3.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-rpc-methods@0.2.0...@metamask/kernel-rpc-methods@0.3.0
[0.2.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-rpc-methods@0.1.0...@metamask/kernel-rpc-methods@0.2.0
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/kernel-rpc-methods@0.1.0
