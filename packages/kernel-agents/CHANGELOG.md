# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `extractValidatedCapabilities`, which wraps each capability function so its arguments are validated against the capability's schema before invocation
- `CapabilityArgsSchema` type for a capability's arguments

### Changed

- **BREAKING:** A capability's `args` schema is now a standard object JSON Schema (`{ type: 'object', properties, required }`) instead of a flat map of argument name to schema. `required` is the standard object-level array of mandatory argument names; when omitted, all arguments are required.
- The JSON strategy evaluator now validates each invocation's arguments against the capability's schema before calling it, surfacing a clear error instead of failing deep inside the capability

[Unreleased]: https://github.com/MetaMask/ocap-kernel/
