# `@ocap/nodejs`

For running Ocap Kernel experiments in a Node.js environment

## Installation

`yarn add @ocap/nodejs`

or

`npm install @ocap/nodejs`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).

## End-to-End Tests

Navigate to package root.

```sh
cd ~/path/to/ocap-kernel/packages/nodejs
```

If it's not already running, start the `@ocap/cli` in `kernel-test/src/vats/default`.

```sh
yarn ocap start ../kernel-test/src/vats/default
```

Then, run the end to end tests.

```sh
yarn test:e2e
```
