# Ocap Kernel Monorepo

Welcome to the Ocap Kernel team's monorepo! It is a work in progress.

## Documentation

For detailed information on how to use the OCAP Kernel, please refer to the [GUIDE.md](GUIDE.md) file, which provides comprehensive documentation on setting up, configuring, and using the kernel in both browser and Node.js environments.

### Kernel Control Panel

You can launch a browser-based Kernel Control Panel to interact with and manage vats:

1. Navigate to the extension package:

```bash
cd packages/extension
```

2. Start the development server:

```bash
yarn start
```

3. This will:
   - Launch a development server serving the extension
   - Set up a default cluster configuration
   - Serve sample vat bundles
   - Provide a UI for managing and interacting with the kernel and vats

The control panel allows you to launch vats, send messages, view vat status, and test kernel functionality.

## Contributing

To get started:

- `yarn install`
- `yarn build`
  - This will build the entire monorepo in the correct order.
    You may need to re-run it if multiple packages have changed.
  - Note that some packages, e.g. `extension` `shims`, have special build processes.

Lint using `yarn lint` or `yarn lint:fix` from the root.

Note that the root package `test` script, as well as those of many packages, require
`yarn build && yarn build:vats` to be run first.

### Writing tests

The kernel's code relies extensively on SES / lockdown. Many Agoric packages fail if
they are executed in a non-locked down environment. For this reason, tests should
generally be run under lockdown. This can, however, make it difficult to debug tests.
For this reason, our unit tests have a `development` mode, which can be used to
disable lockdown for debugging purposes. `development` mode always disables coverage
collection, but it does not disable lockdown in all packages. `development` mode
tests don't have to pass, and are not run in CI; they are for local debugging
purposes only.

### Adding new packages

See [`packages/create-package/README.md`](packages/create-package/README.md).
