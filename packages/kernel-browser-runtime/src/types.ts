import type {
  ClusterConfig,
  Subcluster,
  KernelStatus,
  KernelFacetLaunchResult,
} from '@metamask/ocap-kernel';
import type { Json } from '@metamask/utils';

/**
 * A CapTP message that can be sent over the wire.
 */
export type CapTPMessage = Record<string, Json>;

/**
 * Result of launching a subcluster (legacy format with kref string).
 *
 * @deprecated Use KernelFacetLaunchResult instead, which returns a presence.
 */
export type LaunchResult = {
  subclusterId: string;
  rootKref: string;
};

/**
 * The kernel facade interface - methods exposed to userspace via CapTP.
 *
 * This is the remote presence type that the background receives from the kernel
 * via the kernel host vat. The kernel host vat runs as a system vat inside
 * the kernel worker and serves as the CapTP bootstrap object.
 *
 * Note: launchSubcluster now returns a presence in the `root` field instead of
 * a kref string. When received via CapTP, this becomes an E()-callable presence.
 */
export type KernelFacade = {
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
