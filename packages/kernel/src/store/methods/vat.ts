import { getBaseMethods } from './base.ts';
import type { EndpointId, KRef, VatConfig, VatId } from '../../types.ts';
import type { StoreContext } from '../types.ts';
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

  return {
    deleteEndpoint,
    getAllVatRecords,
    getVatConfig,
    setVatConfig,
    deleteVatConfig,
    getVatIDs,
    importsKernelSlot,
    getImporters,
  };
}
