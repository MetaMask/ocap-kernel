# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0]

### Uncategorized

- feat(ocap-kernel): leverage libp2p v3 features in remote communications ([#915](https://github.com/MetaMask/ocap-kernel/pull/915))
- chore: fix type error, upgrade turbo, suppress warnings ([#908](https://github.com/MetaMask/ocap-kernel/pull/908))
- feat(kernel-cli): queueMessage, redeem-url, OCAP_HOME, e2e tests ([#896](https://github.com/MetaMask/ocap-kernel/pull/896))
- feat(kernel-cli): add `--local-relay` flag to daemon start ([#891](https://github.com/MetaMask/ocap-kernel/pull/891))
- feat(kernel-cli): add relay start/status/stop subcommands with PID bookkeeping ([#888](https://github.com/MetaMask/ocap-kernel/pull/888))

### Changed

- **BREAKING:** Rename package from `@ocap/cli` to `@metamask/kernel-cli` and make it public ([#875](https://github.com/MetaMask/ocap-kernel/pull/875))
- Replace `@ocap/repo-tools/vite-plugins` dependency with `@metamask/kernel-utils/vite-plugins` ([#875](https://github.com/MetaMask/ocap-kernel/pull/875))
- Replace `@ocap/nodejs` dependency with `@metamask/kernel-node-runtime` ([#875](https://github.com/MetaMask/ocap-kernel/pull/875))

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-cli@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/kernel-cli@0.1.0
