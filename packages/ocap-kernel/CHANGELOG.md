# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- feat(kernel): Wait for crank to run kernel actions ([#595](https://github.com/MetaMask/ocap-kernel/pull/595))
- chore: Bump Vite and Vitest, silence warnings ([#592](https://github.com/MetaMask/ocap-kernel/pull/592))
- chore: Bump Endo and Agoric dependencies ([#590](https://github.com/MetaMask/ocap-kernel/pull/590))
- chore: Bump vitest -> 3.2.4 ([#587](https://github.com/MetaMask/ocap-kernel/pull/587))
- feat(kernel-ui): Use MetaMask extension's design system ([#577](https://github.com/MetaMask/ocap-kernel/pull/577))
- feat(ocap-kernel): Throw if subcluster launch fails ([#566](https://github.com/MetaMask/ocap-kernel/pull/566))
- fix: Remove redundant kernel promise ref count increment ([#565](https://github.com/MetaMask/ocap-kernel/pull/565))
- feat(ocap-kernel,kernel-store): Migrate console -> logger ([#559](https://github.com/MetaMask/ocap-kernel/pull/559))
- feat: Add kernel service object support ([#563](https://github.com/MetaMask/ocap-kernel/pull/563))

## [0.3.0]

### Added

- Add `revoke` kernel command ([#544](https://github.com/MetaMask/ocap-kernel/pull/544))
- Support multiple subclusters ([#530](https://github.com/MetaMask/ocap-kernel/pull/530))

### Removed

- Remove support for launching vats outside a subcluster ([#535](https://github.com/MetaMask/ocap-kernel/pull/535))

### Fixed

- Throwing from remotable method rejects result ([#545](https://github.com/MetaMask/ocap-kernel/pull/545))

## [0.2.0]

### Added

- Make export paths compatible with Browserify ([#533](https://github.com/MetaMask/ocap-kernel/pull/533))
- Properly handle syscall failures ([#520](https://github.com/MetaMask/ocap-kernel/pull/520))
- Add `Kernel.getStatus()` ([#522](https://github.com/MetaMask/ocap-kernel/pull/522))
- Use JSON-RPC notifications for vat syscalls ([#528](https://github.com/MetaMask/ocap-kernel/pull/528))

### Removed

- Remove `waitForSyscallsToComplete()` ([#527](https://github.com/MetaMask/ocap-kernel/pull/527))

## [0.1.0]

### Added

- Initial release.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/ocap-kernel@0.3.0...HEAD
[0.3.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/ocap-kernel@0.2.0...@metamask/ocap-kernel@0.3.0
[0.2.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/ocap-kernel@0.1.0...@metamask/ocap-kernel@0.2.0
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/ocap-kernel@0.1.0
