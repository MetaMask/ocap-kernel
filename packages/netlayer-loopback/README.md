# `@metamask/netlayer-loopback`

In-process hub netlayer: the standard netlayer test fake and an embedded
multi-kernel transport.

An explicit `LoopbackHub` object routes messages between `@metamask/netlayer`
`Netlayer` instances in the same JavaScript realm, keyed by neutral peerId.
Two in-process kernels connect by being given the same hub instance. It
implements the full `Netlayer` contract without channels, handshakes, rate
limiting, or backoff — enough to exercise the kernel/PlatformServices path and
prove the netlayer contract is not libp2p-shaped.

## Installation

`yarn add @metamask/netlayer-loopback`

or

`npm install @metamask/netlayer-loopback`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
