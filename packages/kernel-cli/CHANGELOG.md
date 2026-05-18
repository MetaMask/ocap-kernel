# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add global `--home <dir>` flag overriding `$OCAP_HOME` for the duration of one invocation, so multiple OCAP daemons can run side by side without juggling environment variables ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))
- Add `--public-ip <addr>` to `kernel relay start` (also reads `$LIBP2P_RELAY_PUBLIC_IP`); the relay announces the supplied IPv4 alongside its bound NIC addresses, so a NAT-backed VPS can be reached from off-host peers ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))
- More legible output from `kernel relay status` ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))
- Add `ocap session` subcommands: `list`, `get`, `requests`, and `decide`
- Add `ocap tui` and `ocap modal` commands to launch the terminal UI

### Changed

- Relay state files (`relay.pid`, `relay.addr`) now live in their own directory (default `~/.libp2p-relay`, overridable via `$LIBP2P_RELAY_HOME`) instead of under `$OCAP_HOME`, so one libp2p relay can serve daemons with different OCAP_HOMEs ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))

### Fixed

- `kernel daemon start` refuses to start when another daemon is already listening on the same Unix socket, instead of unlinking the socket and orphaning the running process ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))

## [0.1.0]

### Added

- Initial release.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-cli@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/kernel-cli@0.1.0
