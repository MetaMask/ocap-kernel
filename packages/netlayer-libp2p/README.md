# `@metamask/netlayer-libp2p`

libp2p netlayer implementation for the ocap kernel.

This package implements the [`@metamask/netlayer`](../netlayer/README.md) contract over
libp2p, and is one reference implementation for [writing a
netlayer](../../docs/writing-a-netlayer.md). It exports the browser-default factory
(`libp2pNetlayerFactory`) from its main entry, a Node.js factory with direct QUIC/TCP
transports from the `./nodejs` subpath, and the circuit-relay server (`startRelay`) from the
`./relay` subpath.

## SES/Lockdown compatibility

This package owns the ocap-kernel's libp2p dependency tree (`libp2p`, `@libp2p/*`,
`@chainsafe/*`, `@multiformats/*`), which must run under [SES](https://github.com/endojs/endo/tree/master/packages/ses)
lockdown along with the rest of the kernel. Because libp2p's dependency graph lives here
rather than in `@metamask/ocap-kernel`, any lockdown-compatibility patches for libp2p
transitive dependencies (historically `@chainsafe/libp2p-yamux`) are the concern of this
package and the monorepo's patch handling, not of the kernel core.

## Installation

`yarn add @metamask/netlayer-libp2p`

or

`npm install @metamask/netlayer-libp2p`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
