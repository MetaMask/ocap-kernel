# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Plugins now reach the kernel through the `@ocap/ocap-jsonrpc-vat` Unix socket instead of shell-execing `ocap daemon queueMessage` / `ocap daemon redeem-url` per call
  - `DaemonCaller` maintains a persistent JSON-RPC 2.0 connection over the socket for the caller's lifetime
  - Config keys `ocapCliPath` (both plugins) removed; `socketPath` added (falls back to `<ocapHome>/ocap-jsonrpc.sock`)
  - Plugin state (`ContactEntry.ref`, `ServiceEntry.ref`, `CapEntry.ref`, `WalletSlot.ref`) tracks `@@o<n>` sigil strings rather than raw krefs; `isKref`/`parseCapabilityResponse` replaced by `isRef`

[Unreleased]: https://github.com/MetaMask/ocap-kernel/
