# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Permission-tracker vat now supports `removeSection(provision)` so the TUI can revoke a previously-granted standing provision. Revocations are written to the caprock event log as `provision_revoke` events alongside the existing `provision_match` records consumed by `caprock:audit`.
- Session state now records the hook binary's version (from `.claude-plugin/plugin.json`) and the permission-tracker vat's baked-in version, so a reader can tell which version(s) of the plugin produced a given session log. A `version_up` event is appended whenever the hook binary is upgraded mid-session; a downgrade aborts the hook with a "monotonic versioning violated" error.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/
