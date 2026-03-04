# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0]

### Added

- Add TextEncoder, TextDecoder, setTimeout to vat globals allowlist ([#856](https://github.com/MetaMask/ocap-kernel/pull/856))
- Add initRemoteComms and registerLocationHints RPC methods ([#849](https://github.com/MetaMask/ocap-kernel/pull/849))
- Add daemon process with ocap daemon CLI ([#843](https://github.com/MetaMask/ocap-kernel/pull/843))
- Add IO kernel service for vat I/O streams ([#840](https://github.com/MetaMask/ocap-kernel/pull/840))
- Add direct transport support (QUIC + TCP) for Node.js connections ([#839](https://github.com/MetaMask/ocap-kernel/pull/839))
- Restrict kernel services to system subclusters ([#833](https://github.com/MetaMask/ocap-kernel/pull/833))
- Enable offline ocap url methods ([#823](https://github.com/MetaMask/ocap-kernel/pull/823))
- Add system subclusters and kernel facet service ([#803](https://github.com/MetaMask/ocap-kernel/pull/803))
- Cross-incarnation wake detection ([#822](https://github.com/MetaMask/ocap-kernel/pull/822))
- Implement distributed garbage collection protocol ([#814](https://github.com/MetaMask/ocap-kernel/pull/814))
- Handle reconnection to restarted peers with incarnation ID detection ([#807](https://github.com/MetaMask/ocap-kernel/pull/807))
- Complete Ken protocol implementation ([#811](https://github.com/MetaMask/ocap-kernel/pull/811))
- Add permanent failure detection for reconnection ([#789](https://github.com/MetaMask/ocap-kernel/pull/789))
- Add kernel incarnation detection protocol ([#788](https://github.com/MetaMask/ocap-kernel/pull/788))
- Consolidate extension console logs and capture in Playwright tests ([#798](https://github.com/MetaMask/ocap-kernel/pull/798))
- Add incarnation ID infrastructure and handshake module ([#800](https://github.com/MetaMask/ocap-kernel/pull/800))
- Buffer vat outputs to make cranks transactional ([#794](https://github.com/MetaMask/ocap-kernel/pull/794))
- Add silent Vitest reporter ([#792](https://github.com/MetaMask/ocap-kernel/pull/792))
- Add rate limiting for messages and connections ([#776](https://github.com/MetaMask/ocap-kernel/pull/776))
- Add BIP39 mnemonic support for kernel identity seed recovery ([#780](https://github.com/MetaMask/ocap-kernel/pull/780))
- Add caplet vat implementation ([#753](https://github.com/MetaMask/ocap-kernel/pull/753))
- Persist pending messages and sequence state in RemoteHandle ([#760](https://github.com/MetaMask/ocap-kernel/pull/760))
- Add CapTP infrastructure for kernel communication ([#751](https://github.com/MetaMask/ocap-kernel/pull/751))
- Add message sequencing and acknowledgment to remote messaging ([#744](https://github.com/MetaMask/ocap-kernel/pull/744))
- Add Turborepo caching for test:dev and fix streams dev tests ([#757](https://github.com/MetaMask/ocap-kernel/pull/757))
- Add resource limits for remote communications ([#714](https://github.com/MetaMask/ocap-kernel/pull/714))
- Add timeout handling for remote message sends and URL redemptions ([#713](https://github.com/MetaMask/ocap-kernel/pull/713))
- Reject promises on connection loss ([#706](https://github.com/MetaMask/ocap-kernel/pull/706))
- Add explicit connection management for intentional disconnects ([#699](https://github.com/MetaMask/ocap-kernel/pull/699))
- Add Node.js e2e tests and fix shutdown handling ([#692](https://github.com/MetaMask/ocap-kernel/pull/692))
- Automatic reconnection with exponential backoff for remote comms ([#678](https://github.com/MetaMask/ocap-kernel/pull/678))
- Add cli command to start the libp2p relay server and fix browser e2e test ([#638](https://github.com/MetaMask/ocap-kernel/pull/638))
- Add Remote Comms UI panel and testing infrastructure ([#637](https://github.com/MetaMask/ocap-kernel/pull/637))
- Prevent overriding endowment names ([#619](https://github.com/MetaMask/ocap-kernel/pull/619))
- First pass of support for kernel-kernel network comms ([#578](https://github.com/MetaMask/ocap-kernel/pull/578))
- Use kernel platforms ([#615](https://github.com/MetaMask/ocap-kernel/pull/615))

### Changed

- @ocap/kernel-platforms -> @metamask/kernel-platforms ([#864](https://github.com/MetaMask/ocap-kernel/pull/864))
- Close database in Kernel.stop() ([#845](https://github.com/MetaMask/ocap-kernel/pull/845))
- Genericize system-only service error ([#838](https://github.com/MetaMask/ocap-kernel/pull/838))
- **BREAKING:** Drop Node 20 support ([#837](https://github.com/MetaMask/ocap-kernel/pull/837))
- Remove reload methods from Kernel and SubclusterManager ([#836](https://github.com/MetaMask/ocap-kernel/pull/836))
- Bundle test vats from typescript source ([#801](https://github.com/MetaMask/ocap-kernel/pull/801))
- Bundle vats with vite ([#763](https://github.com/MetaMask/ocap-kernel/pull/763))
- Consolidate endoify setup and rationalize extension globals ([#787](https://github.com/MetaMask/ocap-kernel/pull/787))
- Split transport.ts for separation of concerns ([#765](https://github.com/MetaMask/ocap-kernel/pull/765))
- Refactor folder structure into platform/ and kernel/ ([#749](https://github.com/MetaMask/ocap-kernel/pull/749))
- Message queue cleanup ([#715](https://github.com/MetaMask/ocap-kernel/pull/715))
- Refactor remote location hint handling ([#712](https://github.com/MetaMask/ocap-kernel/pull/712))
- Plumbing for deterministic peerId generation during tests ([#696](https://github.com/MetaMask/ocap-kernel/pull/696))
- Fix flaky network tests by mocking classes instead of libp2p ([#693](https://github.com/MetaMask/ocap-kernel/pull/693))
- Further progress handling persistence vs. remote connectivity ([#681](https://github.com/MetaMask/ocap-kernel/pull/681))
- Extract remote and kernel service managers ([#653](https://github.com/MetaMask/ocap-kernel/pull/653))
- Extract VatManager and SubclusterManager from Kernel class ([#651](https://github.com/MetaMask/ocap-kernel/pull/651))
- Ocap URL location hint handling ([#666](https://github.com/MetaMask/ocap-kernel/pull/666))
- Rationalize endoify shims ([#650](https://github.com/MetaMask/ocap-kernel/pull/650))
- Reorganize code by domain into vats, liveslots, and GC directories ([#639](https://github.com/MetaMask/ocap-kernel/pull/639))
- Enable `n/prefer-node-protocol` ESLint rule ([#647](https://github.com/MetaMask/ocap-kernel/pull/647))
- Add remote comms unit tests ([#635](https://github.com/MetaMask/ocap-kernel/pull/635))
- Migrate from `Far` to `makeExo` ([#612](https://github.com/MetaMask/ocap-kernel/pull/612))

### Fixed

- Re-dial relays on connection close with exponential backoff ([#860](https://github.com/MetaMask/ocap-kernel/pull/860))
- Add allowedWsHosts to initRemoteComms RPC params ([#858](https://github.com/MetaMask/ocap-kernel/pull/858))
- Restrict plain ws:// relay dialing to private/allowed addresses ([#857](https://github.com/MetaMask/ocap-kernel/pull/857))
- Allow plain ws:// connections for relay dialing ([#855](https://github.com/MetaMask/ocap-kernel/pull/855))
- Enqueue async vat syscalls immediately when outside a crank ([#848](https://github.com/MetaMask/ocap-kernel/pull/848))
- Fix trailing comma in OCAP URLs when no relays are known ([#850](https://github.com/MetaMask/ocap-kernel/pull/850))
- Disable cache for default bundle fetch ([#802](https://github.com/MetaMask/ocap-kernel/pull/802))
- Clean up orphan messages during recovery ([#769](https://github.com/MetaMask/ocap-kernel/pull/769))
- Network test memory leak ([#711](https://github.com/MetaMask/ocap-kernel/pull/711))
- Fix message queueing and add e2e tests ([#697](https://github.com/MetaMask/ocap-kernel/pull/697))
- Handle restart of a kernel with open remotes ([#677](https://github.com/MetaMask/ocap-kernel/pull/677))
- Sending messages to terminated vats ([#617](https://github.com/MetaMask/ocap-kernel/pull/617))
- Handle messages in queue after kernel restart ([#611](https://github.com/MetaMask/ocap-kernel/pull/611))
- Run with persistence ([#604](https://github.com/MetaMask/ocap-kernel/pull/604))

## [0.5.0]

### Changed

- Dual-license package under MIT and/or Apache 2.0 ([#601](https://github.com/MetaMask/ocap-kernel/pull/601))

## [0.4.0]

### Added

- Add kernel service object support ([#563](https://github.com/MetaMask/ocap-kernel/pull/563))

### Changed

- Wait for crank to run kernel actions ([#595](https://github.com/MetaMask/ocap-kernel/pull/595))
- Bump Endo and Agoric dependencies ([#590](https://github.com/MetaMask/ocap-kernel/pull/590))
- Throw if subcluster launch fails ([#566](https://github.com/MetaMask/ocap-kernel/pull/566))
- Use `@metamask/logger` ([#559](https://github.com/MetaMask/ocap-kernel/pull/559))

### Fixed

- Remove redundant kernel promise ref count increment ([#565](https://github.com/MetaMask/ocap-kernel/pull/565))

## [0.3.0]

### Added

- Add `revoke` kernel command ([#544](https://github.com/MetaMask/ocap-kernel/pull/544))
- Support multiple subclusters ([#530](https://github.com/MetaMask/ocap-kernel/pull/530))

### Removed

- Remove support for launching vats outside a subcluster ([#535](https://github.com/MetaMask/ocap-kernel/pull/535))

### Fixed

- Throwing from remotable method rejects result ([#545](https://github.com/MetaMask/ocap-kernel/pull/545))

## [0.2.0]

### Added

- Make export paths compatible with Browserify ([#533](https://github.com/MetaMask/ocap-kernel/pull/533))
- Properly handle syscall failures ([#520](https://github.com/MetaMask/ocap-kernel/pull/520))
- Add `Kernel.getStatus()` ([#522](https://github.com/MetaMask/ocap-kernel/pull/522))
- Use JSON-RPC notifications for vat syscalls ([#528](https://github.com/MetaMask/ocap-kernel/pull/528))

### Removed

- Remove `waitForSyscallsToComplete()` ([#527](https://github.com/MetaMask/ocap-kernel/pull/527))

## [0.1.0]

### Added

- Initial release.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/ocap-kernel@0.6.0...HEAD
[0.6.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/ocap-kernel@0.5.0...@metamask/ocap-kernel@0.6.0
[0.5.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/ocap-kernel@0.4.0...@metamask/ocap-kernel@0.5.0
[0.4.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/ocap-kernel@0.3.0...@metamask/ocap-kernel@0.4.0
[0.3.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/ocap-kernel@0.2.0...@metamask/ocap-kernel@0.3.0
[0.2.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/ocap-kernel@0.1.0...@metamask/ocap-kernel@0.2.0
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/ocap-kernel@0.1.0
