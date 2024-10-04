import '@ocap/shims/endoify';
import type { KernelStore } from './kernel-store.js';
import type { VatCommand } from './messages.js';
import type { VatId, VatWorkerService } from './types.js';
import { Vat } from './Vat.js';

export class Kernel {
  readonly #vats: Map<VatId, Vat>;

  readonly #vatWorkerService: VatWorkerService;

  readonly #storage: KernelStore;

  constructor(vatWorkerService: VatWorkerService, storage: KernelStore) {
    this.#vats = new Map();
    this.#vatWorkerService = vatWorkerService;
    this.#storage = storage;
  }

  kvGet(key: string): string {
    return this.#storage.kvGet(key);
  }

  kvSet(key: string, value: string): void {
    this.#storage.kvSet(key, value);
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
   * @returns A promise that resolves the vat.
   */
  async launchVat({ id }: { id: VatId }): Promise<Vat> {
    if (this.#vats.has(id)) {
      throw new Error(`Vat with ID ${id} already exists.`);
    }
    const stream = await this.#vatWorkerService.initWorker(id);
    const vat = new Vat({ id, stream });
    this.#vats.set(vat.id, vat);
    await vat.init();
    return vat;
  }

  /**
   * Deletes a vat from the kernel.
   *
   * @param id - The ID of the vat.
   */
  async deleteVat(id: VatId): Promise<void> {
    const vat = this.#getVat(id);
    await vat.terminate();
    await this.#vatWorkerService.deleteWorker(id).catch(console.error);
    this.#vats.delete(id);
  }

  /**
   * Send a message to a vat.
   *
   * @param id - The id of the vat to send the message to.
   * @param command - The command to send.
   * @returns A promise that resolves the response to the message.
   */
  async sendMessage(
    id: VatId,
    command: VatCommand['payload'],
  ): Promise<unknown> {
    const vat = this.#getVat(id);
    return vat.sendMessage(command);
  }

  /**
   * Gets a vat from the kernel.
   *
   * @param id - The ID of the vat.
   * @returns The vat.
   */
  #getVat(id: VatId): Vat {
    const vat = this.#vats.get(id);
    if (vat === undefined) {
      throw new Error(`Vat with ID ${id} does not exist.`);
    }
    return vat;
  }
}
harden(Kernel);
