# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- feat(kernel-errors): standardize kernel errors observable in vat-land ([#913](https://github.com/MetaMask/ocap-kernel/pull/913))
- chore: fix type error, upgrade turbo, suppress warnings ([#908](https://github.com/MetaMask/ocap-kernel/pull/908))
- feat: upgrade libp2p v2 to v3 ([#900](https://github.com/MetaMask/ocap-kernel/pull/900))

## [0.5.0]

### Added

- Add permanent failure detection and network error code utilities ([#789](https://github.com/MetaMask/ocap-kernel/pull/789))
- Add `isResourceLimitError()` utility ([#776](https://github.com/MetaMask/ocap-kernel/pull/776))
- Add `ResourceLimitError` error class ([#714](https://github.com/MetaMask/ocap-kernel/pull/714))
- Add `EvaluatorError` and `SampleGenerationError` error classes ([#695](https://github.com/MetaMask/ocap-kernel/pull/695))
- Add `AbortError` and `isRetryableNetworkError()` utility ([#678](https://github.com/MetaMask/ocap-kernel/pull/678))
- Add `DuplicateEndowmentError` ([#619](https://github.com/MetaMask/ocap-kernel/pull/619))

### Changed

- **BREAKING:** Drop Node 20 support ([#837](https://github.com/MetaMask/ocap-kernel/pull/837))

### Fixed

- Improve retryable network error detection ([#697](https://github.com/MetaMask/ocap-kernel/pull/697))

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
