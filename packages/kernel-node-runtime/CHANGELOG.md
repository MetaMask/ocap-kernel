# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0]

### Uncategorized

- feat(ocap-kernel): leverage libp2p v3 features in remote communications ([#915](https://github.com/MetaMask/ocap-kernel/pull/915))
- feat(kernel-errors): standardize kernel errors observable in vat-land ([#913](https://github.com/MetaMask/ocap-kernel/pull/913))
- refactor(evm-wallet-experiment): use new kernel-cli queueMessage subcommand ([#909](https://github.com/MetaMask/ocap-kernel/pull/909))
- chore: fix type error, upgrade turbo, suppress warnings ([#908](https://github.com/MetaMask/ocap-kernel/pull/908))
- perf: reduce remote-comms e2e test execution time ([#906](https://github.com/MetaMask/ocap-kernel/pull/906))
- feat: upgrade libp2p v2 to v3 ([#900](https://github.com/MetaMask/ocap-kernel/pull/900))
- feat(kernel-cli): queueMessage, redeem-url, OCAP_HOME, e2e tests ([#896](https://github.com/MetaMask/ocap-kernel/pull/896))
- fix(ocap-kernel): enforce one delivery per crank, fix rollback cache staleness ([#879](https://github.com/MetaMask/ocap-kernel/pull/879))

### Changed

- **BREAKING:** Rename package from `@ocap/nodejs` to `@metamask/kernel-node-runtime` and make it public ([#875](https://github.com/MetaMask/ocap-kernel/pull/875))

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-node-runtime@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/kernel-node-runtime@0.1.0
