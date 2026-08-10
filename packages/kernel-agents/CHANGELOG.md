# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The built-in capabilities (`math`, `end`, `examples`) are now pattern-guarded discoverable exos authored with the `described*()` combinators, so their argument shapes are enforced by the exo's interface guard at invocation rather than only described in the prompt ([#959](https://github.com/MetaMask/ocap-kernel/pull/959))

### Removed

- **BREAKING:** Remove the `capability()` authoring helper from `@ocap/kernel-agents/capabilities/capability`. Author capabilities as pattern-guarded discoverable exos (via the `described*()` combinators in `@metamask/kernel-utils`) and convert them with `discover`, so the exo's interface guard is the sole argument enforcer ([#960](https://github.com/MetaMask/ocap-kernel/pull/960))

[Unreleased]: https://github.com/MetaMask/ocap-kernel/
