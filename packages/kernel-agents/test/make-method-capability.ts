import { S } from '@metamask/kernel-utils';
import type { DescribedMethod } from '@metamask/kernel-utils';

import { makeInternalCapabilities } from '../src/capabilities/discover.ts';
import type { CapabilitySpec } from '../src/types.ts';

/**
 * Build a capability exposing a single method, backed by a pattern-guarded
 * discoverable exo, for tests that need an ad-hoc capability. Mirrors how the
 * built-in capabilities are authored, so the exo's interface guard enforces the
 * method's argument shape — there is no membraneless authoring path.
 *
 * @param name - The exo/interface name.
 * @param method - The method (and capability) name.
 * @param impl - The method implementation (positional arguments).
 * @param described - The method's guard and schema (use `S.method` from
 * `@metamask/kernel-utils`).
 * @returns The capability spec.
 */
export const makeMethodCapability = (
  name: string,
  method: string,
  impl: (...args: never[]) => unknown,
  described: DescribedMethod,
): CapabilitySpec<never, unknown> => {
  const capabilities = makeInternalCapabilities(
    name,
    { [method]: impl } as Record<
      string,
      (...args: never[]) => Promise<unknown>
    >,
    S.interface(name, { [method]: described }),
  );
  return capabilities[method] as CapabilitySpec<never, unknown>;
};
