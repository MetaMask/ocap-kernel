# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **SECURITY:** `makeHostRestrictedFetch` no longer follows a redirect out of `allowedHosts`. The host was checked against the pre-flight URL alone, so an allowed host answering a `302` sent the request outside the allowlist and returned its response. Every hop is now checked, a `redirect` of `follow` in the caller's `init` or on a `Request` cannot override that, and a `dispatcher` in `init` — which undici honours in place of the transport — is refused ([#1026](https://github.com/MetaMask/ocap-kernel/pull/1026))
  - A hop that keeps the request body fails unless the body can be sent twice, with an error naming the hop and the reason. A `Request`'s body is always a stream, so a `Request` carrying one fails here where `fetch` would have replayed it
- **SECURITY:** `makeHostRestrictedFetch` no longer lets a caller reach a host outside `allowedHosts`. The host was checked against one resolution of the input and then the input itself was forwarded to `fetch`, which resolved it a second time, so an input answering differently on each read was checked as an allowed host and requested as a forbidden one (CWE-367). The input is now resolved exactly once and replaced with a stand-in that cannot resolve to another URL ([#1026](https://github.com/MetaMask/ocap-kernel/pull/1026))

[Unreleased]: https://github.com/MetaMask/ocap-kernel/
