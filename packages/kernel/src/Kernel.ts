import '@ocap/shims/endoify';
import type { PromiseKit } from '@endo/promise-kit';
import { makePromiseKit } from '@endo/promise-kit';
import { VatAlreadyExistsError, VatNotFoundError, toError } from '@ocap/errors';
import type { DuplexStream } from '@ocap/streams';
import type { Logger } from '@ocap/utils';
import { makeLogger, stringify } from '@ocap/utils';

import type { KernelStore } from './kernel-store.js';
import {
  isKernelCommand,
  KernelCommandMethod,
  VatCommandMethod,
  type KernelCommand,
  type KernelCommandReply,
  type VatCommand,
} from './messages.js';
import type { VatId, VatWorkerService } from './types.js';
import { Vat } from './Vat.js';

export class Kernel {
  readonly #stream: DuplexStream<KernelCommand, KernelCommandReply>;

  readonly #vats: Map<VatId, Vat>;

  readonly #vatWorkerService: VatWorkerService;

  readonly #storage: KernelStore;

  // Hopefully removed when we get to n+1 vats.
  readonly #defaultVatKit: PromiseKit<Vat>;

  readonly #logger: Logger;

  constructor(
    stream: DuplexStream<KernelCommand, KernelCommandReply>,
    vatWorkerService: VatWorkerService,
    storage: KernelStore,
    logger?: Logger,
  ) {
    this.#stream = stream;
    this.#vats = new Map();
    this.#vatWorkerService = vatWorkerService;
    this.#storage = storage;
    this.#defaultVatKit = makePromiseKit<Vat>();
    this.#logger = logger ?? makeLogger('[ocap kernel]');
  }

  async init({ defaultVatId }: { defaultVatId: VatId }): Promise<void> {
    const start = performance.now();

    await this.launchVat({ id: defaultVatId })
      .then(this.#defaultVatKit.resolve)
      .catch(this.#defaultVatKit.reject);

    await this.#stream.write({
      method: KernelCommandMethod.InitKernel,
      params: { defaultVat: defaultVatId, initTime: performance.now() - start },
    });

    return this.#receiveMessages();
  }

  async #receiveMessages(): Promise<void> {
    for await (const message of this.#stream) {
      if (!isKernelCommand(message)) {
        this.#logger.debug('Received unexpected message', message);
        continue;
      }

      const { method, params } = message;

      let vat: Vat;

      switch (method) {
        case KernelCommandMethod.InitKernel:
          throw new Error('The kernel initializes itself.');
        case KernelCommandMethod.Ping:
          await this.#reply({ method, params: 'pong' });
          break;
        case KernelCommandMethod.Evaluate:
          vat = await this.#defaultVatKit.promise;
          await this.#reply({
            method,
            params: await this.evaluate(vat.id, params),
          });
          break;
        case KernelCommandMethod.CapTpCall:
          vat = await this.#defaultVatKit.promise;
          await this.#reply({
            method,
            params: stringify(await vat.callCapTp(params)),
          });
          break;
        case KernelCommandMethod.KVSet:
          this.kvSet(params.key, params.value);
          await this.#reply({
            method,
            params: `~~~ set "${params.key}" to "${params.value}" ~~~`,
          });
          break;
        case KernelCommandMethod.KVGet: {
          try {
            const result = this.kvGet(params);
            await this.#reply({
              method,
              params: result,
            });
          } catch (problem) {
            // TODO: marshal
            await this.#reply({
              method,
              params: String(toError(problem)),
            });
          }
          break;
        }
        default:
          console.error(
            'kernel worker received unexpected command',
            // @ts-expect-error Runtime does not respect "never".
            { method: method.valueOf(), params },
          );
      }
    }
  }

  async #reply(message: KernelCommandReply): Promise<void> {
    await this.#stream.write(message);
  }

  /**
   * Evaluate a string in the default iframe.
   *
   * @param vatId - The ID of the vat to send the message to.
   * @param source - The source string to evaluate.
   * @returns The result of the evaluation, or an error message.
   */
  async evaluate(vatId: VatId, source: string): Promise<string> {
    try {
      const result = await this.sendMessage(vatId, {
        method: VatCommandMethod.Evaluate,
        params: source,
      });
      return String(result);
    } catch (error) {
      if (error instanceof Error) {
        return `Error: ${error.message}`;
      }
      return `Error: Unknown error during evaluation.`;
    }
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
      throw new VatAlreadyExistsError(id);
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
      throw new VatNotFoundError(id);
    }
    return vat;
  }
}
harden(Kernel);
