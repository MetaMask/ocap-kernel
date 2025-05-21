import type { VatId } from '../../types.ts';
import type { StoreContext } from '../types.ts';

/**
 * Get methods for tracking vats that have been compromised by syscall failures.
 *
 * @param ctx - The store context.
 * @returns An object with methods for tracking compromised vats.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getCompromisedMethods(ctx: StoreContext) {
  /**
   * Get the list of compromised vats.
   *
   * @returns An array of compromised vat IDs.
   */
  function getCompromisedVats(): VatId[] {
    return JSON.parse(ctx.compromisedVats.get() ?? '[]');
  }

  /**
   * Check if a vat is compromised.
   *
   * @param vatId - The ID of the vat to check.
   * @returns True if the vat is compromised, false otherwise.
   */
  function isVatCompromised(vatId: VatId): boolean {
    return getCompromisedVats().includes(vatId);
  }

  /**
   * Mark a vat as compromised.
   *
   * @param vatId - The ID of the vat to mark as compromised.
   */
  function markVatAsCompromised(vatId: VatId): void {
    const compromisedVats = getCompromisedVats();
    if (!compromisedVats.includes(vatId)) {
      compromisedVats.push(vatId);
      ctx.compromisedVats.set(JSON.stringify(compromisedVats));
    }
  }

  /**
   * Clear the compromised status for a vat. This is typically used
   * when a vat is fully terminated and its state is cleaned up.
   *
   * @param vatId - The ID of the vat to clear.
   */
  function clearVatCompromisedStatus(vatId: VatId): void {
    const compromisedVats = getCompromisedVats().filter((id) => id !== vatId);
    ctx.compromisedVats.set(JSON.stringify(compromisedVats));
  }

  return {
    getCompromisedVats,
    isVatCompromised,
    markVatAsCompromised,
    clearVatCompromisedStatus,
  };
}
