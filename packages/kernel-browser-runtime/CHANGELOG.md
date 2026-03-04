# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0]

### Uncategorized

- chore: @ocap/kernel-platforms -> @metamask/kernel-platforms ([#864](https://github.com/MetaMask/ocap-kernel/pull/864))
- feat(ocap-kernel): add direct transport support (QUIC + TCP) for Node.js connections ([#839](https://github.com/MetaMask/ocap-kernel/pull/839))
- feat(repo-tools): add bundleVats Vite plugin for vat bundling ([#834](https://github.com/MetaMask/ocap-kernel/pull/834))
- chore: Drop Node 20 support ([#837](https://github.com/MetaMask/ocap-kernel/pull/837))
- chore(ocap-kernel): remove reload methods from Kernel and SubclusterManager ([#836](https://github.com/MetaMask/ocap-kernel/pull/836))
- feat(ocap-kernel): Enable offline ocap url methods ([#823](https://github.com/MetaMask/ocap-kernel/pull/823))
- feat: Add system subclusters and kernel facet service ([#803](https://github.com/MetaMask/ocap-kernel/pull/803))
- feat(remote-comms): cross-incarnation wake detection ([#822](https://github.com/MetaMask/ocap-kernel/pull/822))
- feat(remote-comms): handle reconnection to restarted peers with incarnation ID detection ([#807](https://github.com/MetaMask/ocap-kernel/pull/807))
- Complete Ken protocol implementation ([#811](https://github.com/MetaMask/ocap-kernel/pull/811))
- feat(remote-comms): Add kernel incarnation detection protocol ([#788](https://github.com/MetaMask/ocap-kernel/pull/788))
- feat: Consolidate extension console logs and capture in Playwright tests ([#798](https://github.com/MetaMask/ocap-kernel/pull/798))
- feat(repo-tools): Add silent Vitest reporter ([#792](https://github.com/MetaMask/ocap-kernel/pull/792))
- fix(deps): Update vulnerable dependencies to resolve security alerts ([#791](https://github.com/MetaMask/ocap-kernel/pull/791))
- refactor: Consolidate endoify setup and rationalize extension globals ([#787](https://github.com/MetaMask/ocap-kernel/pull/787))
- feat(omnium): Add caplet vat implementation ([#753](https://github.com/MetaMask/ocap-kernel/pull/753))
- feat(omnium): Add controller architecture ([#752](https://github.com/MetaMask/ocap-kernel/pull/752))
- chore(remotes): refactor folder structure into platform/ and kernel/ ([#749](https://github.com/MetaMask/ocap-kernel/pull/749))
- feat: Add CapTP infrastructure for kernel communication ([#751](https://github.com/MetaMask/ocap-kernel/pull/751))
- Add message sequencing and acknowledgment to remote messaging ([#744](https://github.com/MetaMask/ocap-kernel/pull/744))
- feat: Add Turborepo caching for test:dev and fix streams dev tests ([#757](https://github.com/MetaMask/ocap-kernel/pull/757))
- chore(deps): Update MetaMask ESLint dependencies and fix JSDoc compliance ([#741](https://github.com/MetaMask/ocap-kernel/pull/741))
- chore: Add Claude Code commands for common development and git workflows ([#725](https://github.com/MetaMask/ocap-kernel/pull/725))
- refactor(kernel-browser-runtime): Simplify kernel worker initialization ([#718](https://github.com/MetaMask/ocap-kernel/pull/718))
- chore: Update vite & vitest dependencies to latest versions ([#717](https://github.com/MetaMask/ocap-kernel/pull/717))
- Refactor remote location hint handling ([#712](https://github.com/MetaMask/ocap-kernel/pull/712))
- feat: reject promises on connection loss ([#706](https://github.com/MetaMask/ocap-kernel/pull/706))
- refactor: Move default cluster startup to background ([#709](https://github.com/MetaMask/ocap-kernel/pull/709))
- refactor(kernel-browser-runtime): Migrate to JsonRpcEngineV2 ([#707](https://github.com/MetaMask/ocap-kernel/pull/707))
- Make `Logger` obey log level settings ([#703](https://github.com/MetaMask/ocap-kernel/pull/703))
- Clean up `__dirname` use ([#701](https://github.com/MetaMask/ocap-kernel/pull/701))
- feat(remote-comms): Add explicit connection management for intentional disconnects ([#699](https://github.com/MetaMask/ocap-kernel/pull/699))
- feat(remote-comms): Add Node.js e2e tests and fix shutdown handling ([#692](https://github.com/MetaMask/ocap-kernel/pull/692))
- feat(ocap-kernel): Automatic reconnection with exponential backoff for remote comms ([#678](https://github.com/MetaMask/ocap-kernel/pull/678))
- chore: Make various updates to `lint-build-test.yml` to unblock CI ([#683](https://github.com/MetaMask/ocap-kernel/pull/683))
- Ocap URL location hint handling ([#666](https://github.com/MetaMask/ocap-kernel/pull/666))
- feat: Add `omnium-gatherum` extension ([#654](https://github.com/MetaMask/ocap-kernel/pull/654))
- chore: Enable `n/prefer-node-protocol` ESLint rule ([#647](https://github.com/MetaMask/ocap-kernel/pull/647))
- chore(root): clean script removes .turbo cache ([#643](https://github.com/MetaMask/ocap-kernel/pull/643))
- refactor: Add storage reset flag to extension build script ([#642](https://github.com/MetaMask/ocap-kernel/pull/642))
- refactor: Add `@ocap/repo-tools` ([#641](https://github.com/MetaMask/ocap-kernel/pull/641))
- feat: Add cli command to start the libp2p relay server and fix browser e2e test ([#638](https://github.com/MetaMask/ocap-kernel/pull/638))
- build: Use Turborepo for root build script ([#634](https://github.com/MetaMask/ocap-kernel/pull/634))
- First pass of support for kernel-kernel network comms ([#578](https://github.com/MetaMask/ocap-kernel/pull/578))
- feat(ocap-kernel): use kernel platforms ([#615](https://github.com/MetaMask/ocap-kernel/pull/615))
- fix(kernel): Run with persistence ([#604](https://github.com/MetaMask/ocap-kernel/pull/604))

### Changed

- Bump `@metamask/snaps-utils` from `^9.1.0` to `^11.6.1` ([#682](https://github.com/MetaMask/ocap-kernel/pull/682))

## [0.4.0]

### Changed

- Dual-license package under MIT and/or Apache 2.0 ([#601](https://github.com/MetaMask/ocap-kernel/pull/601))

## [0.3.0]

### Changed

- Use the MetaMask design system ([#577](https://github.com/MetaMask/ocap-kernel/pull/577))
- Wait for crank to run kernel actions ([#595](https://github.com/MetaMask/ocap-kernel/pull/595))
- Bump Endo and Agoric dependencies ([#590](https://github.com/MetaMask/ocap-kernel/pull/590))

### Fixed

- Restore `kernel-browser-runtime` sourcemaps in extension ([#575](https://github.com/MetaMask/ocap-kernel/pull/575))

## [0.2.0]

### Added

- Add `revoke` kernel command ([#544](https://github.com/MetaMask/ocap-kernel/pull/544))
- Support multiple subclusters ([#530](https://github.com/MetaMask/ocap-kernel/pull/530))

### Removed

- Remove support for launching vats outside a subcluster ([#535](https://github.com/MetaMask/ocap-kernel/pull/535))

## [0.1.0]

### Added

- Initial release.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-browser-runtime@0.5.0...HEAD
[0.5.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-browser-runtime@0.4.0...@metamask/kernel-browser-runtime@0.5.0
[0.4.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-browser-runtime@0.3.0...@metamask/kernel-browser-runtime@0.4.0
[0.3.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-browser-runtime@0.2.0...@metamask/kernel-browser-runtime@0.3.0
[0.2.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/kernel-browser-runtime@0.1.0...@metamask/kernel-browser-runtime@0.2.0
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/kernel-browser-runtime@0.1.0
