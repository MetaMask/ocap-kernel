# Ocap Kernel Monorepo

Welcome to the Ocap Kernel team's monorepo! It is a work in progress.

## Usage

For detailed information on how to use the OCAP Kernel, please refer to:

- [Usage Guide](docs/usage.md) — Setting up, configuring, and running the kernel in browser and Node.js environments.
- [Kernel Guide](docs/kernel-guide.md) — Building on the kernel: writing vat code, kernel services, system subclusters, and persistence.

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

### Adding new packages

See [`packages/create-package/README.md`](packages/create-package/README.md).

### Updating changelogs

See [`docs/contributing/updating-changelogs.md`](docs/contributing/updating-changelogs.md).

### Releasing

For information on creating releases, see the [MetaMask/core release documentation](https://github.com/MetaMask/core/blob/d6ce6e1c917b1a05356df365281a5db83f500210/docs/processes/releasing.md).

### Patches

Some third-party dependencies require patches for SES/lockdown compatibility. The root
`patches/` directory is the single source of truth for all patches, applied automatically
on `yarn install` via `patch-package`.

Published packages that ship patches to consumers are called "sinks". Sinks are determined
by analyzing the dependency graph: a non-private package that directly depends on a patched
dependency is a sink if none of its transitive internal dependencies also depend on that
patched dependency. Only `dependencies` are considered for sink analysis (not
`peerDependencies` or `devDependencies`).

Sink packages include `patches/` in their `files` field, declare `patch-package` as a
`peerDependency`, and have a `postinstall` script that runs `patch-package --patch-dir patches`.
The `scripts/copy-patches.cjs` script copies root patches into each sink at publish time,
and `yarn constraints` enforces the correct configuration.

**Adding a patch:** Place the `.patch` file in the root `patches/` directory. Run
`yarn constraints --fix` to update sink packages, and verify with
`node scripts/copy-patches.cjs`.

**Removing a patch:** Delete the `.patch` file from the root `patches/` directory and run
`yarn constraints --fix` to clean up sink packages.

## References

- [Glossary](./docs/glossary.md)
- [Kernel Guide](./docs/kernel-guide.md)
