Documentation:

- Check the [glossary](./docs/glossary.md) for definitions of unclear terms.

Development workflows:

- Use `yarn` and `yarn workspace` to run package scripts:
  - `lint:fix` for linting
  - `test:dev` for unit tests, `test` to include coverage
  - e2e tests invoked separately via `test:e2e`, if available
  - `build` from root is cached using Turborepo

General conventions:

- Use `@metamask/superstruct` for runtime type checking and to define object types
- Use TypeDoc for documentation
- Naming conventions:
  - Nouns for variable names (e.g. `isKernelActive`, `hasVatAccess`, `unresolvedMessages`)
  - Verbs for function names (e.g. `startVat`, `stopKernel`)
  - kebab-case for package and file names (`@ocap/test-utils`, `kernel-worker.js`, `vat.js`)
  - Factory methods: `X.make()`
  - Factory functions: `makeX()`
- If a function has more than two arguments or could be expected to grow thereto,
  give it an options bag (i.e. named parameters)

Object capability (ocap) patterns:

- Production code should run under "lockdown" from `@endo/lockdown`
  - Lockdown must be the first thing that runs in the given JavaScript realm for it to work
- Use `harden()` from `@endo/ses` for immutability where feasible
  - Including object literals, class instances, class prototypes, etc.
- Use `E()` from `@endo/eventual-send` to:
  - Communicate with objects between vats or between processes with a CapTP connection
  - Queue messages on a promise (that resolves to some object with methods)
- If an object is to be made remotable, turn it into an exo using the internal `makeDefaultExo`
  which builds on `@endo/exo`
  - Do not use `Far` from `@endo/far`
  - It's fine to use `E()` on local objects that aren't exos

Testing:

- Use `vitest` for testing
- Always use `toStrictEqual()` for deep object comparisons
- Use `it.each()` for parameterized tests
- Use logically nested `describe()` blocks
- Test titles should use concise verb forms without "should" (e.g., `it('creates and starts libp2p node', ...)` not `it('should create and start libp2p node', ...)`)
- Avoid negative cases, but if you must, use "does not" instead of "should not" (e.g., `it('does not duplicate relays', ...)`)
- Mock functions with `vi.fn()` and explicit return types
- Mock external dependencies using vitest's `vi.mock()`
- Aim for complete unit test coverage when writing tests

TypeScript:

- Prefer `type`; do not use `interface` declarations
- Prefer `#` private fields over `private` class fields
- Never use the `any` type
- Never use `enum`:s; always use string literal unions instead

File and directory structure:

- Maintain a monorepo structure using Yarn workspaces
- Place package source files under `<package-root>/src/`
- Co-locate a package's unit tests with their covered source files in the `<package-root>/src/` directory (e.g. `ocap-kernel/src/kernel-worker.ts` should be tested in `ocap-kernel/src/kernel-worker.test.ts`)
- Test utilities used by a single package should be separated into that package's `<package-root>/test/` directory
- Test utilities used by multiple packages should be relocated into the dedicated `test-utils` package

UI and styling:

- For React UI components, prefer CSS classes (e.g., `className="bg-section p-4 rounded mb-4"`) over inline styles
- Use design system components (BadgeStatus, TextComponent, etc.) consistently
- Maintain consistent spacing patterns (e.g., `gap-12`, `mb-4`, `mt-2`)

Cross-environment compatibility:

- Libraries should be platform-agnostic and run in any environment unless otherwise specified
- Packages like `extension` (browser) and `cli` (Node.js) are platform-specific
