import '@ocap/shims/endoify';
import type { Json } from '@metamask/utils';
import {
  StreamReadError,
  VatAlreadyExistsError,
  VatNotFoundError,
  toError,
} from '@ocap/errors';
import type { DuplexStream } from '@ocap/streams';
import type { Logger } from '@ocap/utils';
import { makeLogger, stringify } from '@ocap/utils';

import {
  isKernelCommand,
  isVatCommandReply,
  KernelCommandMethod,
  VatCommandMethod,
} from './messages/index.js';
import type {
  KernelCommand,
  KernelCommandReply,
  VatCommand,
  VatCommandReply,
} from './messages/index.js';
import type { VatCommandReturnType } from './messages/vat.js';
import { makeKernelStore } from './store/kernel-store.js';
import type { KVStore, KernelStore } from './store/kernel-store.js';
import { VatStateService } from './store/vat-state-service.js';
import type {
  VatId,
  VatWorkerService,
  ClusterConfig,
  VatConfig,
} from './types.js';
import { VatHandle } from './VatHandle.js';

export class Kernel {
  readonly #stream: DuplexStream<KernelCommand, KernelCommandReply>;

  readonly #vats: Map<VatId, VatHandle>;

  readonly #vatWorkerService: VatWorkerService;

  readonly #storage: KernelStore;

  readonly #logger: Logger;

  readonly #vatStateService: VatStateService;

  constructor(
    stream: DuplexStream<KernelCommand, KernelCommandReply>,
    vatWorkerService: VatWorkerService,
    rawStorage: KVStore,
    logger?: Logger,
  ) {
    this.#stream = stream;
    this.#vats = new Map();
    this.#vatWorkerService = vatWorkerService;
    this.#storage = makeKernelStore(rawStorage);
    this.#logger = logger ?? makeLogger('[ocap kernel]');
    this.#vatStateService = new VatStateService();
  }

  async init(): Promise<void> {
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
        method: VatCommandMethod.evaluate,
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
    return this.#storage.kv.get(key);
  }

  kvSet(key: string, value: string): void {
    this.#storage.kv.set(key, value);
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
   * Gets the list of all vats.
   *
   * @returns An array of vats.
   */
  getVats(): {
    id: VatId;
    config: VatConfig;
  }[] {
    return Array.from(this.#vats.values()).reduce(
      (
        acc: {
          id: VatId;
          config: VatConfig;
        }[],
        vat,
      ) => {
        const state = this.#vatStateService.get(vat.vatId);
        if (state?.config) {
          acc.push({ id: vat.vatId, config: state.config });
        }
        return acc;
      },
      [],
    );
  }

  /**
   * Launches a vat.
   *
   * @param vatConfig - Configuration for the new vat.
   * @returns A promise that resolves the vat.
   */
  async launchVat(vatConfig: VatConfig): Promise<VatHandle> {
    const vatId = this.#storage.getNextVatId();
    if (this.#vats.has(vatId)) {
      throw new VatAlreadyExistsError(vatId);
    }
    return this.#initVat(vatId, vatConfig);
  }

  /**
   * Launches a sub-cluster of vats.
   *
   * @param config - Configuration object for sub-cluster.
   * @returns A record of the vats launched.
   */
  async launchSubcluster(
    config: ClusterConfig,
  ): Promise<Record<string, VatHandle>> {
    const vats: Record<string, VatHandle> = {};
    for (const [vatName, vatConfig] of Object.entries(config.vats)) {
      const vat = await this.launchVat(vatConfig);
      vats[vatName] = vat;
    }
    return vats;
  }

  /**
   * Restarts a vat.
   *
   * @param vatId - The ID of the vat.
   * @returns A promise that resolves the restarted vat.
   */
  async restartVat(vatId: VatId): Promise<VatHandle> {
    const state = this.#vatStateService.get(vatId);
    if (!state) {
      throw new VatNotFoundError(vatId);
    }

    await this.terminateVat(vatId);
    const vat = await this.#initVat(vatId, state.config);
    return vat;
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
  async sendMessage<Method extends VatCommand['payload']['method']>(
    id: VatId,
    command: Extract<VatCommand['payload'], { method: Method }>,
  ): Promise<VatCommandReturnType[Method]> {
    const vat = this.#getVat(id);
    return vat.sendMessage(command);
  }

  /**
   * Resets the kernel state.
   */
  async reset(): Promise<void> {
    await this.terminateAllVats();
    this.#storage.reset();
  }

  // --------------------------------------------------------------------------
  // Private methods
  // --------------------------------------------------------------------------

  /**
   * Receives messages from the stream.
   */
  async #receiveMessages(): Promise<void> {
    for await (const message of this.#stream) {
      if (!isKernelCommand(message)) {
        this.#logger.error('Received unexpected message', message);
        continue;
      }

      const { method, params } = message;

      let vat: VatHandle;

      switch (method) {
        case KernelCommandMethod.ping:
          await this.#reply({ method, params: 'pong' });
          break;
        case KernelCommandMethod.evaluate:
          if (!this.#vats.size) {
            throw new Error('No vats available to call');
          }
          vat = this.#vats.values().next().value as VatHandle;
          await this.#reply({
            method,
            params: await this.evaluate(vat.vatId, params),
          });
          break;
        case KernelCommandMethod.capTpCall:
          if (!this.#vats.size) {
            throw new Error('No vats available to call');
          }
          vat = this.#vats.values().next().value as VatHandle;
          await this.#reply({
            method,
            params: stringify(await vat.callCapTp(params)),
          });
          break;
        case KernelCommandMethod.kvSet:
          this.kvSet(params.key, params.value);
          await this.#reply({
            method,
            params: `~~~ set "${params.key}" to "${params.value}" ~~~`,
          });
          break;
        case KernelCommandMethod.kvGet: {
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

  /**
   * Replies to a message.
   *
   * @param message - The message to reply to.
   */
  async #reply(message: KernelCommandReply): Promise<void> {
    await this.#stream.write(message);
  }

  /**
   * Initializes a vat.
   *
   * @param vatId - The ID of the vat.
   * @param vatConfig - The configuration of the vat.
   * @returns A promise that resolves the vat.
   */
  async #initVat(vatId: VatId, vatConfig: VatConfig): Promise<VatHandle> {
    const multiplexer = await this.#vatWorkerService.launch(vatId, vatConfig);
    multiplexer.start().catch((error) => this.#logger.error(error));
    const commandStream = multiplexer.createChannel<
      VatCommandReply,
      VatCommand
    >('command', isVatCommandReply);
    const capTpStream = multiplexer.createChannel<Json, Json>('capTp');
    const vat = new VatHandle({
      vatId,
      vatConfig,
      commandStream,
      capTpStream,
    });
    this.#vats.set(vat.vatId, vat);
    this.#vatStateService.set(vatId, {
      config: vatConfig,
    });
    await vat.init();
    return vat;
  }

  /**
   * Gets a vat.
   *
   * @param vatId - The ID of the vat.
   * @returns The vat.
   */
  #getVat(vatId: VatId): VatHandle {
    const vat = this.#vats.get(vatId);
    if (vat === undefined) {
      throw new VatNotFoundError(vatId);
    }
    return vat;
  }
}
harden(Kernel);
