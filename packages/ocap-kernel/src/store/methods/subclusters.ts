import type { VatId, ClusterConfig } from '../../types.ts';
import type { StoreContext } from '../types.ts';

const SUBCLUSTER_CONFIG_BASE = 'subclusterConfig.';
const SUBCLUSTER_CONFIG_BASE_LEN = SUBCLUSTER_CONFIG_BASE.length;

/**
 * Get a subcluster store object that provides functionality for managing subcluster records.
 *
 * @param ctx - The store context.
 * @returns A subcluster store object that maps various persistent kernel data
 * structures onto `kdb`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getSubclusterMethods(ctx: StoreContext) {
  const { kv } = ctx;

  function getSubclusters(): Readonly<Record<string, ClusterConfig>> {}
  function getSubclusterIds(): string[] {}
  function getVatSubclusterId(vatId: VatId): string | undefined {}
  function getSubclusterVatIds(subclusterId: string): VatId[] {}
  function setSubclusterConfig(
    subclusterId: string,
    config: ClusterConfig,
  ): void {}
  function deleteSubcluster(subclusterId: string): void {}
  function deleteSubclusterVat(subclusterId: string, vatId: VatId): void {}
  function getNextSubclusterId(): string {}

  return {
    getSubclusters,
    getSubclusterIds,
    getVatSubclusterId,
    getSubclusterVatIds,
    setSubclusterConfig,
    deleteSubcluster,
    deleteSubclusterVat,
    getNextSubclusterId,
  };
}
