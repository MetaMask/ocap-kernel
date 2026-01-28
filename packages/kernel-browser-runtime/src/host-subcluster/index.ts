/**
 * Host subcluster utilities for browser runtime.
 *
 * The host subcluster enables the background script to use E() on vat object
 * presences directly, replacing CapTP. The background becomes the bootstrap
 * vat of a system subcluster and receives a kernel facet as a vatpower.
 */

export type {
  HostSubclusterConfig,
  HostSubclusterResult,
  HostSubclusterVat,
} from './types.ts';

export { makeHostSubcluster } from './make-host-subcluster.ts';
