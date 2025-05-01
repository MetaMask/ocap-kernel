import { Fail } from '@endo/errors';

import { getBaseMethods } from './base.ts';
import { getCListMethods } from './clist.ts';
import { getObjectMethods } from './object.ts';
import { getPromiseMethods } from './promise.ts';
import { getReachableMethods } from './reachable.ts';
import { getRefCountMethods } from './refcount.ts';
import { insistVatId } from '../../types.ts';
import type { EndpointId, KRef, VatConfig, VatId, VRef } from '../../types.ts';
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
  const { getPrefixedKeys, getSlotKey, getOwnerKey } = getBaseMethods(ctx.kv);
  const { deleteCListEntry } = getCListMethods(ctx);
  const { getReachableAndVatSlot } = getReachableMethods(ctx);
  const { initKernelPromise, setPromiseDecider, getKernelPromise } =
    getPromiseMethods(ctx);
  const { initKernelObject } = getObjectMethods(ctx);
  const { addCListEntry } = getCListMethods(ctx);
  const { incrementRefCount, decrementRefCount } = getRefCountMethods(ctx);

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

    // Note: ASCII order is "+,-./", and we rely upon this to split the
    // keyspace into the various o+NN/o-NN/etc spaces. If we were using a
    // more sophisticated database, we'd keep each section in a separate
    // table.

    // The current store semantics ensure this iteration is lexicographic.
    // Any changes to the creation of the list of promises to be rejected (and
    // thus to the order in which they *get* rejected) need to preserve this
    // ordering in order to preserve determinism.

    // first, scan for exported objects, which must be orphaned
    for (const key of getPrefixedKeys(exportPrefix)) {
      // The void for an object exported by a vat will always be of the form
      // `o+NN`.  The '+' means that the vat exported the object (rather than
      // importing it) and therefore the object is owned by (i.e., within) the
      // vat.  The corresponding void->koid c-list entry will thus always
      // begin with `vMM.c.o+`.  In addition to deleting the c-list entry, we
      // must also delete the corresponding kernel owner entry for the object,
      // since the object will no longer be accessible.
      assert(key.startsWith(clistPrefix), key);
      const vref = key.slice(clistPrefix.length);
      assert(vref.startsWith('o+'), vref);
      const kref = ctx.kv.get(key);
      assert(kref, key);
      // deletes c-list and .owner, adds to maybeFreeKrefs
      const ownerKey = getOwnerKey(kref);
      const ownerVat = ctx.kv.get(ownerKey);
      ownerVat === vatID || Fail`export ${kref} not owned by old vat`;
      ctx.kv.delete(ownerKey);
      const { vatSlot } = getReachableAndVatSlot(vatID, kref);
      ctx.kv.delete(getSlotKey(vatID, kref));
      ctx.kv.delete(getSlotKey(vatID, vatSlot));
      // Decrease refcounts that belonged to the terminating vat
      decrementRefCount(kref, 'cleanup|export|baseline');
      ctx.maybeFreeKrefs.add(kref);
      work.exports += 1;
    }

    // then scan for imported objects, which must be decrefed
    for (const key of getPrefixedKeys(importPrefix)) {
      // abandoned imports: delete the clist entry as if the vat did a
      // drop+retire
      const kref = ctx.kv.get(key) ?? Fail`getNextKey ensures get`;
      assert(key.startsWith(clistPrefix), key);
      const vref = key.slice(clistPrefix.length);
      deleteCListEntry(vatID, kref, vref);
      // that will also delete both db keys
      work.imports += 1;
    }

    // The caller used enumeratePromisesByDecider() before calling us,
    // so they have already rejected the orphan promises, but those
    // kpids are still present in the dead vat's c-list. Clean those up now.
    for (const key of getPrefixedKeys(promisePrefix)) {
      const kref = ctx.kv.get(key) ?? Fail`getNextKey ensures get`;
      assert(key.startsWith(clistPrefix), key);
      const vref = key.slice(clistPrefix.length);
      // the following will also delete both db keys
      deleteCListEntry(vatID, kref, vref);
      // If the dead vat was still the decider, drop the decider’s refcount, too.
      const kp = getKernelPromise(kref);
      if (kp.decider === vatID) {
        decrementRefCount(kref, 'cleanup|promise|decider');
      }
      work.promises += 1;
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
    console.debug(`Cleaned up terminated vat ${vatID}:`, work);

    return work;
  }

  /**
   * Get the next terminated vat to cleanup.
   *
   * @returns The work done during the cleanup.
   */
  function nextTerminatedVatCleanup(): boolean {
    const vatID = getTerminatedVats()?.[0];
    vatID && cleanupTerminatedVat(vatID);
    return getTerminatedVats().length > 0;
  }

  /**
   * Create the kernel's representation of an export from a vat.
   *
   * @param vatId - The vat doing the exporting.
   * @param vref - The vat's ref for the entity in question.
   *
   * @returns the kref corresponding to the export of `vref` from `vatId`.
   */
  function exportFromVat(vatId: VatId, vref: VRef): KRef {
    insistVatId(vatId);
    const { isPromise, context, direction } = parseRef(vref);
    assert(context === 'vat', `${vref} is not a VRef`);
    assert(direction === 'export', `${vref} is not an export reference`);
    let kref;
    if (isPromise) {
      kref = initKernelPromise()[0];
      setPromiseDecider(kref, vatId);
    } else {
      kref = initKernelObject(vatId);
    }
    addCListEntry(vatId, kref, vref);
    incrementRefCount(kref, 'export', {
      isExport: true,
      onlyRecognizable: true,
    });
    return kref;
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
    exportFromVat,
  };
}
