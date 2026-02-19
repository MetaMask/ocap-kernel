# `cli`

Ocap Kernel cli.

## Commands

### `ocap bundle <targets..>`

Bundle the supplied file or directory targets. Expects each target to be a `.js` file or a directory containing `.js` files. Each `<file>.js` file will be bundled using `vite` and written to an associated `<file>.bundle`.

### `ocap watch <dir>`

Watch the directory `dir` for changes to `.js` files. Any new or edited `<file>.js` will be bundled to `<file>.bundle`. Any deleted `.js` file will have its associated bundle deleted, too.

### `ocap serve <dir> [-p port]`

Serve the `.bundle` files in `dir` on `localhost:<port>`.

### `ocap start <dir> [-p port]`

Bundle all `.js` files in the target dir, watch for changes to `.js` files and rebundle, and serve bundles from the target dir on the provided port.

### `ocap relay`

Starts a libp2p relay.

### `ocap daemon start`

Start the daemon or confirm it is already running.

### `ocap daemon stop`

Gracefully stop the daemon.

### `ocap daemon begone --forgood`

Stop the daemon and delete all state.

### `ocap daemon exec [method] [params-json]`

Send an RPC method call to the daemon. Defaults to `getStatus` when `method` is omitted.

## Known Limitations

The daemon is a prototype. The following limitations apply:

1. **`executeDBQuery` accepts arbitrary SQL** — any CLI user can execute unrestricted SQL against the kernel database. For production, this should be removed or restricted to read-only queries.
2. **No socket permission enforcement** — the Unix socket is created with default permissions. Any local user can connect and issue commands. For production, socket permissions should be restricted to `0o600`.
3. **No daemon spawn concurrency protection** — if two CLI invocations run simultaneously and neither finds a running daemon, both may attempt to spawn one. A lockfile mechanism would prevent this.
4. **No request size limits** — the RPC server buffers incoming data without a size cap. A malicious client could exhaust daemon memory.
5. **No log rotation** — `daemon.log` grows without bound. Production use should add log rotation.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
