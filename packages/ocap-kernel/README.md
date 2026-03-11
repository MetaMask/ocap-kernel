# `@metamask/ocap-kernel`

Ocap Kernel core components.

## Installation

`yarn add @metamask/ocap-kernel`

or

`npm install @metamask/ocap-kernel`

## SES/Lockdown Compatibility

This package runs under [SES](https://github.com/endojs/endo/tree/master/packages/ses) (Secure ECMAScript lockdown). Some dependencies require patches to work in this environment. These patches are shipped by [`@metamask/kernel-utils`](../kernel-utils) and applied automatically via its `postinstall` script. See that package's README for details.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
