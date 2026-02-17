import type { Logger } from '@metamask/logger';

import { makeIOService } from './io-service.ts';
import type { IOChannel, IOChannelFactory } from './types.ts';
import type { KernelService } from '../KernelServiceManager.ts';
import type { IOConfig } from '../types.ts';

type RegisterService = (
  name: string,
  service: object,
  options?: { systemOnly?: boolean },
) => KernelService;
type UnregisterService = (name: string) => void;

type IOManagerOptions = {
  factory: IOChannelFactory;
  registerService: RegisterService;
  unregisterService: UnregisterService;
  logger?: Logger;
};

type SubclusterIOState = {
  channels: Map<string, IOChannel>;
  serviceNames: string[];
};

/**
 * Manages IO channel lifecycle, creating channels at subcluster launch
 * and destroying them at termination.
 */
export class IOManager {
  readonly #factory: IOChannelFactory;

  readonly #registerService: RegisterService;

  readonly #unregisterService: UnregisterService;

  readonly #logger: Logger | undefined;

  /** IO state indexed by subcluster ID */
  readonly #subclusters: Map<string, SubclusterIOState> = new Map();

  /**
   * Creates a new IOManager instance.
   *
   * @param options - Constructor options.
   * @param options.factory - Factory for creating IO channels.
   * @param options.registerService - Function to register a kernel service.
   * @param options.unregisterService - Function to unregister a kernel service.
   * @param options.logger - Optional logger for diagnostics.
   */
  constructor({
    factory,
    registerService,
    unregisterService,
    logger,
  }: IOManagerOptions) {
    this.#factory = factory;
    this.#registerService = registerService;
    this.#unregisterService = unregisterService;
    this.#logger = logger;
    harden(this);
  }

  /**
   * Create IO channels for a subcluster and register them as kernel services.
   *
   * @param subclusterId - The ID of the subcluster.
   * @param ioConfig - The IO configuration map from channel names to configs.
   */
  async createChannels(
    subclusterId: string,
    ioConfig: Record<string, IOConfig>,
  ): Promise<void> {
    const channels = new Map<string, IOChannel>();
    const serviceNames: string[] = [];

    for (const [name, config] of Object.entries(ioConfig)) {
      try {
        const channel = await this.#factory(name, config);
        channels.set(name, channel);

        const service = makeIOService(name, subclusterId, channel, config);
        this.#registerService(name, service);
        serviceNames.push(name);

        this.#logger?.info(
          `Created IO channel "${name}" for subcluster ${subclusterId}`,
        );
      } catch (error) {
        // Clean up any channels we already created before re-throwing
        await this.#closeChannels(channels);
        for (const registeredName of serviceNames) {
          this.#unregisterService(registeredName);
        }
        throw error;
      }
    }

    this.#subclusters.set(subclusterId, { channels, serviceNames });
  }

  /**
   * Destroy IO channels for a subcluster and unregister their services.
   *
   * @param subclusterId - The ID of the subcluster.
   */
  async destroyChannels(subclusterId: string): Promise<void> {
    const state = this.#subclusters.get(subclusterId);
    if (!state) {
      return;
    }

    for (const name of state.serviceNames) {
      this.#unregisterService(name);
    }

    await this.#closeChannels(state.channels);
    this.#subclusters.delete(subclusterId);

    this.#logger?.info(`Destroyed IO channels for subcluster ${subclusterId}`);
  }

  /**
   * Close all channels in a map, logging errors.
   *
   * @param channels - The channels to close.
   */
  async #closeChannels(channels: Map<string, IOChannel>): Promise<void> {
    for (const [name, channel] of channels) {
      try {
        await channel.close();
      } catch (error) {
        this.#logger?.error(`Error closing IO channel "${name}":`, error);
      }
    }
  }
}
harden(IOManager);
