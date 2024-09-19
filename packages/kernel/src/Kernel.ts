import '@ocap/shims/endoify';
import type { VatMessage } from '@ocap/streams';

import type { VatId } from './types.js';
import type { Vat } from './Vat.js';

export class Kernel {
  readonly #vats: Map<VatId, Vat>;

  constructor() {
    this.#vats = new Map();
  }

  /**
   * Gets the vat IDs in the kernel.
   *
   * @returns An array of vat IDs.
   */
  public getVatIDs(): VatId[] {
    return Array.from(this.#vats.keys());
  }

  /**
   * Adds a vat to the kernel.
   *
   * @param vat - The vat record.
   */
  public addVat(vat: Vat): void {
    if (this.#vats.has(vat.id)) {
      throw new Error(`Vat with ID ${vat.id} already exists.`);
    }
    this.#vats.set(vat.id, vat);
  }

  /**
   * Deletes a vat from the kernel.
   *
   * @param id - The ID of the vat.
   */
  public async deleteVat(id: string): Promise<void> {
    const vat = this.#vats.get(id);
    await vat?.terminate();
    this.#vats.delete(id);
  }

  /**
   * Send a message to a vat.
   *
   * @param id - The id of the vat to send the message to.
   * @param message - The message to send.
   * @returns A promise that resolves the response to the message.
   */
  public async sendMessage(id: VatId, message: VatMessage): Promise<unknown> {
    const vat = this.#getVat(id);
    return vat.sendMessage(message);
  }

  /**
   * Gets a vat from the kernel.
   *
   * @param id - The ID of the vat.
   * @returns The vat record.
   */
  #getVat(id: string): Vat {
    const vat = this.#vats.get(id);
    if (vat === undefined) {
      throw new Error(`Vat with ID ${id} does not exist.`);
    }
    return vat;
  }
}
