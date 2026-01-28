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
  Kernel,
} from '@metamask/ocap-kernel';

/**
 * The kernel host vat's root object interface.
 *
 * This is the interface exposed by the kernel host vat to the host application.
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
    }) as KernelHostRoot;

    // Capture the root object for external use
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

/**
 * Result of launching the host subcluster.
 */
export type HostSubclusterResult = {
  /**
   * The system subcluster ID.
   */
  systemSubclusterId: string;

  /**
   * The kernel host root object for interacting with the kernel.
   */
  kernelHostRoot: KernelHostRoot;
};

/**
 * Launch the host subcluster on a kernel.
 *
 * This creates a system subcluster with a kernel host vat that provides
 * privileged kernel operations. The returned root object can be used directly
 * to interact with the kernel (e.g., launch subclusters, get status).
 *
 * @param kernel - The kernel instance to launch the host subcluster on.
 * @returns The host subcluster result with the system subcluster ID and root object.
 */
export async function makeHostSubcluster(
  kernel: Kernel,
): Promise<HostSubclusterResult> {
  let kernelHostRoot: KernelHostRoot | undefined;

  const hostSubclusterConfig = makeKernelHostSubclusterConfig((root) => {
    kernelHostRoot = root;
  });

  const result = await kernel.launchSystemSubcluster(hostSubclusterConfig);

  if (!kernelHostRoot) {
    throw new Error('Failed to capture kernel host root object');
  }

  return harden({
    systemSubclusterId: result.systemSubclusterId,
    kernelHostRoot,
  });
}
harden(makeHostSubcluster);
