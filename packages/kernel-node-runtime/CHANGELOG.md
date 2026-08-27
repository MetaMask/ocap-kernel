# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `onRunLoopFailure` to `makeKernel`, forwarded to `Kernel.make` and called with the error that killed the kernel's run loop ([#1005](https://github.com/MetaMask/ocap-kernel/pull/1005))

### Changed

- **BREAKING:** `makeIOChannelFactory` is now `makeIOListenerFactory`, and `makeSocketIOChannel` is now `makeSocketIOListener`. The Unix-socket server hands each connection to `accept()` as its own `IOChannel`, whose receive buffer, decoder, line queue, and reader queue are local to that connection, so any number of peers can be served concurrently. Connections arriving before `accept()` is called are queued rather than dropped. Gone with the single-client design: the shared `currentSocket`, the session-boundary latch, the merged line queue, and the `socket.destroy()` that rejected every second connection ([#1007](https://github.com/MetaMask/ocap-kernel/pull/1007))
- **BREAKING:** Drop `platformOptions.fetch` from `makeNodeJsVatSupervisor` ([#942](https://github.com/MetaMask/ocap-kernel/pull/942))
  - `fetch` is now a vat endowment; stub `globalThis.fetch` directly if needed

### Fixed

- `makeKernel` gives the kernel store a logger, so the SQLite driver's diagnostics reach the log rather than nowhere ([#1021](https://github.com/MetaMask/ocap-kernel/pull/1021))
- The RPC socket server refuses to bind a Unix socket that has a live listener, rather than unlinking it and orphaning the previous owner; stale socket files with no listener are still cleaned up automatically ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))

## [0.1.0]

### Added

- Initial release.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-node-runtime@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/kernel-node-runtime@0.1.0
