# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Rename the libp2p e2e test helper's kernel-level location-hint options (`maxUrlRelayHints`/`maxKnownRelays` → `maxUrlLocationHints`/`maxKnownLocationHints`) to follow the ocap-kernel rename; internal test-only change with no consumer-facing effect ([#974](https://github.com/MetaMask/ocap-kernel/pull/974))
- **BREAKING:** `NodejsPlatformServices` now requires a `netlayers: NetlayerRegistry` construction argument, and `initializeRemoteComms` takes the neutral options bag. `makeKernel` builds the default registry (`{ libp2p: nodejsLibp2pNetlayerFactory }`) and accepts an optional `netlayers` override. QUIC/TCP direct-transport sniffing and the direct libp2p transport deps move to `@metamask/netlayer-libp2p/nodejs` ([#973](https://github.com/MetaMask/ocap-kernel/pull/973))
- **BREAKING:** Drop `platformOptions.fetch` from `makeNodeJsVatSupervisor` ([#942](https://github.com/MetaMask/ocap-kernel/pull/942))
  - `fetch` is now a vat endowment; stub `globalThis.fetch` directly if needed

### Fixed

- The RPC socket server refuses to bind a Unix socket that has a live listener, rather than unlinking it and orphaning the previous owner; stale socket files with no listener are still cleaned up automatically ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))

## [0.1.0]

### Added

- Initial release.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-node-runtime@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/kernel-node-runtime@0.1.0
