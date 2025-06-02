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
  function getSubclusters(): Subcluster[] {
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
  function getVatToSubclusterMap(): Record<VatId, SubclusterId> {
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
   */
  function addSubcluster(config: ClusterConfig): SubclusterId {
    const currentSubclusters = getSubclusters();
    const newId = `s${incCounter(ctx.nextSubclusterId)}`;
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
   * Retrieves a specific subcluster by its ID.
   *
   * @param subclusterId - The ID of the subcluster to retrieve.
   * @returns The subcluster if found, otherwise undefined.
   */
  function getSubcluster(subclusterId: SubclusterId): Subcluster | undefined {
    const currentSubclusters = getSubclusters();
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
    const currentSubclusters = getSubclusters();
    const subcluster = currentSubclusters.find((sc) => sc.id === subclusterId);

    if (!subcluster) {
      throw new SubclusterNotFoundError(subclusterId);
    }

    // Add vat to subcluster if not already present
    if (!subcluster.vats.includes(vatId)) {
      subcluster.vats.push(vatId);
      saveAllSubclustersToStorage(currentSubclusters);
    }

    // Update vat mapping
    const currentMap = getVatToSubclusterMap();
    if (currentMap[vatId] !== subclusterId) {
      if (currentMap[vatId]) {
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
    const currentSubclusters = getSubclusters();
    const subcluster = currentSubclusters.find((sc) => sc.id === subclusterId);

    // Remove vat from subcluster's vats array if subcluster exists
    if (subcluster) {
      const vatIndex = subcluster.vats.indexOf(vatId);
      if (vatIndex > -1) {
        subcluster.vats.splice(vatIndex, 1);
        saveAllSubclustersToStorage(currentSubclusters);
      }
    }

    // Always remove vat from the mapping if it points to this subcluster
    const currentMap = getVatToSubclusterMap();
    if (currentMap[vatId] === subclusterId) {
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
    const currentSubclusters = getSubclusters();
    const subclusterToDelete = currentSubclusters.find(
      (sc) => sc.id === subclusterId,
    );

    if (!subclusterToDelete) {
      return;
    }

    // Remove subcluster from the list
    const updatedSubclusters = currentSubclusters.filter(
      (sc) => sc.id !== subclusterId,
    );
    saveAllSubclustersToStorage(updatedSubclusters);

    // Remove all vats from the mapping
    const currentMap = getVatToSubclusterMap();
    const vatsToRemove = subclusterToDelete.vats.filter(
      (vatId) => currentMap[vatId] === subclusterId,
    );

    if (vatsToRemove.length > 0) {
      for (const vatId of vatsToRemove) {
        delete currentMap[vatId];
      }
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
    const currentMap = getVatToSubclusterMap();
    return currentMap[vatId];
  }

  /**
   * Clears empty subclusters.
   */
  function clearEmptySubclusters(): void {
    const currentSubclusters = getSubclusters();
    const nonEmptySubclusters = currentSubclusters.filter(
      (sc) => sc.vats.length > 0,
    );
    if (nonEmptySubclusters.length !== currentSubclusters.length) {
      saveAllSubclustersToStorage(nonEmptySubclusters);
    }
  }

  /**
   * Removes a vat from its subcluster.
   *
   * @param vatId - The ID of the vat to remove.
   */
  function removeVatFromSubcluster(vatId: VatId): void {
    const subclusterId = getVatSubcluster(vatId);
    if (subclusterId) {
      deleteSubclusterVat(subclusterId, vatId);
    }
  }

  return {
    addSubcluster,
    getSubcluster,
    getSubclusters,
    deleteSubcluster,
    addSubclusterVat,
    getSubclusterVats,
    deleteSubclusterVat,
    getVatSubcluster,
    clearEmptySubclusters,
    removeVatFromSubcluster,
  };
}
