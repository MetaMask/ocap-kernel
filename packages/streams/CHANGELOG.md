# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- fix(ci): cache and install Playwright browsers in e2e job ([#844](https://github.com/MetaMask/ocap-kernel/pull/844))
- chore: Drop Node 20 support ([#837](https://github.com/MetaMask/ocap-kernel/pull/837))
- feat: Consolidate extension console logs and capture in Playwright tests ([#798](https://github.com/MetaMask/ocap-kernel/pull/798))
- feat(repo-tools): Add silent Vitest reporter ([#792](https://github.com/MetaMask/ocap-kernel/pull/792))
- fix(deps): Update vulnerable dependencies to resolve security alerts ([#791](https://github.com/MetaMask/ocap-kernel/pull/791))
- feat: Add Turborepo caching for test:dev and fix streams dev tests ([#757](https://github.com/MetaMask/ocap-kernel/pull/757))
- chore(deps): Update MetaMask ESLint dependencies and fix JSDoc compliance ([#741](https://github.com/MetaMask/ocap-kernel/pull/741))
- chore: Skip certain postinstall steps in Dependabot contexts ([#743](https://github.com/MetaMask/ocap-kernel/pull/743))
- chore: Add Claude Code commands for common development and git workflows ([#725](https://github.com/MetaMask/ocap-kernel/pull/725))
- chore: Update vite & vitest dependencies to latest versions ([#717](https://github.com/MetaMask/ocap-kernel/pull/717))
- Clean up `__dirname` use ([#701](https://github.com/MetaMask/ocap-kernel/pull/701))
- chore(root): clean script removes .turbo cache ([#643](https://github.com/MetaMask/ocap-kernel/pull/643))
- refactor: Add `@ocap/repo-tools` ([#641](https://github.com/MetaMask/ocap-kernel/pull/641))
- build: Use Turborepo for root build script ([#634](https://github.com/MetaMask/ocap-kernel/pull/634))
- fix: Remove circular internal dependency relationships ([#630](https://github.com/MetaMask/ocap-kernel/pull/630))
- fix(kernel): Run with persistence ([#604](https://github.com/MetaMask/ocap-kernel/pull/604))

## [0.4.0]

### Changed

- Dual-license package under MIT and/or Apache 2.0 ([#601](https://github.com/MetaMask/ocap-kernel/pull/601))

### Removed

- Remove `/vat` export ([#600](https://github.com/MetaMask/ocap-kernel/pull/600))

## [0.3.0]

### Added

- Add remoteable iterators and generators ([#574](https://github.com/MetaMask/ocap-kernel/pull/574))

### Changed

- Bump Endo and Agoric dependencies ([#590](https://github.com/MetaMask/ocap-kernel/pull/590), [#543](https://github.com/MetaMask/ocap-kernel/pull/543))
- Use `@metamask/logger` ([#559](https://github.com/MetaMask/ocap-kernel/pull/559))

## [0.2.0]

### Added

- Make export paths compatible with Browserify ([#533](https://github.com/MetaMask/ocap-kernel/pull/533))

## [0.1.0]

### Added

- Initial release.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/streams@0.4.0...HEAD
[0.4.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/streams@0.3.0...@metamask/streams@0.4.0
[0.3.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/streams@0.2.0...@metamask/streams@0.3.0
[0.2.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/streams@0.1.0...@metamask/streams@0.2.0
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/streams@0.1.0
