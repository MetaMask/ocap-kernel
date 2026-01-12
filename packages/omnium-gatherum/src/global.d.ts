import type { KernelFacade } from '@metamask/kernel-browser-runtime';
import type { Promisified } from '@metamask/kernel-utils';

import type { CapletControllerFacet, CapletManifest } from './controllers/index.ts';

// Type declarations for omnium dev console API.
declare global {
  /**
   * The E() function from @endo/eventual-send for making eventual sends.
   * Set globally in the trusted prelude before lockdown.
   *
   * @example
   * ```typescript
   * const kernel = await omnium.getKernel();
   * const status = await E(kernel).getStatus();
   * ```
   */
  // eslint-disable-next-line no-var,id-length
  var E: typeof import('@endo/eventual-send').E;

  // eslint-disable-next-line no-var
  var omnium: {
    /**
     * Ping the kernel to verify connectivity.
     */
    ping: () => Promise<void>;

    /**
     * Get the kernel remote presence for use with E().
     *
     * @returns A promise for the kernel facade remote presence.
     * @example
     * ```typescript
     * const kernel = await omnium.getKernel();
     * const status = await E(kernel).getStatus();
     * ```
     */
    getKernel: () => Promise<KernelFacade>;

    /**
     * Pre-defined caplet manifests for convenience.
     *
     * @example
     * ```typescript
     * await omnium.caplet.install(omnium.manifests.echo);
     * ```
     */
    manifests: {
      echo: CapletManifest;
    };

    /**
     * Caplet management API.
     */
    caplet: Promisified<CapletControllerFacet>;
  };
}

export {};
