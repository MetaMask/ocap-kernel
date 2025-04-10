import { getBaseMethods } from './base.ts';
import { getCListMethods } from './clist.ts';
import { getReachableMethods } from './reachable.ts';
import type { EndpointId, KRef, VatConfig, VatId } from '../../types.ts';
import type { StoreContext, VatCleanupWork } from '../types.ts';
import { parseRef } from '../utils/parse-ref.ts';
import { parseReachableAndVatSlot } from '../utils/reachable.ts';

type VatRecord = {
  vatID: VatId;
  vatConfig: VatConfig;
};

const VAT_CONFIG_BASE = 'vatConfig.';
const VAT_CONFIG_BASE_LEN = VAT_CONFIG_BASE.length;

/**
 * Get a vat store object that provides functionality for managing vat records.
 *
 * @param ctx - The store context.
 * @returns A vat store object that maps various persistent kernel data
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getVatMethods(ctx: StoreContext) {
  const { kv } = ctx;
  const { getPrefixedKeys, getSlotKey } = getBaseMethods(ctx.kv);
  const { decrementRefCount } = getCListMethods(ctx);
  const { clearReachableFlag } = getReachableMethods(ctx);

  /**
   * Delete all persistent state associated with an endpoint.
   *
   * @param endpointId - The endpoint whose state is to be deleted.
   */
  function deleteEndpoint(endpointId: EndpointId): void {
    for (const key of getPrefixedKeys(`cle.${endpointId}.`)) {
      kv.delete(key);
    }
    for (const key of getPrefixedKeys(`clk.${endpointId}.`)) {
      kv.delete(key);
    }
    kv.delete(`e.nextObjectId.${endpointId}`);
    kv.delete(`e.nextPromiseId.${endpointId}`);
  }

  /**
   * Generator that yields the configurations of running vats.
   *
   * @yields a series of vat records for all configured vats.
   */
  function* getAllVatRecords(): Generator<VatRecord> {
    for (const vatKey of getPrefixedKeys(VAT_CONFIG_BASE)) {
      const vatID = vatKey.slice(VAT_CONFIG_BASE_LEN);
      const vatConfig = getVatConfig(vatID);
      yield { vatID, vatConfig };
    }
  }

  /**
   * Get all vat IDs from the store.
   *
   * @returns an array of vat IDs.
   */
  function getVatIDs(): VatId[] {
    return Array.from(getPrefixedKeys(VAT_CONFIG_BASE)).map((vatKey) =>
      vatKey.slice(VAT_CONFIG_BASE_LEN),
    );
  }

  /**
   * Fetch the stored configuration for a vat.
   *
   * @param vatID - The vat whose configuration is sought.
   *
   * @returns the configuration for the given vat.
   */
  function getVatConfig(vatID: VatId): VatConfig {
    return JSON.parse(
      kv.getRequired(`${VAT_CONFIG_BASE}${vatID}`),
    ) as VatConfig;
  }

  /**
   * Store the configuration for a vat.
   *
   * @param vatID - The vat whose configuration is to be set.
   * @param vatConfig - The configuration to write.
   */
  function setVatConfig(vatID: VatId, vatConfig: VatConfig): void {
    kv.set(`${VAT_CONFIG_BASE}${vatID}`, JSON.stringify(vatConfig));
  }

  /**
   * Delete the stored configuration for a vat.
   *
   * @param vatID - The vat whose configuration is to be deleted.
   */
  function deleteVatConfig(vatID: VatId): void {
    kv.delete(`${VAT_CONFIG_BASE}${vatID}`);
  }

  /**
   * Checks if a vat imports the specified kernel slot.
   *
   * @param vatID - The ID of the vat to check.
   * @param kernelSlot - The kernel slot reference.
   * @returns True if the vat imports the kernel slot, false otherwise.
   */
  function importsKernelSlot(vatID: VatId, kernelSlot: KRef): boolean {
    const data = ctx.kv.get(getSlotKey(vatID, kernelSlot));
    if (data) {
      const { vatSlot } = parseReachableAndVatSlot(data);
      const { direction } = parseRef(vatSlot);
      if (direction === 'import') {
        return true;
      }
    }
    return false;
  }

  /**
   * Gets all vats that import a specific kernel object.
   *
   * @param koid - The kernel object ID.
   * @returns An array of vat IDs that import the kernel object.
   */
  function getImporters(koid: KRef): VatId[] {
    const importers = [];
    importers.push(
      ...getVatIDs().filter((vatID) => importsKernelSlot(vatID, koid)),
    );
    importers.sort();
    return importers;
  }

  /**
   * Get the list of terminated vats.
   *
   * @returns an array of terminated vat IDs.
   */
  function getTerminatedVats(): VatId[] {
    return JSON.parse(ctx.terminatedVats.get() ?? '[]');
  }

  /**
   * Check if a vat is terminated.
   *
   * @param vatID - The ID of the vat to check.
   * @returns True if the vat is terminated, false otherwise.
   */
  function isVatTerminated(vatID: VatId): boolean {
    return getTerminatedVats().includes(vatID);
  }

  /**
   * Add a vat to the list of terminated vats.
   *
   * @param vatID - The ID of the vat to add.
   */
  function markVatAsTerminated(vatID: VatId): void {
    const terminatedVats = getTerminatedVats();
    if (!terminatedVats.includes(vatID)) {
      terminatedVats.push(vatID);
      ctx.terminatedVats.set(JSON.stringify(terminatedVats));
    }
  }

  /**
   * Remove a vat from the list of terminated vats.
   *
   * @param vatID - The ID of the vat to remove.
   */
  function forgetTerminatedVat(vatID: VatId): void {
    const terminatedVats = getTerminatedVats().filter((id) => id !== vatID);
    ctx.terminatedVats.set(JSON.stringify(terminatedVats));
  }

  /**
   * Cleanup a terminated vat.
   *
   * @param vatID - The ID of the vat to cleanup.
   * @returns The work done during the cleanup.
   */
  function cleanupTerminatedVat(vatID: VatId): VatCleanupWork {
    const work = {
      exports: 0,
      imports: 0,
      promises: 0,
      kv: 0,
    };

    if (!isVatTerminated(vatID)) {
      return work;
    }

    const clistPrefix = `${vatID}.c.`;
    const exportPrefix = `${clistPrefix}o+`;
    const importPrefix = `${clistPrefix}o-`;
    const promisePrefix = `${clistPrefix}p`;

    // First, clean up exports (objects exported by the terminated vat)
    for (const key of getPrefixedKeys(exportPrefix)) {
      const vref = key.slice(clistPrefix.length);
      const kref = ctx.kv.get(key);
      if (kref) {
        const vatKey = getSlotKey(vatID, vref);
        const kernelKey = getSlotKey(vatID, kref);
        // Clear the reachable flag
        clearReachableFlag(vatID, kref);
        // Delete the c-list entries
        ctx.kv.delete(kernelKey);
        ctx.kv.delete(vatKey);
        // Delete the owner entry
        ctx.kv.delete(`${kref}.owner`);
        // Add to maybeFreeKrefs for GC processing
        ctx.maybeFreeKrefs.add(kref);
        work.exports += 1;
      }
    }

    // Next, clean up imports (objects imported by the terminated vat)
    for (const key of getPrefixedKeys(importPrefix)) {
      const vref = key.slice(clistPrefix.length);
      const kref = ctx.kv.get(key);
      if (kref) {
        const vatKey = getSlotKey(vatID, vref);
        const kernelKey = getSlotKey(vatID, kref);
        // Clear the reachable flag
        clearReachableFlag(vatID, kref);
        // Decrement ref count for the import
        decrementRefCount(kref, {
          isExport: false,
          onlyRecognizable: true,
        });
        // Delete the c-list entries
        ctx.kv.delete(kernelKey);
        ctx.kv.delete(vatKey);
        work.imports += 1;
      }
    }

    // Clean up promises
    for (const key of getPrefixedKeys(promisePrefix)) {
      const vref = key.slice(clistPrefix.length);
      const kref = ctx.kv.get(key);
      if (kref) {
        const vatKey = getSlotKey(vatID, vref);
        const kernelKey = getSlotKey(vatID, kref);
        // Decrement refcount for the promise
        decrementRefCount(kref);
        // Delete the c-list entries
        ctx.kv.delete(kernelKey);
        ctx.kv.delete(vatKey);
        work.promises += 1;
      }
    }

    // Finally, clean up any remaining KV entries for this vat
    for (const key of getPrefixedKeys(`${vatID}.`)) {
      ctx.kv.delete(key);
      work.kv += 1;
    }

    // Clean up any remaining c-list entries and vat-specific counters
    deleteEndpoint(vatID);

    // Remove the vat from the terminated vats list
    forgetTerminatedVat(vatID);

    // Log the cleanup work done
    console.log(`Cleaned up terminated vat ${vatID}:`, work);

    return work;
  }

  /**
   * Get the next terminated vat to cleanup.
   *
   * @returns The work done during the cleanup.
   */
  function nextTerminatedVatCleanup(): VatCleanupWork | undefined {
    const vatID = getTerminatedVats()?.[0];
    return vatID ? cleanupTerminatedVat(vatID) : undefined;
  }

  return {
    deleteEndpoint,
    getAllVatRecords,
    getVatConfig,
    setVatConfig,
    deleteVatConfig,
    getVatIDs,
    importsKernelSlot,
    getImporters,
    getTerminatedVats,
    markVatAsTerminated,
    forgetTerminatedVat,
    isVatTerminated,
    cleanupTerminatedVat,
    nextTerminatedVatCleanup,
  };
}
