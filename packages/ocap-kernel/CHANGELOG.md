# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Make vat global allowlist configurable and expand available endowments ([#933](https://github.com/MetaMask/ocap-kernel/pull/933))
  - Export `DEFAULT_ALLOWED_GLOBALS` with `URL`, `URLSearchParams`, `atob`, `btoa`, `AbortController`, and `AbortSignal` in addition to the existing globals
  - Accept optional `allowedGlobals` on `VatSupervisor` for custom allowlists
  - Log a warning when a vat requests an unknown global

### Changed

- Bound relay hints in OCAP URLs to a maximum of 3 and cap the relay pool at 20 entries with eviction of oldest non-bootstrap relays ([#929](https://github.com/MetaMask/ocap-kernel/pull/929))

### Fixed

- Deserialize CapData rejections in `Kernel.queueMessage` so vat errors surface as plain `Error` objects to all callers ([#928](https://github.com/MetaMask/ocap-kernel/pull/928))

## [0.7.0]

### Added

- Add various configurable timeouts for remote communications ([#906](https://github.com/MetaMask/ocap-kernel/pull/906))
- Propagate relay hints from redeemed ocap URLs ([#887](https://github.com/MetaMask/ocap-kernel/pull/887))
- Add `allowedWsHosts` parameter to `initializeRemoteComms()` ([#878](https://github.com/MetaMask/ocap-kernel/pull/878))

### Changed

- **BREAKING:** Adopt branded string types for kernel identifiers ([#917](https://github.com/MetaMask/ocap-kernel/pull/917), [#921](https://github.com/MetaMask/ocap-kernel/pull/921))
- Standardize vat-observable kernel errors ([#913](https://github.com/MetaMask/ocap-kernel/pull/913))
- Upgrade libp2p to v3 and improve remote communication reliability ([#900](https://github.com/MetaMask/ocap-kernel/pull/900), [#915](https://github.com/MetaMask/ocap-kernel/pull/915))
- Auto-extract `allowedWsHosts` from plain `ws://` relay multiaddrs in `ConnectionFactory` ([#881](https://github.com/MetaMask/ocap-kernel/pull/881))
- Use `E()` for kernel service invocation to support remote presences as services ([#872](https://github.com/MetaMask/ocap-kernel/pull/872))

### Fixed

- Attempt to reconnect to unreachable relays on startup ([#918](https://github.com/MetaMask/ocap-kernel/pull/918))
- Restore single-delivery guarantee per crank and prevent rollback cache staleness ([#879](https://github.com/MetaMask/ocap-kernel/pull/879))

## [0.6.0]

### Added

- Add `TextEncoder`, `TextDecoder`, `setTimeout`, and `clearTimeout` to vat globals allowlist ([#856](https://github.com/MetaMask/ocap-kernel/pull/856))
- Add `IOManager` and IO kernel service for vat I/O streams ([#840](https://github.com/MetaMask/ocap-kernel/pull/840))
- Add system subclusters and kernel facet service ([#803](https://github.com/MetaMask/ocap-kernel/pull/803))
  - Restrict kernel services to system subclusters only ([#833](https://github.com/MetaMask/ocap-kernel/pull/833))
  - Return generic "no registered kernel service" error for system-only services requested by non-system subclusters ([#838](https://github.com/MetaMask/ocap-kernel/pull/838))
- Buffer vat outputs to make cranks transactional ([#794](https://github.com/MetaMask/ocap-kernel/pull/794))
  - Enqueue async vat syscalls immediately when outside a crank ([#848](https://github.com/MetaMask/ocap-kernel/pull/848))
- Add caplet vat type for lightweight vat configurations ([#753](https://github.com/MetaMask/ocap-kernel/pull/753))
- Add CapTP infrastructure for kernel-to-kernel communication ([#751](https://github.com/MetaMask/ocap-kernel/pull/751))
- Prevent vat endowment names from being overridden ([#619](https://github.com/MetaMask/ocap-kernel/pull/619))
- Add kernel-to-kernel remote communication via libp2p ([#578](https://github.com/MetaMask/ocap-kernel/pull/578))
  - Add `remoteComms` status to `Kernel.getStatus()` output ([#637](https://github.com/MetaMask/ocap-kernel/pull/637))
  - Add `relays` parameter to `initRemoteComms` for configuring relay servers ([#638](https://github.com/MetaMask/ocap-kernel/pull/638))
  - Add location hint support to OCAP URL handling ([#666](https://github.com/MetaMask/ocap-kernel/pull/666))
  - Fix kernel restart with open remote connections ([#677](https://github.com/MetaMask/ocap-kernel/pull/677))
  - Add automatic reconnection with exponential backoff for remote comms ([#678](https://github.com/MetaMask/ocap-kernel/pull/678))
  - Fix remote endpoint initialization to occur during registration rather than construction ([#681](https://github.com/MetaMask/ocap-kernel/pull/681))
  - Fix shutdown handling to properly sequence crank completion, stream closing, and remote comms teardown ([#692](https://github.com/MetaMask/ocap-kernel/pull/692))
  - Fix remote message queueing during connection establishment ([#697](https://github.com/MetaMask/ocap-kernel/pull/697))
  - Add explicit connection management for intentional disconnects ([#699](https://github.com/MetaMask/ocap-kernel/pull/699))
  - Reject pending promises on connection loss ([#706](https://github.com/MetaMask/ocap-kernel/pull/706))
  - Refactor remote location hint handling and add `registerLocationHints` platform service ([#712](https://github.com/MetaMask/ocap-kernel/pull/712))
  - Add timeout handling for remote message sends and URL redemptions ([#713](https://github.com/MetaMask/ocap-kernel/pull/713))
  - Add resource limits for remote communications ([#714](https://github.com/MetaMask/ocap-kernel/pull/714))
  - Add message sequencing and acknowledgment to remote messaging ([#744](https://github.com/MetaMask/ocap-kernel/pull/744))
  - Persist pending messages and sequence state in `RemoteHandle` across restarts ([#760](https://github.com/MetaMask/ocap-kernel/pull/760))
  - Add rate limiting for remote messages and connections ([#776](https://github.com/MetaMask/ocap-kernel/pull/776))
  - Add BIP39 mnemonic support for kernel identity seed recovery ([#780](https://github.com/MetaMask/ocap-kernel/pull/780))
  - Add kernel incarnation detection protocol for identifying peer restarts ([#788](https://github.com/MetaMask/ocap-kernel/pull/788))
  - Add permanent failure detection for reconnection attempts ([#789](https://github.com/MetaMask/ocap-kernel/pull/789))
  - Add incarnation ID infrastructure and handshake module ([#800](https://github.com/MetaMask/ocap-kernel/pull/800))
  - Handle reconnection to restarted peers with incarnation ID detection ([#807](https://github.com/MetaMask/ocap-kernel/pull/807))
  - Complete Ken protocol implementation for reliable remote message delivery ([#811](https://github.com/MetaMask/ocap-kernel/pull/811))
  - Implement distributed garbage collection protocol for remote references ([#814](https://github.com/MetaMask/ocap-kernel/pull/814))
  - Add cross-incarnation wake detection to reset backoffs on peer restart ([#822](https://github.com/MetaMask/ocap-kernel/pull/822))
  - Enable OCAP URL issuance and redemption without active remote comms ([#823](https://github.com/MetaMask/ocap-kernel/pull/823))
  - Add direct transport support (QUIC + TCP) for Node.js peer connections ([#839](https://github.com/MetaMask/ocap-kernel/pull/839))
  - Add `initRemoteComms` and `registerLocationHints` RPC methods for kernel control ([#849](https://github.com/MetaMask/ocap-kernel/pull/849))
  - Fix trailing comma in OCAP URLs when no relays are known ([#850](https://github.com/MetaMask/ocap-kernel/pull/850))
  - Allow plain `ws://` connections for relay dialing ([#855](https://github.com/MetaMask/ocap-kernel/pull/855))
  - Restrict plain `ws://` relay dialing to private and explicitly allowed addresses ([#857](https://github.com/MetaMask/ocap-kernel/pull/857))
  - Accept `allowedWsHosts` parameter in `initRemoteComms` RPC ([#858](https://github.com/MetaMask/ocap-kernel/pull/858))
  - Re-dial relays on connection close with exponential backoff ([#860](https://github.com/MetaMask/ocap-kernel/pull/860))

### Changed

- **BREAKING:** Drop Node 20 support ([#837](https://github.com/MetaMask/ocap-kernel/pull/837))
- Close database in `Kernel.stop()` ([#845](https://github.com/MetaMask/ocap-kernel/pull/845))
- Remove `reloadConfig` and `reloadSubcluster` methods from `Kernel` ([#836](https://github.com/MetaMask/ocap-kernel/pull/836))
- Export `Baggage` and `VatPowers` types ([#801](https://github.com/MetaMask/ocap-kernel/pull/801))
- Load vat bundles via Vite instead of `@endo/import-bundle` ([#763](https://github.com/MetaMask/ocap-kernel/pull/763))
- Extract `VatManager` and `SubclusterManager` from `Kernel` class ([#651](https://github.com/MetaMask/ocap-kernel/pull/651))
  - Extract `RemoteManager` and `KernelServiceManager` from `Kernel` class ([#653](https://github.com/MetaMask/ocap-kernel/pull/653))
- Migrate kernel service dispatch from `Far` to `makeExo` ([#612](https://github.com/MetaMask/ocap-kernel/pull/612))

### Fixed

- Disable cache for default bundle fetch ([#802](https://github.com/MetaMask/ocap-kernel/pull/802))
- Clean up orphan messages during recovery ([#769](https://github.com/MetaMask/ocap-kernel/pull/769))
- Fix message delivery to terminated vats ([#617](https://github.com/MetaMask/ocap-kernel/pull/617))
- Handle messages remaining in queue after kernel restart ([#611](https://github.com/MetaMask/ocap-kernel/pull/611))
- Fix kernel initialization and operation with persistent storage ([#604](https://github.com/MetaMask/ocap-kernel/pull/604))

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

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/ocap-kernel@0.7.0...HEAD
[0.7.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/ocap-kernel@0.6.0...@metamask/ocap-kernel@0.7.0
[0.6.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/ocap-kernel@0.5.0...@metamask/ocap-kernel@0.6.0
[0.5.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/ocap-kernel@0.4.0...@metamask/ocap-kernel@0.5.0
[0.4.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/ocap-kernel@0.3.0...@metamask/ocap-kernel@0.4.0
[0.3.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/ocap-kernel@0.2.0...@metamask/ocap-kernel@0.3.0
[0.2.0]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/ocap-kernel@0.1.0...@metamask/ocap-kernel@0.2.0
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/ocap-kernel@0.1.0
