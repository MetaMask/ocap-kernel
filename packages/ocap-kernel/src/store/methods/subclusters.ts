import { SubclusterNotFoundError } from '@metamask/kernel-errors';

import type {
  ClusterConfig,
  Subcluster,
  SubclusterId,
  VatId,
} from '../../types.ts';
import type { StoreContext } from '../types.ts';
import { getBaseMethods } from './base.ts';

/**
 * Get a subcluster store object that provides functionality for managing subcluster records.
 *
 * @param ctx - The store context.
 * @returns A subcluster store object that maps various persistent kernel data
 * structures.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getSubclusterMethods(ctx: StoreContext) {
  const { kv } = ctx;
  const { incCounter } = getBaseMethods(kv);

  /**
   * Retrieves all subclusters from persistent storage.
   *
   * @returns An array of all stored subclusters.
   */
  function getAllSubclustersFromStorage(): Subcluster[] {
    const subclustersJSON = ctx.subclusters.get();
    return subclustersJSON ? (JSON.parse(subclustersJSON) as Subcluster[]) : [];
  }

  /**
   * Saves all subclusters to persistent storage.
   *
   * @param subclusters - The array of subclusters to save.
   */
  function saveAllSubclustersToStorage(subclusters: Subcluster[]): void {
    ctx.subclusters.set(JSON.stringify(subclusters));
  }

  /**
   * Retrieves the vat to subcluster mapping from persistent storage.
   *
   * @returns A record mapping VatIds to SubclusterIds.
   */
  function getVatToSubclusterMapFromStorage(): Record<VatId, SubclusterId> {
    const mapJSON = ctx.vatToSubclusterMap.get();
    return mapJSON ? (JSON.parse(mapJSON) as Record<VatId, SubclusterId>) : {};
  }

  /**
   * Saves the vat to subcluster mapping to persistent storage.
   *
   * @param map - The vat to subcluster map to save.
   */
  function saveVatToSubclusterMapToStorage(
    map: Record<VatId, SubclusterId>,
  ): void {
    ctx.vatToSubclusterMap.set(JSON.stringify(map));
  }

  /**
   * Adds a new subcluster with the given configuration.
   *
   * @param config - The configuration for the new subcluster.
   * @returns The ID of the newly created subcluster.
   * @throws If a subcluster with the generated ID already exists.
   */
  function addSubcluster(config: ClusterConfig): SubclusterId {
    const currentSubclusters = getAllSubclustersFromStorage();
    const newId = `s${incCounter(ctx.nextSubclusterId)}`;

    // In a multi-writer scenario, a robust check or transactional update would be needed.
    // For now, assuming incCounter provides sufficient uniqueness for typical operation.
    if (currentSubclusters.some((sc) => sc.id === newId)) {
      // This should be rare if incCounter is working as expected.
      throw new Error(
        `Generated subcluster ID ${newId} already exists. This indicates a potential issue with ID generation.`,
      );
    }

    const newSubcluster: Subcluster = {
      id: newId,
      config,
      vats: [],
    };
    currentSubclusters.push(newSubcluster);
    saveAllSubclustersToStorage(currentSubclusters);
    return newId;
  }

  /**
   * Checks if a subcluster with the given ID exists.
   *
   * @param subclusterId - The ID of the subcluster to check.
   * @returns True if the subcluster exists, false otherwise.
   */
  function hasSubcluster(subclusterId: SubclusterId): boolean {
    const currentSubclusters = getAllSubclustersFromStorage();
    return currentSubclusters.some((sc) => sc.id === subclusterId);
  }

  /**
   * Retrieves all subclusters.
   *
   * @returns An array of all subclusters.
   */
  function getSubclusters(): Subcluster[] {
    return getAllSubclustersFromStorage();
  }

  /**
   * Retrieves a specific subcluster by its ID.
   *
   * @param subclusterId - The ID of the subcluster to retrieve.
   * @returns The subcluster if found, otherwise undefined.
   */
  function getSubcluster(subclusterId: SubclusterId): Subcluster | undefined {
    const currentSubclusters = getAllSubclustersFromStorage();
    return currentSubclusters.find((sc) => sc.id === subclusterId);
  }

  /**
   * Adds a vat to the specified subcluster.
   *
   * @param subclusterId - The ID of the subcluster.
   * @param vatId - The ID of the vat to add.
   * @throws If the subcluster is not found.
   */
  function addSubclusterVat(subclusterId: SubclusterId, vatId: VatId): void {
    const currentSubclusters = getAllSubclustersFromStorage();
    const subcluster = currentSubclusters.find((sc) => sc.id === subclusterId);

    if (!subcluster) {
      throw new SubclusterNotFoundError(subclusterId);
    }

    if (!subcluster.vats.includes(vatId)) {
      subcluster.vats.push(vatId);
      saveAllSubclustersToStorage(currentSubclusters);
    }

    const currentMap = getVatToSubclusterMapFromStorage();
    if (currentMap[vatId] !== subclusterId) {
      if (currentMap[vatId]) {
        // This vat was previously in another subcluster, which might indicate an issue
        console.warn(
          `vat ${vatId} is being moved from subcluster ${currentMap[vatId]} to ${subclusterId}.`,
        );
      }
      currentMap[vatId] = subclusterId;
      saveVatToSubclusterMapToStorage(currentMap);
    }
  }

  /**
   * Retrieves all VATs associated with a specific subcluster.
   *
   * @param subclusterId - The ID of the subcluster.
   * @returns An array of VatIds associated with the subcluster.
   * @throws If the subcluster is not found.
   */
  function getSubclusterVats(subclusterId: SubclusterId): VatId[] {
    const subcluster = getSubcluster(subclusterId);
    if (!subcluster) {
      throw new SubclusterNotFoundError(subclusterId);
    }
    return [...subcluster.vats];
  }

  /**
   * Deletes a vat from a specified subcluster.
   *
   * @param subclusterId - The ID of the subcluster.
   * @param vatId - The ID of the vat to delete.
   */
  function deleteSubclusterVat(subclusterId: SubclusterId, vatId: VatId): void {
    const currentSubclusters = getAllSubclustersFromStorage();
    const subcluster = currentSubclusters.find((sc) => sc.id === subclusterId);

    let subclustersModified = false;
    if (subcluster) {
      const vatIndex = subcluster.vats.indexOf(vatId);
      if (vatIndex > -1) {
        subcluster.vats.splice(vatIndex, 1);
        subclustersModified = true;
      }
    }

    if (subclustersModified) {
      saveAllSubclustersToStorage(currentSubclusters);
    }

    const currentMap = getVatToSubclusterMapFromStorage();
    if (currentMap[vatId] === subclusterId) {
      delete currentMap[vatId];
      saveVatToSubclusterMapToStorage(currentMap);
    } else if (currentMap[vatId] && !subcluster) {
      // Vat is mapped to a subclusterId that we're trying to delete it from,
      // but that subcluster wasn't found in the main list (or it's a different one).
      // This case might indicate an inconsistency, but we'll still try to clear the map entry for the given vatId.
      delete currentMap[vatId];
      saveVatToSubclusterMapToStorage(currentMap);
    }
  }

  /**
   * Deletes a subcluster and removes its VATs from the vat-to-subcluster map.
   *
   * @param subclusterId - The ID of the subcluster to delete.
   */
  function deleteSubcluster(subclusterId: SubclusterId): void {
    let currentSubclusters = getAllSubclustersFromStorage();
    const subclusterToDelete = currentSubclusters.find(
      (sc) => sc.id === subclusterId,
    );

    if (!subclusterToDelete) {
      return; // Subcluster not found, nothing to delete.
    }

    const vatsInDeletedSubcluster = [...subclusterToDelete.vats];

    currentSubclusters = currentSubclusters.filter(
      (sc) => sc.id !== subclusterId,
    );
    saveAllSubclustersToStorage(currentSubclusters);

    const currentMap = getVatToSubclusterMapFromStorage();
    let mapModified = false;
    for (const vatId of vatsInDeletedSubcluster) {
      if (currentMap[vatId] === subclusterId) {
        delete currentMap[vatId];
        mapModified = true;
      }
    }

    if (mapModified) {
      saveVatToSubclusterMapToStorage(currentMap);
    }
  }

  /**
   * Retrieves the subcluster ID for a given vat ID.
   *
   * @param vatId - The ID of the vat.
   * @returns The ID of the subcluster the vat belongs to, or undefined if not found.
   */
  function getVatSubcluster(vatId: VatId): SubclusterId | undefined {
    const currentMap = getVatToSubclusterMapFromStorage();
    return currentMap[vatId];
  }

  return {
    addSubcluster,
    getSubcluster,
    hasSubcluster,
    getSubclusters,
    deleteSubcluster,
    addSubclusterVat,
    getSubclusterVats,
    deleteSubclusterVat,
    getVatSubcluster,
  };
}
