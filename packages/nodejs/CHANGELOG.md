# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: @ocap/kernel-platforms -> @metamask/kernel-platforms ([#864](https://github.com/MetaMask/ocap-kernel/pull/864))
- feat(cli,nodejs): add daemon process with ocap daemon CLI ([#843](https://github.com/MetaMask/ocap-kernel/pull/843))
- refactor(ocap-kernel): close database in Kernel.stop() ([#845](https://github.com/MetaMask/ocap-kernel/pull/845))
- feat(ocap-kernel): add IO kernel service for vat I/O streams ([#840](https://github.com/MetaMask/ocap-kernel/pull/840))
- feat(ocap-kernel): add direct transport support (QUIC + TCP) for Node.js connections ([#839](https://github.com/MetaMask/ocap-kernel/pull/839))
- chore: Drop Node 20 support ([#837](https://github.com/MetaMask/ocap-kernel/pull/837))
- chore(ocap-kernel): remove reload methods from Kernel and SubclusterManager ([#836](https://github.com/MetaMask/ocap-kernel/pull/836))
- feat(ocap-kernel): Enable offline ocap url methods ([#823](https://github.com/MetaMask/ocap-kernel/pull/823))
- feat: Add system subclusters and kernel facet service ([#803](https://github.com/MetaMask/ocap-kernel/pull/803))
- feat(remote-comms): cross-incarnation wake detection ([#822](https://github.com/MetaMask/ocap-kernel/pull/822))
- feat(ocap-kernel): implement distributed garbage collection protocol ([#814](https://github.com/MetaMask/ocap-kernel/pull/814))
- feat(remote-comms): handle reconnection to restarted peers with incarnation ID detection ([#807](https://github.com/MetaMask/ocap-kernel/pull/807))
- Complete Ken protocol implementation ([#811](https://github.com/MetaMask/ocap-kernel/pull/811))
- feat(remote-comms): Add kernel incarnation detection protocol ([#788](https://github.com/MetaMask/ocap-kernel/pull/788))
- feat: Consolidate extension console logs and capture in Playwright tests ([#798](https://github.com/MetaMask/ocap-kernel/pull/798))
- test(nodejs): use in-memory SQLite databases in e2e tests ([#796](https://github.com/MetaMask/ocap-kernel/pull/796))
- feat(repo-tools): Add silent Vitest reporter ([#792](https://github.com/MetaMask/ocap-kernel/pull/792))
- feat(transport): add rate limiting for messages and connections ([#776](https://github.com/MetaMask/ocap-kernel/pull/776))
- test(nodejs): fix connection failure and recovery E2E test ([#790](https://github.com/MetaMask/ocap-kernel/pull/790))
- refactor: Consolidate endoify setup and rationalize extension globals ([#787](https://github.com/MetaMask/ocap-kernel/pull/787))
- feat(ocap-kernel): add BIP39 mnemonic support for kernel identity seed recovery ([#780](https://github.com/MetaMask/ocap-kernel/pull/780))
- feat(omnium): Add caplet vat implementation ([#753](https://github.com/MetaMask/ocap-kernel/pull/753))
- chore(remotes): refactor folder structure into platform/ and kernel/ ([#749](https://github.com/MetaMask/ocap-kernel/pull/749))
- feat: Add CapTP infrastructure for kernel communication ([#751](https://github.com/MetaMask/ocap-kernel/pull/751))
- Add message sequencing and acknowledgment to remote messaging ([#744](https://github.com/MetaMask/ocap-kernel/pull/744))
- feat: Add Turborepo caching for test:dev and fix streams dev tests ([#757](https://github.com/MetaMask/ocap-kernel/pull/757))
- chore(deps): Update MetaMask ESLint dependencies and fix JSDoc compliance ([#741](https://github.com/MetaMask/ocap-kernel/pull/741))
- chore: Add Claude Code commands for common development and git workflows ([#725](https://github.com/MetaMask/ocap-kernel/pull/725))
- chore: Update vite & vitest dependencies to latest versions ([#717](https://github.com/MetaMask/ocap-kernel/pull/717))
- Refactor remote location hint handling ([#712](https://github.com/MetaMask/ocap-kernel/pull/712))
- feat: reject promises on connection loss ([#706](https://github.com/MetaMask/ocap-kernel/pull/706))
- Clean up `__dirname` use ([#701](https://github.com/MetaMask/ocap-kernel/pull/701))
- feat(remote-comms): Add explicit connection management for intentional disconnects ([#699](https://github.com/MetaMask/ocap-kernel/pull/699))
- fix(remote-comms): Fix message queueing and add e2e tests ([#697](https://github.com/MetaMask/ocap-kernel/pull/697))
- Plumbing for deterministic peerId generation during tests ([#696](https://github.com/MetaMask/ocap-kernel/pull/696))
- feat(remote-comms): Add Node.js e2e tests and fix shutdown handling ([#692](https://github.com/MetaMask/ocap-kernel/pull/692))
- feat(ocap-kernel): Automatic reconnection with exponential backoff for remote comms ([#678](https://github.com/MetaMask/ocap-kernel/pull/678))
- Ocap URL location hint handling ([#666](https://github.com/MetaMask/ocap-kernel/pull/666))
- feat: Add `omnium-gatherum` extension ([#654](https://github.com/MetaMask/ocap-kernel/pull/654))
- refactor: Rationalize endoify shims ([#650](https://github.com/MetaMask/ocap-kernel/pull/650))
- chore: Enable `n/prefer-node-protocol` ESLint rule ([#647](https://github.com/MetaMask/ocap-kernel/pull/647))
- chore(root): clean script removes .turbo cache ([#643](https://github.com/MetaMask/ocap-kernel/pull/643))
- refactor: Add `@ocap/repo-tools` ([#641](https://github.com/MetaMask/ocap-kernel/pull/641))
- build: Use Turborepo for root build script ([#634](https://github.com/MetaMask/ocap-kernel/pull/634))
- First pass of support for kernel-kernel network comms ([#578](https://github.com/MetaMask/ocap-kernel/pull/578))
- feat(ocap-kernel): use kernel platforms ([#615](https://github.com/MetaMask/ocap-kernel/pull/615))
- refactor: Migrate from `Far` to `makeExo` ([#612](https://github.com/MetaMask/ocap-kernel/pull/612))
- feat(nodejs): Abstract and export VatSupervisor factory ([#609](https://github.com/MetaMask/ocap-kernel/pull/609))

[Unreleased]: https://github.com/MetaMask/ocap-kernel/
