import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type {
  Baggage,
  ClusterConfig,
  KernelStatus,
  Subcluster,
  SubclusterLaunchResult,
} from '@metamask/ocap-kernel';

/**
 * Kernel facet interface for system vat operations.
 */
type KernelFacet = {
  getStatus: () => Promise<KernelStatus>;
  getSubclusters: () => Promise<Subcluster[]>;
  launchSubcluster: (config: ClusterConfig) => Promise<SubclusterLaunchResult>;
  terminateSubcluster: (subclusterId: string) => Promise<void>;
};

/**
 * Services provided to the system vat during bootstrap.
 */
type BootstrapServices = {
  kernelFacet?: KernelFacet;
};

/**
 * Parameters for the system vat.
 */
type VatParameters = {
  name?: string;
};

/**
 * Build function for a test vat that runs in a system subcluster and uses kernel services.
 *
 * @param _vatPowers - The vat powers (unused).
 * @param parameters - The vat parameters.
 * @param baggage - The vat's persistent baggage storage.
 * @returns The root object for the new vat.
 */
export function buildRootObject(
  _vatPowers: unknown,
  parameters: VatParameters,
  baggage: Baggage,
) {
  const name = parameters.name ?? 'system-vat';

  // Restore kernelFacet from baggage if available (for resuscitation)
  let kernelFacet: KernelFacet | undefined = baggage.has('kernelFacet')
    ? (baggage.get('kernelFacet') as KernelFacet)
    : undefined;

  return makeDefaultExo('root', {
    /**
     * Bootstrap the vat.
     *
     * @param _vats - The vats object (unused).
     * @param services - The services object.
     */
    async bootstrap(
      _vats: unknown,
      services: BootstrapServices,
    ): Promise<void> {
      console.log(`system subcluster vat ${name} bootstrap`);
      if (!kernelFacet) {
        kernelFacet = services.kernelFacet;
        // Store in baggage for persistence across restarts
        baggage.init('kernelFacet', kernelFacet);
      }
    },

    /**
     * Check if the kernel facet was received during bootstrap.
     *
     * @returns True if kernelFacet is defined.
     */
    hasKernelFacet(): boolean {
      return kernelFacet !== undefined;
    },

    /**
     * Get the kernel status via the kernel facet.
     *
     * @returns The kernel status.
     */
    async getKernelStatus(): Promise<KernelStatus> {
      return E(kernelFacet).getStatus();
    },

    /**
     * Get all subclusters via the kernel facet.
     *
     * @returns The list of subclusters.
     */
    async getSubclusters(): Promise<Subcluster[]> {
      return E(kernelFacet).getSubclusters();
    },

    /**
     * Launch a subcluster via the kernel facet.
     *
     * @param config - The cluster configuration.
     * @returns The launch result.
     */
    async launchSubcluster(
      config: ClusterConfig,
    ): Promise<SubclusterLaunchResult> {
      return E(kernelFacet).launchSubcluster(config);
    },

    /**
     * Terminate a subcluster via the kernel facet.
     *
     * @param subclusterId - The ID of the subcluster to terminate.
     * @returns A promise that resolves when the subcluster is terminated.
     */
    async terminateSubcluster(subclusterId: string): Promise<void> {
      return E(kernelFacet).terminateSubcluster(subclusterId);
    },

    /**
     * Store a value in the baggage.
     *
     * @param key - The key to store the value under.
     * @param value - The value to store.
     */
    storeToBaggage(key: string, value: unknown): void {
      if (baggage.has(key)) {
        baggage.set(key, value);
      } else {
        baggage.init(key, value);
      }
    },

    /**
     * Retrieve a value from the baggage.
     *
     * @param key - The key to retrieve.
     * @returns The stored value, or undefined if not found.
     */
    getFromBaggage(key: string): unknown {
      return baggage.has(key) ? baggage.get(key) : undefined;
    },

    /**
     * Check if a key exists in the baggage.
     *
     * @param key - The key to check.
     * @returns True if the key exists in baggage.
     */
    hasBaggageKey(key: string): boolean {
      return baggage.has(key);
    },
  });
}
