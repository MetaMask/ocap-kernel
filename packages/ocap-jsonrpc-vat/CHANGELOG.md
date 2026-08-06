# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release: vat serving a line-delimited JSON-RPC 2.0 protocol on a Unix-domain-socket `IOService` endowment
  - `redeemURL(url)` redeems an OCAP URL through the kernel's `ocapURLRedemptionService` and returns a sigil name of the form `@@j<n>` referring to the resulting live reference
  - `send(target, method, args)` invokes `E(target)[method](...args)` with `@@j<n>` markers in `args` expanded to their live references and any remotable in the result substituted for its sigil name
  - A result containing an unsettled promise is refused with an internal error rather than serialized: a promise has no own enumerable properties, so it would otherwise become `{}` in a response that `JSON.stringify` accepts, silently handing the client a success payload with the value missing
  - Session state is in-memory only and resets on socket disconnect

[Unreleased]: https://github.com/MetaMask/ocap-kernel/
