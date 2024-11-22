import type { VatId, VatConfig } from './types.js';

export type VatState = {
  config: VatConfig;
};

export class VatStateService {
  readonly #states: Map<VatId, VatState>;

  constructor() {
    this.#states = new Map();
  }

  saveVatState(vatId: VatId, state: VatState): void {
    this.#states.set(vatId, state);
  }

  getVatState(vatId: VatId): VatState | undefined {
    return this.#states.get(vatId);
  }

  deleteVatState(vatId: VatId): void {
    this.#states.delete(vatId);
  }
}
