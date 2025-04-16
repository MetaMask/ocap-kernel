# `@ocap/kernel`

OCap kernel core components

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).

src/
├── kernel/
│ ├── MessageRouter.ts # For message routing and delivery logic
│ ├── ReferenceTranslator.ts # For reference translation between kernel and vats
│ ├── RunQueueProcessor.ts # For run queue operations
│ ├── PromiseController.ts # For promise-related operations
│ └── VatLifecycle.ts # For vat creation/termination (better than VatManager)
