import type { KernelFacade } from '@metamask/kernel-browser-runtime';

import type {
  CapletManifest,
  InstalledCaplet,
  InstallResult,
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
    caplet: {
      /**
       * Install a caplet.
       *
       * @param manifest - The caplet manifest.
       * @param bundle - Optional bundle (currently unused).
       * @returns The installation result.
       * @example
       * ```typescript
       * const result = await omnium.caplet.install({
       *   id: 'com.example.test',
       *   name: 'Test Caplet',
       *   version: '1.0.0',
       *   bundleSpec: '/path/to/bundle.json',
       *   requestedServices: [],
       *   providedServices: ['test'],
       * });
       * ```
       */
      install: (
        manifest: CapletManifest,
        bundle?: unknown,
      ) => Promise<InstallResult>;

      /**
       * Uninstall a caplet.
       *
       * @param capletId - The ID of the caplet to uninstall.
       */
      uninstall: (capletId: string) => Promise<void>;

      /**
       * List all installed caplets.
       *
       * @returns Array of installed caplets.
       */
      list: () => Promise<InstalledCaplet[]>;

      /**
       * Get a specific installed caplet.
       *
       * @param capletId - The caplet ID.
       * @returns The installed caplet or undefined if not found.
       */
      get: (capletId: string) => Promise<InstalledCaplet | undefined>;

      /**
       * Find a caplet that provides a specific service.
       *
       * @param serviceName - The service name to search for.
       * @returns The installed caplet or undefined if not found.
       */
      getByService: (
        serviceName: string,
      ) => Promise<InstalledCaplet | undefined>;

      /**
       * Get the root object presence for a caplet.
       *
       * @param capletId - The caplet ID.
       * @returns A promise for the caplet's root object (as a CapTP presence).
       * @example
       * ```typescript
       * const root = await omnium.caplet.getCapletRoot('com.example.echo');
       * const result = await E(root).echo('Hello!');
       * ```
       */
      getCapletRoot: (capletId: string) => Promise<unknown>;
    };
  };
}

export {};
