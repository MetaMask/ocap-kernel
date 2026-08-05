# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add global `--home <dir>` flag overriding `$OCAP_HOME` for the duration of one invocation, so multiple OCAP daemons can run side by side without juggling environment variables ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))
- Add `--public-ip <addr>` to `kernel relay start` (also reads `$LIBP2P_RELAY_PUBLIC_IP`); the relay announces the supplied IPv4 alongside its bound NIC addresses, so a NAT-backed VPS can be reached from off-host peers ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))
- More legible output from `kernel relay status` ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))

### Changed

- The daemon log filters entries below a minimum severity, defaulting to `info`, so high-volume `debug` output (refcount churn and similar) no longer dominates `daemon.log`; set `$OCAP_DAEMON_LOG_LEVEL` to `debug` to record everything again ([#1008](https://github.com/MetaMask/ocap-kernel/pull/1008))
- Relay state files (`relay.pid`, `relay.addr`) now live in their own directory (default `~/.libp2p-relay`, overridable via `$LIBP2P_RELAY_HOME`) instead of under `$OCAP_HOME`, so one libp2p relay can serve daemons with different OCAP_HOMEs ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))

### Fixed

- `kernel daemon start` refuses to start when another daemon is already listening on the same Unix socket, instead of unlinking the socket and orphaning the running process ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))
- Daemon fatal-path visibility: `daemon-entry` now installs handlers for `uncaughtException`, `unhandledRejection`, `SIGHUP`, and `exit` that append a synchronous fingerprint line to `daemon.log` before terminating ([#966](https://github.com/MetaMask/ocap-kernel/pull/966))
  - Without these, silent daemon deaths under `stdio: 'ignore'` (the CLI's default spawn mode) left no trace in the log; the operator saw only that the daemon was gone. Every terminating path now leaves at least one line.
- The daemon logs the failure and shuts down with a non-zero exit code when the kernel's run loop dies, instead of staying up with a socket that answers RPCs for a kernel that processes nothing ([#1005](https://github.com/MetaMask/ocap-kernel/pull/1005))
  - A death during startup aborts `daemon start` rather than publishing a socket and pid file for a dead kernel
  - An aborted startup stops the kernel before closing the database, bounded at 10 seconds, and then terminates the process. `Kernel.make` launches a worker thread per persisted vat, and `stop` reaches those workers only after writing the last-active timestamp, so closing the database first made that write throw and left the workers running — and a live worker thread keeps the event loop open, so an exit code alone never took effect
  - The shutdown is bounded at 10 seconds and exits immediately if it throws, removing the pid file first. A `kernel.stop()` that throws would otherwise leave an orphan holding `kernel.sqlite` with its socket gone and its pid file already cleaned up, invisible to both start-time interlocks; one that merely stalls stays visible to the pid interlock but is an orphan all the same
  - Failures are logged with their `cause` chain, so a run loop death reported through a failed crank rollback still names the error that actually killed the kernel
  - Logging is best-effort: the transport is `appendFileSync`, so a full disk would otherwise throw and take the shutdown with it, leaving up the daemon this exists to bring down

## [0.1.0]

### Added

- Initial release.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-cli@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/kernel-cli@0.1.0
