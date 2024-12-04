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
import { makeLogger } from '@ocap/utils';

import type { KVStore, KernelStore } from './kernel-store.js';
import { makeKernelStore } from './kernel-store.js';
import {
  isKernelCommand,
  isVatCommandReply,
  KernelCommandMethod,
} from './messages/index.js';
import type {
  CapTpPayload,
  KernelCommand,
  KernelCommandReply,
  VatCommand,
  VatCommandReply,
} from './messages/index.js';
import type { VatCommandReturnType } from './messages/vat.js';
import type {
  VatId,
  VatWorkerService,
  ClusterConfig,
  VatConfig,
} from './types.js';
import { VatStateService } from './vat-state-service.js';
import { Vat } from './Vat.js';

export class Kernel {
  readonly #stream: DuplexStream<KernelCommand, KernelCommandReply>;

  readonly #vats: Map<VatId, Vat>;

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
   * Launches a vat.
   *
   * @param vatConfig - Configuration for the new vat.
   * @returns A promise that resolves the vat.
   */
  async launchVat(vatConfig: VatConfig): Promise<Vat> {
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
  async launchSubcluster(config: ClusterConfig): Promise<Record<string, Vat>> {
    const vats: Record<string, Vat> = {};
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
  async restartVat(vatId: VatId): Promise<Vat> {
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
   * Call a CapTP method.
   *
   * @param id - The ID of the vat to call the method on.
   * @param params - The parameters to call the method with.
   * @returns The result of the method call.
   */
  async callCapTp(id: VatId, params: CapTpPayload): Promise<unknown> {
    const vat = this.#getVat(id);
    return vat.callCapTp(params);
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

      switch (method) {
        case KernelCommandMethod.ping:
          await this.#reply({ method, params: 'pong' });
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
  async #initVat(vatId: VatId, vatConfig: VatConfig): Promise<Vat> {
    const multiplexer = await this.#vatWorkerService.launch(vatId, vatConfig);
    multiplexer.start().catch((error) => this.#logger.error(error));
    const commandStream = multiplexer.createChannel<
      VatCommandReply,
      VatCommand
    >('command', isVatCommandReply);
    const capTpStream = multiplexer.createChannel<Json, Json>('capTp');
    const vat = new Vat({
      vatId,
      vatConfig,
      commandStream,
      capTpStream,
      store: this.#storage.kv,
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
  #getVat(vatId: VatId): Vat {
    const vat = this.#vats.get(vatId);
    if (vat === undefined) {
      throw new VatNotFoundError(vatId);
    }
    return vat;
  }
}
harden(Kernel);
