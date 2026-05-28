# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release ([#952](https://github.com/MetaMask/ocap-kernel/pull/952))
  - Wire-format types and runtime validators for service discovery: `ServiceDescription`, `ServiceQuery`, `ServiceMatch`, `ContactPoint`, `RegistrationToken`
  - JSON-serializable API schema vocabulary: `TypeSpec`, `ObjectSpec`, `MethodSpec`, `RemotableSpec`
  - One-way `MethodSchema` → `RemotableSpec` converter (`methodsToRemotableSpec`, `methodSchemaToMethodSpec`) for bridging existing discoverable-exo schemas into the new format

[Unreleased]: https://github.com/MetaMask/ocap-kernel/
