import { makeExo } from '@endo/exo';
import type { Methods } from '@endo/exo';
import { M } from '@endo/patterns';
import type { InterfaceGuard } from '@endo/patterns';

import { makeDiscoverableExo } from './discoverable.ts';

/**
 * Shorthand for creating a named `@endo/patterns.InterfaceGuard` with default guards
 * set to 'passable'.
 *
 * @param name - The name of the interface.
 * @returns An interface with default guards set to 'passable'.
 */
export const makeDefaultInterface = (name: string): InterfaceGuard =>
  M.interface(name, {}, { defaultGuards: 'passable' });

/**
 * Shorthand for creating an `@endo/exo` remotable with default guards set to 'passable'.
 *
 * @param name - The name of the exo.
 * @param methods - The methods of the exo (i.e. the object to be made remotable).
 * @param interfaceGuard - The `@endo/patterns` interface guard to use for the exo.
 * @returns A named exo with default guards set to 'passable'.
 */
export const makeDefaultExo = <Interface extends Methods>(
  name: string,
  methods: Interface,
  interfaceGuard: InterfaceGuard = makeDefaultInterface(name),
): ReturnType<typeof makeExo<Interface>> =>
  // @ts-expect-error We're intentionally not specifying method-specific interface guards.
  makeExo(name, interfaceGuard, methods);

export { makeDiscoverableExo };
