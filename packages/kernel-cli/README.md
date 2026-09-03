# `@metamask/kernel-cli`

Ocap Kernel CLI tool for bundling and serving vat bundles.

## Installation

`yarn add @metamask/kernel-cli`

or

`npm install @metamask/kernel-cli`

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

### `ocap daemon purge --force`

Stop the daemon and delete all state.

### `ocap daemon exec [method] [params-json]`

Send an RPC method call to the daemon. Defaults to `getStatus` when `method` is omitted.

## Trust Model of the Control Socket

**Anyone who can open the daemon's Unix socket controls the kernel.** The socket
has no authentication, and none is planned: `launchSubcluster` runs vat code from
a caller-supplied `bundleSpec` in a worker thread of the daemon process, and
`queueMessage` invokes any method on any object the kernel holds — krefs are
sequentially numbered, so a caller can simply enumerate them. There is no useful
subset of the RPC surface that a partially-trusted caller could safely be given.

Authorization is therefore entirely filesystem permissions, and the daemon sets
them explicitly rather than inheriting the ambient umask:

- `$OCAP_HOME` (default `~/.ocap`) is `0700`, applied on every start so a
  directory created by an older version is brought forward too.
- `daemon.sock` is `0600`.

Two consequences worth being deliberate about:

- Anything that can read `$OCAP_HOME` can also read `kernel.sqlite` directly.
  The socket mode is not the only thing protecting kernel state.
- Pointing `$OCAP_SOCKET_PATH` at a shared directory such as `/tmp` moves the
  socket out from behind the `0700` directory. The `0600` mode still holds, but
  the socket is then only as private as its own mode.

These modes are POSIX-only. Windows is not a supported platform for the daemon.

### Dev-only methods

`executeDBQuery`, `clearState`, and `terminateAllVats` are withheld unless the
daemon is started with `OCAP_DEV_MODE=true`:

```sh
OCAP_DEV_MODE=true ocap daemon start
```

`executeDBQuery` is the one that motivates the flag — it runs caller-supplied SQL
against kernel state, which is indispensable while debugging and has no place in
a deployed configuration. In default mode its handler is not registered at all,
so nothing reachable from the socket can call it.

`clearState` joins it as the whole-kernel `reset()`, and `terminateAllVats` for
symmetry. Per-vat operations (`terminateVat`, `terminateSubcluster`, `revoke`)
are part of normal operation and stay reachable, so this narrows the surface
without being a security boundary — see the trust model above.

The flag is read once, when the daemon starts. If `ocap daemon exec` reports a
method as dev-only despite `OCAP_DEV_MODE=true`, an already-running daemon is
serving the request; `ocap daemon stop` and start again.

## Known Limitations

The daemon is a prototype. The following limitations apply:

1. **No daemon spawn concurrency protection** — if two CLI invocations run simultaneously and neither finds a running daemon, both may attempt to spawn one. A lockfile mechanism would prevent this.
2. **No request size limits** — the RPC server buffers incoming data without a size cap. A malicious client could exhaust daemon memory.
3. **No log rotation** — `daemon.log` grows without bound. Production use should add log rotation.
4. **PID file is vulnerable to PID reuse** — if the daemon crashes without cleaning up `daemon.pid` and the OS reassigns that PID to an unrelated process, `stopDaemon` may signal the wrong process. A lockfile (`flock`) mechanism would eliminate this risk (and also solve limitation #1).

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/Consensys-Incorporated/ocap-kernel#readme).
