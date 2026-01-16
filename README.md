# Ocap Kernel Monorepo

Welcome to the Ocap Kernel team's monorepo! It is a work in progress.

## Usage

For detailed information on how to use the OCAP Kernel, please refer to the [OCAP Kernel Usage Guide](docs/usage.md) which provides comprehensive documentation on setting up, configuring, and using the kernel in both browser and Node.js environments.

### Kernel Control Panel

You can launch a browser-based Kernel Control Panel to interact with and manage vats:

```bash
yarn workspace @ocap/extension run start
```

This will:

- Launch a development server serving the extension
- Set up a default cluster configuration
- Serve sample vat bundles
- Provide a UI for managing and interacting with the kernel and vats

The control panel allows you to:

- Launch vats
- View vat status
- Test kernel functionality
- Send messages to objects in vats
- **Inspect the database**: The control panel includes a built-in SQLite database inspector powered by SQLite WASM, allowing you to directly view and query the kernel's database through the browser interface. This is especially valuable since the kernel uses SQLite for persistence and would otherwise be difficult to inspect.

## Contributing

To get started:

- `yarn install`
- `yarn build`
  - This will build the entire monorepo in the correct order.
    You may need to re-run it if multiple packages have changed.
  - Note that some packages, e.g. `extension` `shims`, have special build processes.

Lint using `yarn lint` or `yarn lint:fix` from the root.

Note that the root package `test` script, as well as those of many packages, require
`yarn build` to be run first.

### Writing tests

The kernel's code relies extensively on SES / lockdown. Many Agoric packages fail if
they are executed in a non-locked down environment. For this reason, tests should
generally be run under lockdown. This can, however, make it difficult to debug tests.
For this reason, our unit tests have a `development` mode, which can be used to
disable lockdown for debugging purposes. `development` mode always disables coverage
collection, but it does not disable lockdown in all packages. `development` mode
tests don't have to pass, and are not run in CI; they are for local debugging
purposes only.

### Running tests

- `yarn test` - Run all tests with coverage (uses root vitest config)
- `yarn test:dev` - Run tests via Turborepo with caching (faster for repeated runs)
- `yarn test:dev --filter=@ocap/kernel` - Run tests for a specific package

To reduce output verbosity:

```bash
# Suppress successful test output entirely (turbo option)
yarn test:dev --output-logs=errors-only

# Use compact dot reporter instead of full test names (vitest option, passed to each package)
yarn test:dev -- --reporter=dot
```

### Adding new packages

See [`packages/create-package/README.md`](packages/create-package/README.md).

### Releasing

For information on creating releases, see the [MetaMask/core release documentation](https://github.com/MetaMask/core/blob/main/docs/contributing.md#releasing-changes).

## References

- [Glossary](./docs/glossary.md)
