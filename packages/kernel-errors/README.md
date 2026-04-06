# `@metamask/kernel-errors`

Error types, utilities, and serialization for the OCAP kernel.

This package contains three distinct categories of error tooling, each serving
a different domain. They exist in the same package because they share base
infrastructure, but they are not interchangeable.

## Error classes (`src/errors/`)

Typed `BaseError` subclasses used **kernel-side and host-side**. Each carries a
structured `.code` (`ErrorCode` enum) and `.data` (JSON) property. Kernel code
inspects these via `instanceof` checks and type guards like
`isResourceLimitError()`.

These classes **never reach vat code directly** — they are thrown and caught
within the kernel, platform services, and agent infrastructure.

## Stream error marshalling (`src/marshal/`)

Custom JSON serialization (`marshalError` / `unmarshalError`) that preserves
`.code`, `.data`, `.cause`, and `.stack` across stream and IPC boundaries. Used
by `@metamask/streams` to transport errors through message ports.

This is unrelated to the kernel's `@endo/marshal`-based `kser`/`kunser`
serialization. The two systems operate at different layers and never interact.

## Vat-observable error codes (`src/vat-observable-errors.ts`)

Machine-readable codes embedded in the error `.message` for errors that reach
**vat code as promise rejections**. These errors are serialized via `kser`
(`@endo/marshal` with `errorTagging: 'off'`), which strips all `Error`
properties except `.message` and `.name`. The message is therefore the only
reliable channel for structured information.

Format: `[KERNEL:<CODE>] Human-readable detail` for expected errors,
`[KERNEL:VAT_FATAL:<CODE>] detail` for fatal errors that terminate the vat.

Detection utilities (`isKernelError`, `getKernelErrorCode`,
`isFatalKernelError`) let vat code programmatically categorize these errors.

## Installation

`yarn add @metamask/kernel-errors`

or

`npm install @metamask/kernel-errors`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found
in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
