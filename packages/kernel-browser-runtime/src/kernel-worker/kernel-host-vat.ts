import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type {
  SystemVatBuildRootObject,
  SystemSubclusterConfig,
  ClusterConfig,
  KernelStatus,
  Subcluster,
  KernelFacet,
  KernelFacetLaunchResult,
} from '@metamask/ocap-kernel';

/**
 * The kernel host vat's root object interface.
 *
 * This is the interface exposed by the kernel host vat to external clients
 * (like the background service worker) via CapTP.
 */
export type KernelHostRoot = {
  /**
   * Ping the kernel host.
   *
   * @returns 'pong' to confirm the host is responsive.
   */
  ping: () => Promise<'pong'>;

  /**
   * Launch a dynamic subcluster.
   *
   * @param config - Configuration for the subcluster.
   * @returns The launch result with subcluster ID and root presence.
   */
  launchSubcluster: (config: ClusterConfig) => Promise<KernelFacetLaunchResult>;

  /**
   * Terminate a subcluster.
   *
   * @param subclusterId - The ID of the subcluster to terminate.
   */
  terminateSubcluster: (subclusterId: string) => Promise<void>;

  /**
   * Get kernel status.
   *
   * @returns The current kernel status.
   */
  getStatus: () => Promise<KernelStatus>;

  /**
   * Reload a subcluster.
   *
   * @param subclusterId - The ID of the subcluster to reload.
   * @returns The reloaded subcluster.
   */
  reloadSubcluster: (subclusterId: string) => Promise<Subcluster>;

  /**
   * Get a subcluster by ID.
   *
   * @param subclusterId - The ID of the subcluster.
   * @returns The subcluster or undefined if not found.
   */
  getSubcluster: (subclusterId: string) => Subcluster | undefined;

  /**
   * Get all subclusters.
   *
   * @returns Array of all subclusters.
   */
  getSubclusters: () => Subcluster[];

  /**
   * Convert a kref string to a presence.
   *
   * Use this to restore a presence from a stored kref string after restart.
   *
   * @param kref - The kref string to convert.
   * @returns The presence for the given kref.
   */
  getVatRoot: (kref: string) => unknown;
};

/**
 * Create the configuration for launching the kernel host subcluster.
 *
 * @param onRootCreated - Callback invoked when the root object is created.
 * @returns The system subcluster configuration.
 */
export function makeKernelHostSubclusterConfig(
  onRootCreated: (root: KernelHostRoot) => void,
): SystemSubclusterConfig {
  const buildRootObject: SystemVatBuildRootObject = (vatPowers) => {
    const kernelFacet = vatPowers.kernelFacet as KernelFacet;

    const root = makeDefaultExo('KernelHostRoot', {
      ping: async () => 'pong' as const,

      launchSubcluster: async (config: ClusterConfig) => {
        // Use E() to call kernel facet - this gives us proper reference handling
        return E(kernelFacet).launchSubcluster(config);
      },

      terminateSubcluster: async (subclusterId: string) => {
        return E(kernelFacet).terminateSubcluster(subclusterId);
      },

      getStatus: async () => {
        return E(kernelFacet).getStatus();
      },

      reloadSubcluster: async (subclusterId: string) => {
        return E(kernelFacet).reloadSubcluster(subclusterId);
      },

      getSubcluster: (subclusterId: string) => {
        // Synchronous method - call directly
        return kernelFacet.getSubcluster(subclusterId);
      },

      getSubclusters: () => {
        // Synchronous method - call directly
        return kernelFacet.getSubclusters();
      },

      getVatRoot: async (kref: string) => {
        // Convert kref to slot value, which becomes a presence via CapTP
        return kernelFacet.getVatRoot(kref);
      },
    }) as KernelHostRoot;

    // Capture the root object for external use (e.g., CapTP bootstrap)
    onRootCreated(root);

    return root;
  };

  return {
    bootstrap: 'kernelHost',
    vats: {
      kernelHost: { buildRootObject },
    },
  };
}
harden(makeKernelHostSubclusterConfig);
