import { makeExo } from '@endo/exo';
import type { InterfaceGuard } from '@endo/patterns';

import type { Section } from './types.ts';

/**
 * Create a local presheaf section from a name, guard, and handler map.
 *
 * Encapsulates the cast from makeExo's opaque return type to Section.
 * Use this when constructing sections for a presheaf; do not use it for
 * the dispatch exo produced by sheafify itself.
 *
 * @param name - Exo tag name.
 * @param guard - Interface guard describing the section's methods.
 * @param handlers - Method handler map.
 * @returns A Section suitable for inclusion in a presheaf.
 */
export const makeSection = (
  name: string,
  guard: InterfaceGuard,
  handlers: Record<string, (...args: unknown[]) => unknown>,
): Section => makeExo(name, guard, handlers) as unknown as Section;
