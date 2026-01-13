import type { KernelFacade } from '@metamask/kernel-browser-runtime';
import type { Promisified } from '@metamask/kernel-utils';

import type {
  CapletControllerFacet,
  CapletManifest,
} from './controllers/index.ts';

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
  var kernel: KernelFacade | Promise<KernelFacade>;

  // eslint-disable-next-line no-var
  var omnium: {
    /**
     * Caplet management API.
     */
    caplet: Promisified<CapletControllerFacet> & {
      /**
       * Load a caplet's manifest and bundle by ID.
       *
       * @param id - The short caplet ID (e.g., 'echo').
       * @returns The manifest and bundle for installation.
       * @example
       * ```typescript
       * const { manifest, bundle } = await omnium.caplet.load('echo');
       * await omnium.caplet.install(manifest);
       * ```
       */
      load: (
        id: string,
      ) => Promise<{ manifest: CapletManifest; bundle: unknown }>;
    };
  };
}

export {};
