# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0]

### Changed

- **BREAKING:** Adopt branded string types for kernel identifiers ([#917](https://github.com/MetaMask/ocap-kernel/pull/917), [#921](https://github.com/MetaMask/ocap-kernel/pull/921))
- Bump `@metamask/design-system-react` to `^0.10.0` ([#885](https://github.com/MetaMask/ocap-kernel/pull/885))
- Improve `SendMessageForm` error display ([#879](https://github.com/MetaMask/ocap-kernel/pull/879))

### Fixed

- Fix type error in `PanelContext` pending request queue ([#908](https://github.com/MetaMask/ocap-kernel/pull/908))

## [0.4.0]

### Added

- Add Remote Comms UI panel ([#637](https://github.com/MetaMask/ocap-kernel/pull/637))
  - Update `RemoteComms` status display to use `state` (`'connected'` | `'identity-only'` | `'disconnected'`) instead of `isInitialized` boolean ([#823](https://github.com/MetaMask/ocap-kernel/pull/823))
- Include error details in garbage collection failure messages ([#578](https://github.com/MetaMask/ocap-kernel/pull/578))

### Changed

- **BREAKING:** Drop Node 20 support ([#837](https://github.com/MetaMask/ocap-kernel/pull/837))
- Remove `reload` kernel action and `reloadSubcluster` from UI controls ([#836](https://github.com/MetaMask/ocap-kernel/pull/836))
- Update MetaMask design system dependencies and React peer dependency to v18 ([#746](https://github.com/MetaMask/ocap-kernel/pull/746))
- Use `connectToKernel` instead of `establishKernelConnection` for kernel stream setup ([#709](https://github.com/MetaMask/ocap-kernel/pull/709))

### Fixed

- Move `react` and `react-dom` to `peerDependencies` and fix build externals ([#652](https://github.com/MetaMask/ocap-kernel/pull/652))

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

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-ui@0.5.0...HEAD
[0.5.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-ui@0.4.0...@metamask/kernel-ui@0.5.0
[0.4.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-ui@0.3.0...@metamask/kernel-ui@0.4.0
[0.3.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-ui@0.2.0...@metamask/kernel-ui@0.3.0
[0.2.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-ui@0.1.0...@metamask/kernel-ui@0.2.0
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/kernel-ui@0.1.0
