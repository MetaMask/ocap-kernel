import type { VatId, VatConfig } from '../types.js';

export type VatState = {
  config: VatConfig;
};

export class VatStateService {
  readonly #states: Map<VatId, VatState>;

  constructor() {
    this.#states = new Map();
  }

  /**
   * Set the state for a vat.
   *
   * @param vatId - The ID of the vat.
   * @param state - The state to set.
   * @throws {Error} If state is invalid.
   */
  set(vatId: VatId, state: VatState): void {
    this.#states.set(vatId, state);
  }

  /**
   * Get the state of a vat.
   *
   * @param vatId - The ID of the vat.
   * @returns The vat state, or undefined if not found.
   */
  get(vatId: VatId): VatState | undefined {
    return this.#states.get(vatId);
  }

  /**
   * Delete the state of a vat.
   *
   * @param vatId - The ID of the vat.
   * @returns true if state was deleted, false if it didn't exist.
   */
  delete(vatId: VatId): boolean {
    return this.#states.delete(vatId);
  }

  /**
   * Check if a vat has state stored.
   *
   * @param vatId - The ID of the vat.
   * @returns true if state exists for the vat.
   */
  has(vatId: VatId): boolean {
    return this.#states.has(vatId);
  }

  /**
   * Get all vat IDs with stored state.
   *
   * @returns Array of vat IDs.
   */
  get vatIds(): VatId[] {
    return Array.from(this.#states.keys());
  }

  /**
   * Get number of vats with stored state.
   *
   * @returns Number of vats.
   */
  get size(): number {
    return this.#states.size;
  }
}
