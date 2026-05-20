/*
 * No-op harden shim for the hook process.
 *
 * The hook is not a vat — it must not run SES lockdown because full lockdown
 * is incompatible with native tree-sitter bindings. @endo modules call
 * harden() at module-evaluation time, so we install a benign identity
 * function as the global before any @endo import evaluates.
 *
 * ESM evaluates modules depth-first in import order, so placing this as
 * the first import in hook.ts guarantees it runs before @endo/promise-kit.
 */
(globalThis as { harden?: <T>(value: T) => T }).harden ??= (value) => value;
