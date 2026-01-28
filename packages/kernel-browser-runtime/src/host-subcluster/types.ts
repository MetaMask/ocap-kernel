import type { Kernel, SystemVatBuildRootObject } from '@metamask/ocap-kernel';
import type { Json } from '@metamask/utils';

/**
 * Configuration for a single vat within the host subcluster.
 */
export type HostSubclusterVat = {
  /** Function to build the vat's root object. */
  buildRootObject: SystemVatBuildRootObject;
  /** Optional parameters to pass to buildRootObject. */
  parameters?: Record<string, Json>;
};

/**
 * Configuration for the host subcluster.
 */
export type HostSubclusterConfig = {
  /** The name of the bootstrap vat (must exist in vats). */
  bootstrap: string;
  /** Map of vat names to their configurations. */
  vats: Record<string, HostSubclusterVat>;
  /** Optional list of kernel service names to provide to the bootstrap vat. */
  services?: string[];
};

/**
 * Result of launching the host subcluster.
 */
export type HostSubclusterResult = {
  /** The system subcluster ID. */
  systemSubclusterId: string;
  /** Map of vat names to their system vat IDs. */
  vatIds: Record<string, string>;
};

/**
 * Options for creating the host subcluster.
 */
export type MakeHostSubclusterOptions = {
  /** The kernel instance. */
  kernel: Kernel;
  /** Configuration for the host subcluster. */
  config: HostSubclusterConfig;
};
