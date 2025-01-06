# Ocap Kernel Monorepo

Welcome to the Ocap Kernel team's monorepo! It is a work in progress.

## Contributing

To get started:

- `yarn install`
- `yarn build`
  - This will build the entire monorepo in the correct order.
    You may need to re-run it if multiple packages have changed.
  - Note that some packages, e.g. `extension` `shims`, have special build processes.

Lint using `yarn lint` or `yarn lint:fix` from the root.
