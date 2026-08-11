# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Unified the `discovery` and `demo` openclaw plugins into a single plugin with id `ocapTools`, in `openclaw-plugin-ocap-tools/`
  - They carried byte-identical copies of `daemon.ts`, `artifact-store.ts`, and `types.ts`, and each opened its own socket to the same vat. There is now one connection, one `ocapHome`/`displayUrl` to configure, and one copy of the shared plumbing
  - The two toolsets live in `discovery/` and `orchestration/` and keep separate state modules, since their state has nothing in common. Both skills are still shipped separately: discovery is a reusable building block that does not depend on the demo
  - Tool names are unchanged, so `tools.allow` needs no edit. `plugins.allow` and `plugins.entries.<id>.config.*` do: `discovery` and `demo` become `ocapTools`. Stale `plugins.entries.discovery` / `plugins.entries.demo` blocks in an existing `~/.openclaw/openclaw.json` are dead but harmless
  - Dropped the vestigial `ocapCliPath` from the manifest, where it had outlived the code that read it
  - `openclaw-plugin-demo` was never in the package's `tsconfig.json` `include`, so its half was previously unchecked; the unified directory is
- Plugins now reach the kernel through the `@ocap/ocap-jsonrpc-vat` Unix socket instead of shell-execing `ocap daemon queueMessage` / `ocap daemon redeem-url` per call
  - `DaemonCaller` maintains a persistent JSON-RPC 2.0 connection over the socket for the caller's lifetime
  - Config keys `ocapCliPath` (both plugins) removed; `socketPath` added (falls back to `<ocapHome>/ocap-jsonrpc.sock`)
  - Plugin state (`ContactEntry.ref`, `ServiceEntry.ref`, `CapEntry.ref`, `WalletSlot.ref`) tracks `@@j<n>` sigil strings rather than raw krefs; `isKref`/`parseCapabilityResponse` replaced by `isRef`

[Unreleased]: https://github.com/MetaMask/ocap-kernel/
