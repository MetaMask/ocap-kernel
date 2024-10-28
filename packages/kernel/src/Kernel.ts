import '@ocap/shims/endoify';
import {
  StreamReadError,
  VatAlreadyExistsError,
  VatNotFoundError,
  toError,
} from '@ocap/errors';
import type { DuplexStream } from '@ocap/streams';
import type { Logger } from '@ocap/utils';
import { makeLogger, stringify } from '@ocap/utils';

import type { KVStore } from './kernel-store.js';
import {
  isKernelCommand,
  KernelCommandMethod,
  VatCommandMethod,
} from './messages/index.js';
import type {
  KernelCommand,
  KernelCommandReply,
  VatCommand,
} from './messages/index.js';
import type { VatId, VatWorkerService } from './types.js';
import { Vat } from './Vat.js';

export class Kernel {
  readonly #stream: DuplexStream<KernelCommand, KernelCommandReply>;

  readonly #vats: Map<VatId, Vat>;

  readonly #vatWorkerService: VatWorkerService;

  readonly #storage: KVStore;

  readonly #logger: Logger;

  constructor(
    stream: DuplexStream<KernelCommand, KernelCommandReply>,
    vatWorkerService: VatWorkerService,
    storage: KVStore,
    logger?: Logger,
  ) {
    this.#stream = stream;
    this.#vats = new Map();
    this.#vatWorkerService = vatWorkerService;
    this.#storage = storage;
    this.#logger = logger ?? makeLogger('[ocap kernel]');

    this.#receiveMessages().catch((error) => {
      this.#logger.error('Stream read error occurred:', error);
      // Errors thrown here will not be surfaced in the usual synchronous manner
      // because #receiveMessages() is awaited within the constructor.
      // Any error thrown inside the async loop is 'caught' within this constructor
      // call stack but will be displayed as 'Uncaught (in promise)'
      // since they occur after the constructor has returned.
      throw new StreamReadError({ kernelId: 'kernel' }, error);
    });
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
        case KernelCommandMethod.Ping:
          await this.#reply({ method, params: 'pong' });
          break;
        case KernelCommandMethod.Evaluate:
          if (!this.#vats.size) {
            throw new Error('No vats available to call');
          }
          vat = this.#vats.values().next().value as Vat;
          await this.#reply({
            method,
            params: await this.evaluate(vat.id, params),
          });
          break;
        case KernelCommandMethod.CapTpCall:
          if (!this.#vats.size) {
            throw new Error('No vats available to call');
          }
          vat = this.#vats.values().next().value as Vat;
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
            const value = this.kvGet(params);
            const result =
              typeof value === 'string' ? `"${value}"` : `${value}`;
            await this.#reply({
              method,
              params: `~~~ got ${result} ~~~`,
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

  kvGet(key: string): string | undefined {
    return this.#storage.get(key);
  }

  kvSet(key: string, value: string): void {
    this.#storage.set(key, value);
  }

  /**
   * Gets the vat IDs.
   *
   * @returns An array of vat IDs.
   */
  getVatIds(): VatId[] {
    return Array.from(this.#vats.keys());
  }

  /**
   * Launches a vat.
   *
   * @param options - The options for launching the vat.
   * @param options.id - The ID of the vat.
   * @returns A promise that resolves the vat.
   */
  async launchVat({ id }: { id: VatId }): Promise<Vat> {
    if (this.#vats.has(id)) {
      throw new VatAlreadyExistsError(id);
    }
    const stream = await this.#vatWorkerService.launch(id);
    const vat = new Vat({ id, stream });
    this.#vats.set(vat.id, vat);
    await vat.init();
    return vat;
  }

  /**
   * Restarts a vat.
   *
   * @param id - The ID of the vat.
   */
  async restartVat(id: VatId): Promise<void> {
    await this.terminateVat(id);
    await this.launchVat({ id });
  }

  /**
   * Terminate a vat.
   *
   * @param id - The ID of the vat.
   */
  async terminateVat(id: VatId): Promise<void> {
    const vat = this.#getVat(id);
    await vat.terminate();
    await this.#vatWorkerService.terminate(id).catch(console.error);
    this.#vats.delete(id);
  }

  /**
   * Terminate all vats.
   */
  async terminateAllVats(): Promise<void> {
    await Promise.all(
      this.getVatIds().map(async (id) => {
        const vat = this.#getVat(id);
        await vat.terminate();
        this.#vats.delete(id);
      }),
    );
    await this.#vatWorkerService.terminateAll();
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
   * Gets a vat.
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
