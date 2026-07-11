# `@metamask/ocap-kernel`

Ocap Kernel core components.

## Installation

`yarn add @metamask/ocap-kernel`

or

`npm install @metamask/ocap-kernel`

## SES/Lockdown Compatibility

This package is designed to run under [SES](https://github.com/endojs/endo/tree/master/packages/ses) (Secure ECMAScript lockdown) via `@metamask/kernel-shims`. Lockdown must be the first thing that runs in the realm. This package itself carries no network-transport dependencies, so it does not require any lockdown patches of its own; transport-specific lockdown considerations (e.g. libp2p's) live with the netlayer package that owns them — see [`@metamask/netlayer-libp2p`](../netlayer-libp2p/README.md).

## Remote communications

Cross-kernel networking is provided by a pluggable **netlayer**, not by any transport baked into this package. `@metamask/ocap-kernel` re-exports the netlayer contract types (`Netlayer`, `NetlayerHooks`, `NetlayerSpecifier`, `NetlayerRegistry`, `NetworkChannel`, `ChannelProvider`, …) from [`@metamask/netlayer`](../netlayer/README.md); a runtime supplies a `NetlayerRegistry` and each kernel selects one with a `NetlayerSpecifier`. Available netlayers are `@metamask/netlayer-loopback` (in-process) and `@metamask/netlayer-libp2p`. To implement a new one, see [writing a netlayer](../../docs/writing-a-netlayer.md).

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
