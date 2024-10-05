import '@ocap/shims/endoify';
import type { Command } from './command.js';
import type { VatId, VatWorker } from './types.js';
import { Vat } from './Vat.js';

export class Kernel {
  readonly #vats: Map<VatId, { vat: Vat; worker: VatWorker }>;

  constructor() {
    this.#vats = new Map();
  }

  /**
   * Gets the vat IDs in the kernel.
   *
   * @returns An array of vat IDs.
   */
  getVatIds(): VatId[] {
    return Array.from(this.#vats.keys());
  }

  /**
   * Launches a vat in the kernel.
   *
   * @param options - The options for launching the vat.
   * @param options.id - The ID of the vat.
   * @param options.worker - The worker to use for the vat.
   * @returns A promise that resolves the vat.
   */
  async launchVat({
    id,
    worker,
  }: {
    id: VatId;
    worker: VatWorker;
  }): Promise<Vat> {
    if (this.#vats.has(id)) {
      throw new Error(`Vat with ID ${id} already exists.`);
    }
    const [streams] = await worker.init();
    const vat = new Vat({ id, stream: streams });
    this.#vats.set(vat.id, { vat, worker });
    await vat.init();
    return vat;
  }

  /**
   * Deletes a vat from the kernel.
   *
   * @param id - The ID of the vat.
   */
  async deleteVat(id: VatId): Promise<void> {
    const vatRecord = this.#getVatRecord(id);
    const { vat, worker } = vatRecord;
    await vat.terminate();
    await worker.delete();
    this.#vats.delete(id);
  }

  /**
   * Send a message to a vat.
   *
   * @param id - The id of the vat to send the message to.
   * @param command - The command to send.
   * @returns A promise that resolves the response to the message.
   */
  async sendMessage(id: VatId, command: Command): Promise<unknown> {
    const { vat } = this.#getVatRecord(id);
    return vat.sendMessage(command);
  }

  /**
   * Gets a vat record from the kernel.
   *
   * @param id - The ID of the vat.
   * @returns The vat record (vat and worker).
   */
  #getVatRecord(id: VatId): { vat: Vat; worker: VatWorker } {
    const vatRecord = this.#vats.get(id);
    if (vatRecord === undefined) {
      throw new Error(`Vat with ID ${id} does not exist.`);
    }
    return vatRecord;
  }
}
