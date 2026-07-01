# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release with terminal UI for OCAP kernel session management
- Multi-view TUI with files, objects, invoke, log, and sessions views
- Sessions view with per-session authorization request list and drillable session detail view
- `ocap tui` and `ocap modal` commands in `kernel-cli` launch the TUI
- Session detail's active provisions panel: arrow keys navigate the list, `3` opens an arrow-keys+enter confirmation to revoke the focused provision. Revocation drops the standing approval from the permission-tracker vat and writes a `provision_revoke` event to the caprock event log.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/
