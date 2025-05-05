# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- refactor: Prepare for publishing packages to npm ([#507](https://github.com/MetaMask/ocap-kernel/pull/507))
- feat(kernel): Add removable bootstrap keep‑alive pin ([#502](https://github.com/MetaMask/ocap-kernel/pull/502))
- test(kernel-test): Mark flaky test for automatic retry ([#498](https://github.com/MetaMask/ocap-kernel/pull/498))
- kernel: fix lingering ref‑counts that blocked GC ([#492](https://github.com/MetaMask/ocap-kernel/pull/492))
- refactor: Replace "message" IPC pattern with RpcClient and RpcService ([#487](https://github.com/MetaMask/ocap-kernel/pull/487))
- feat: Implement refcounting and vat termination cleanup ([#478](https://github.com/MetaMask/ocap-kernel/pull/478))
- refactor: Replace VatWorkerManager message types with new RPC pattern ([#481](https://github.com/MetaMask/ocap-kernel/pull/481))
- test(exo): Add liveslots virtual object tests ([#475](https://github.com/MetaMask/ocap-kernel/pull/475))
- feat: Add `rpc-methods` package ([#474](https://github.com/MetaMask/ocap-kernel/pull/474))
- feat: Add garbage collection finalization capability ([#457](https://github.com/MetaMask/ocap-kernel/pull/457))
- chore: upgrade agoric and endo plugins ([#470](https://github.com/MetaMask/ocap-kernel/pull/470))
- chore: upgrade ESLint, CLI tools and related plugins ([#468](https://github.com/MetaMask/ocap-kernel/pull/468))
- chore: upgrade metamask plugins ([#472](https://github.com/MetaMask/ocap-kernel/pull/472))
- chore: upgrade vite, vitest and related plugins ([#469](https://github.com/MetaMask/ocap-kernel/pull/469))
- refactor: Replace `nullable` structs with `exactOptional` ([#465](https://github.com/MetaMask/ocap-kernel/pull/465))
- Handle vat resumption on vat or kernel restart ([#448](https://github.com/MetaMask/ocap-kernel/pull/448))
- feat(kernel): Support liveslots distributed garbage collection ([#419](https://github.com/MetaMask/ocap-kernel/pull/419))
- feat(kernel): add vatPowers option to VatSupervisor constructor ([#443](https://github.com/MetaMask/ocap-kernel/pull/443))
- refactor: Begin using JSON-RPC for internal messages ([#451](https://github.com/MetaMask/ocap-kernel/pull/451))
- Stop (we hope) vatstore kernel test from flaking in CI ([#450](https://github.com/MetaMask/ocap-kernel/pull/450))
- fix(store): use ephemeral ':memory:' for default store ([#446](https://github.com/MetaMask/ocap-kernel/pull/446))
- feat: Implement persistent storage for vats. ([#436](https://github.com/MetaMask/ocap-kernel/pull/436))
- chore: Bump TypeScript and related tooling to 5.8 ([#439](https://github.com/MetaMask/ocap-kernel/pull/439))
- refactor: Remove extraneous uses of TypeScript's DOM lib ([#435](https://github.com/MetaMask/ocap-kernel/pull/435))
- chore: Use actual source file extensions for relative imports ([#430](https://github.com/MetaMask/ocap-kernel/pull/430))
- Test package for running cross-vat tests. And tests too. ([#418](https://github.com/MetaMask/ocap-kernel/pull/418))

[Unreleased]: https://github.com/MetaMask/ocap-kernel/
