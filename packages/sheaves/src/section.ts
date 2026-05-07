import { makeExo } from '@endo/exo';
import type { InterfaceGuard } from '@endo/patterns';

import type { Handler } from './types.ts';

/**
 * Create a local handler from a name, guard, and method map.
 *
 * Encapsulates the cast from makeExo's opaque return type to Handler.
 * Use this when constructing handlers for a sheaf; do not use it for
 * the dispatch exo produced by sheafify itself.
 *
 * @param name - Exo tag name.
 * @param guard - Interface guard describing the handler's methods.
 * @param handlers - Method handler map.
 * @returns A Handler suitable for inclusion in a sheaf.
 */
export const makeHandler = (
  name: string,
  guard: InterfaceGuard,
  handlers: Record<string, (...args: unknown[]) => unknown>,
): Handler => makeExo(name, guard, handlers) as unknown as Handler;
