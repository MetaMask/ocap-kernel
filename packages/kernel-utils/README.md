# `utils`

Ocap Kernel utilities.

## Installation

`yarn add @metamask/kernel-utils`

or

`npm install @metamask/kernel-utils`

## SES/Lockdown Compatibility

This package is designed to run under [SES](https://github.com/endojs/endo/tree/master/packages/ses) (Secure ECMAScript lockdown). Some of its dependencies require patches to work in a locked-down environment. The required patch files are included in the `patches/` directory of this package and are applied automatically via the `postinstall` script using [`patch-package`](https://github.com/ds300/patch-package).

Add `patch-package` as a development dependency of your project:

```sh
yarn add --dev patch-package
```

or

```sh
npm install --save-dev patch-package
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
