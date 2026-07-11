# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release: the libp2p netlayer implementation, extracted from `@metamask/ocap-kernel` ([#973](https://github.com/MetaMask/ocap-kernel/pull/973))
  - `.` (browser default) exports `libp2pNetlayerFactory` plus `makeLibp2pNetlayer`, `Libp2pNetlayerConfig`/`Libp2pNetlayerConfigStruct`, and `DirectTransport`
  - `./nodejs` exports `nodejsLibp2pNetlayerFactory` (QUIC/TCP direct transports) and `buildDirectTransports`
  - `./relay` exports `startRelay` (the circuit-relay server, moved from `@metamask/kernel-utils/libp2p`)
  - `error-mapper.ts` maps raw libp2p read/dial errors onto the neutral `@metamask/kernel-errors` classes and owns the libp2p-specific retryability classification (`MuxerClosedError`/`Dial`/`Transport`/`NO_RESERVATION`)
- Document SES/lockdown handling for the libp2p dependency tree in the README (this package, not the kernel, owns those deps and any lockdown patches) and link the [writing a netlayer](../../docs/writing-a-netlayer.md) guide ([#974](https://github.com/MetaMask/ocap-kernel/pull/974))

[Unreleased]: https://github.com/MetaMask/ocap-kernel/
