# `@metamask/netlayer`

Transport-neutral netlayer contract and channel-session engine for the ocap-kernel.

This package defines the kernel-facing `Netlayer` contract, the internal
`NetworkChannel`/`ChannelProvider` seam, the channel-session engine
(`makeChannelNetlayer`), the shared machinery it composes (peer-state tracking,
reconnection/backoff, rate limiting, validators, versioned handshake), and the
neutral Ed25519 identity helpers. Netlayer implementations depend on this
package rather than on the whole kernel; `@metamask/ocap-kernel` re-exports the
contract types.

For a guide to implementing a netlayer against these contracts, see [writing a
netlayer](../../docs/writing-a-netlayer.md).

## Installation

`yarn add @metamask/netlayer`

or

`npm install @metamask/netlayer`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
