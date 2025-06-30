# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0]

### Added

- Add eventual send shim ([#536](https://github.com/MetaMask/ocap-kernel/pull/536))

### Fixed

- Enable `sideEffects` in `package.json` ([#522](https://github.com/MetaMask/ocap-kernel/pull/522))
  - This indicates to bundlers and other tools that imports from this package may cause side effects, as they all do.

## [0.1.0]

### Added

- Initial release.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-shims@0.3.0...HEAD
[0.3.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-shims@0.2.0...@metamask/kernel-shims@0.3.0
[0.2.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-shims@0.1.0...@metamask/kernel-shims@0.2.0
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/kernel-shims@0.1.0
