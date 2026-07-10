# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release: the transport-neutral netlayer contract and channel-session engine, extracted from `@metamask/ocap-kernel` ([#972](https://github.com/MetaMask/ocap-kernel/pull/972))
  - Contract types `Netlayer`, `NetlayerHooks`, `NetlayerParams`, `NetlayerFactory`, `NetlayerSpecifier`, `NetlayerRegistry`, and the `NetworkChannel`/`ChannelProvider` channel seam (`ChannelProvider`/`Netlayer` carry a `readonly peerId`)
  - The channel-session engine `makeChannelNetlayer` and the shared machinery it composes: `PeerStateManager`, `ReconnectionManager`, `makeReconnectionLifecycle`, rate limiters, message-size/connection-limit validators, `makeErrorLogger`/`writeWithTimeout`, and the versioned handshake (`performInboundHandshake`/`performOutboundHandshake`/`isHandshakeMessage`/`HANDSHAKE_VERSION`)
  - The neutral Ed25519 identity helpers `deriveNeutralPeerId`, `neutralPeerIdToPublicKey`, and `publicKeyToNeutralPeerId` (multibase base58btc of the raw public key)

[Unreleased]: https://github.com/MetaMask/ocap-kernel/
