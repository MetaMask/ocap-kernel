import type { CommandMessage } from './command.js';
import type { DataObject } from './data-object.js';
import type { MessageId, VatId } from './shared.js';
import { makeIframeVatRealm } from './vat-realm.js';
import { Vat } from './vat.js';

type GetPort = (targetWindow: Window) => Promise<MessagePort>;

export class IframeManager {
  readonly #vats: Map<VatId, Vat>;

  #currentId: number;

  constructor() {
    this.#vats = new Map();
    this.#currentId = 0;
  }

  /**
   * Create a new vat, in the form of an iframe.
   *
   * @param args - Options bag.
   * @param args.id - The id of the vat to create.
   * @param args.getPort - A function to get the message port for the iframe.
   * @returns The iframe's content window, and the id of the associated vat.
   */
  async create(
    args: { id?: VatId; getPort?: GetPort } = {},
  ): Promise<readonly [Window, VatId]> {
    const id = args.id ?? this.#nextVatId();
    const vat = new Vat(id, makeIframeVatRealm(id)); // , args.getPort ?? initializeMessageChannel));

    this.#vats.set(id, vat);

    const newWindow = await vat.launch();

    console.debug('launched');

    return [newWindow as Window, vat.id] as const;
  }

  /**
   * Delete a vat and its associated iframe.
   *
   * @param id - The id of the vat to delete.
   * @returns A promise that resolves when the iframe is deleted.
   */
  async delete(id: VatId): Promise<void> {
    const vat = this.#vats.get(id);
    if (vat === undefined) {
      return undefined;
    }

    await vat.terminate();
    return undefined;
  }

  /**
   * Send a message to a vat.
   *
   * @param id - The id of the vat to send the message to.
   * @param message - The message to send.
   * @returns A promise that resolves the response to the message.
   */
  async sendMessage(id: VatId, message: CommandMessage): Promise<unknown> {
    return this.#expectGetVat(id).sendCommand(message);
  }

  async callCapTp(
    id: VatId,
    method: string,
    ...params: DataObject[]
  ): Promise<unknown> {
    return this.#expectGetVat(id).callCapTp(method, ...params);
  }

  async makeCapTp(id: string): Promise<void> {
    await this.#expectGetVat(id).makeCapTp();
  }

  /**
   * Get a vat record by id, or throw an error if it doesn't exist.
   *
   * @param id - The id of the vat to get.
   * @returns The vat record.
   */
  #expectGetVat(id: VatId): Vat {
    const vat = this.#vats.get(id);
    if (vat === undefined) {
      throw new Error(`No vat with id "${id}"`);
    }
    return vat;
  }

  readonly #nextVatId = (): MessageId => {
    this.#currentId += 1;
    return `${this.#currentId}`;
  };
}
