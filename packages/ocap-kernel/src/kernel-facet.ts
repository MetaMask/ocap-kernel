import { makeDefaultExo } from '@metamask/kernel-utils';

import type { Kernel } from './Kernel.ts';

/**
 * Dependencies required to create a kernel facet.
 */
export type KernelFacetDependencies = Pick<
  Kernel,
  | 'getPresence'
  | 'getStatus'
  | 'getSubcluster'
  | 'getSubclusters'
  | 'getSystemSubclusterRoot'
  | 'launchSubcluster'
  | 'pingVat'
  | 'queueMessage'
  | 'reloadSubcluster'
  | 'reset'
  | 'terminateSubcluster'
>;

/**
 * The kernel facet interface.
 *
 * This is the interface provided as a vatpower to the bootstrap vat of a
 * system vat. It enables privileged kernel operations.
 */
export type KernelFacet = KernelFacetDependencies & {
  /**
   * Ping the kernel.
   *
   * @returns The string 'pong'.
   */
  ping: () => 'pong';
};

/**
 * Creates a kernel facet exo that provides privileged kernel operations.
 *
 * All methods except ping() are delegated directly from the kernel.
 *
 * @param deps - Bound kernel methods to expose on the facet.
 * @returns The kernel facet exo.
 */
export function makeKernelFacet(deps: KernelFacetDependencies): KernelFacet {
  return makeDefaultExo('kernelFacet', {
    ...deps,
    ping: () => 'pong' as const,
  }) as KernelFacet;
}
