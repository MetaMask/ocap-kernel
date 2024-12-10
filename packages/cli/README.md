# `cli`

Ocap Kernel cli.

## Commands

### `ocap bundle <targets..>`

Bundle the supplied file or directory targets. Expects each target to be a `.js` file or a directory containing `.js` files. Each `<file>.js` file will be bundled using `@endo/bundle-source` and written to an associated `<file>.bundle`.

### `ocap watch <dir>`

Watch the directory `dir` for changes to `.js` files. Any new or edited `<file>.js` will be bundled to `<file>.bundle`. Any deleted `.js` file will have its associated bundle deleted, too.

### `ocap serve <dir> [-p port]`

Serve the `.bundle` files in `dir` on `localhost:<port>`.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
