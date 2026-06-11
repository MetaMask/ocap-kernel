# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** The matcher vat ranks via the daemon's `languageModelService` kernel service instead of the external `@ocap/llm-bridge` process; ranking is stateless (each `findServices` call carries the full current registry in one chat-completion request) and registrations no longer involve the LLM
- **BREAKING:** `makeMatcherClusterConfig` requires a `model` option, passed to the matcher vat as its `model` parameter
- `start-matcher.sh` provisions the daemon's `llm.json` instead of spawning an llm-bridge process

[Unreleased]: https://github.com/MetaMask/ocap-kernel/
