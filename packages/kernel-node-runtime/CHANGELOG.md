# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** Drop `platformOptions.fetch` from `makeNodeJsVatSupervisor` ([#942](https://github.com/MetaMask/ocap-kernel/pull/942))
  - `fetch` is now a vat endowment; stub `globalThis.fetch` directly if needed

### Fixed

- The RPC socket server refuses to bind a Unix socket that has a live listener, rather than unlinking it and orphaning the previous owner; stale socket files with no listener are still cleaned up automatically ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))
- `makeSocketIOChannel`: surface every client disconnect through `read()`, even when no reader was pending at the moment of disconnect
  - `read()` now returns `null` once between client sessions to signal the boundary; without this, a `read()` that landed between the old client's disconnect and the new client's data would silently receive the new session's first line as if the two sessions were one
  - Also drops any queued-but-unread lines from a departing client so they can't leak into the next session's traffic

## [0.1.0]

### Added

- Initial release.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-node-runtime@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/kernel-node-runtime@0.1.0
