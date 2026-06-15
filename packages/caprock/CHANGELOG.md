# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Permission-tracker vat now supports `removeSection(provision)` so the TUI can revoke a previously-granted standing provision. Revocations are written to the caprock event log as `provision_revoke` events alongside the existing `provision_match` records consumed by `caprock:audit`.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/
