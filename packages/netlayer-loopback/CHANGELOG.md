# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release: an in-process hub netlayer ([#972](https://github.com/MetaMask/ocap-kernel/pull/972))
  - `makeLoopbackHub` creates an explicit `LoopbackHub` that routes messages between `@metamask/netlayer` `Netlayer` instances in the same realm, keyed by neutral peerId (no global state)
  - `makeLoopbackNetlayer` implements the full `Netlayer` contract over a shared hub — the standard netlayer test fake and an embedded multi-kernel transport

[Unreleased]: https://github.com/MetaMask/ocap-kernel/
