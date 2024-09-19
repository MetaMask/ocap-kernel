import '@ocap/shims/endoify';
import type { VatId, VatMessage } from './types.ts';
import type { VatIframe } from './VatIframe.ts';

export class VatManager {
  readonly #vats: Map<VatId, VatIframe>;

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
  public addVat(vat: VatIframe): void {
    if (this.#vats.has(vat.id)) {
      throw new Error(`Vat with ID ${vat.id} already exists.`);
    }
    this.#vats.set(vat.id, vat);

    /* v8 ignore next 4: Not known to be possible. */
    this.#receiveMessages(vat.id, vat.streams.reader).catch((error) => {
      console.error(`Unexpected read error from vat "${vat.id}"`, error);
      this.deleteVat(vat.id);
    });
  }

  /**
   * Deletes a vat from the kernel.
   *
   * @param id - The ID of the vat.
   */
  public deleteVat(id: string): void {
    const vat = this.#vats.get(id);
    vat?.terminate();
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
   * Receives messages from a vat.
   *
   * @param vatId - The ID of the vat.
   * @param reader - The reader for the messages.
   */
  async #receiveMessages(
    vatId: VatId,
    reader: Reader<StreamEnvelope>,
  ): Promise<void> {
    const vat = this.#getVat(vatId);

    for await (const rawMessage of reader) {
      console.debug('Offscreen received message', rawMessage);
      await vat.streamEnvelopeHandler.handle(rawMessage);
    }
  }

  /**
   * Gets a vat from the kernel.
   *
   * @param id - The ID of the vat.
   * @returns The vat record.
   */
  #getVat(id: string): VatIframe {
    const vat = this.#vats.get(id);
    if (vat === undefined) {
      throw new Error(`Vat with ID ${id} does not exist.`);
    }
    return vat;
  }
}
