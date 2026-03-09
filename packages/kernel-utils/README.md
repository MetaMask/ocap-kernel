# `utils`

Ocap Kernel utilities.

## Installation

`yarn add @metamask/kernel-utils`

or

`npm install @metamask/kernel-utils`

## SES/Lockdown Compatibility

This package is designed to run under [SES](https://github.com/endojs/endo/tree/master/packages/ses) (Secure ECMAScript lockdown). One of its dependencies, `@chainsafe/libp2p-yamux`, requires a patch to work in a locked-down environment. The required patches are listed in the `patchedDependencies` field of this package's `package.json`, and the patch files are included in the `patches/` directory of this package.

Apply them using [`patch-package`](https://github.com/ds300/patch-package):

1. Install `patch-package`:

   ```sh
   npm install --save-dev patch-package
   ```

2. Copy the patch file(s) to your project's `patches/` directory:

   ```sh
   cp node_modules/@metamask/kernel-utils/patches/* patches/
   ```

3. Add a `postinstall` script to your `package.json`:

   ```json
   "scripts": {
     "postinstall": "patch-package"
   }
   ```

4. Run `npm install` (or your package manager's equivalent) to apply the patches.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
