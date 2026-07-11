# `@metamask/netlayer-libp2p`

libp2p netlayer implementation for the ocap kernel.

This package implements the `@metamask/netlayer` contract over libp2p. It exports
the browser-default factory (`libp2pNetlayerFactory`) from its main entry, a
Node.js factory with direct QUIC/TCP transports from the `./nodejs` subpath, and
the circuit-relay server (`startRelay`) from the `./relay` subpath.

## Installation

`yarn add @metamask/netlayer-libp2p`

or

`npm install @metamask/netlayer-libp2p`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
