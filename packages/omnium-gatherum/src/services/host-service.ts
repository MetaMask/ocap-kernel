import type { CapData } from '@endo/marshal';
import { rpcMethodSpecs } from '@metamask/kernel-browser-runtime';
import { RpcClient } from '@metamask/kernel-rpc-methods';
import type { JsonRpcCall } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type { ClusterConfig, KRef } from '@metamask/ocap-kernel';
import type { Json, JsonRpcResponse } from '@metamask/utils';

import { capletBootstrapService } from './caplet-bootstrap.ts';
import { capletInstallerService } from './caplet-installer.ts';
import { storageService } from './storage.ts';

const logger = new Logger('host-service');

/**
 * Host service that provides caplet management APIs and kernel access.
 */
export class HostService {
  #rpcClient: RpcClient<typeof rpcMethodSpecs> | null = null;

  /**
   * Initialize the host service with kernel RPC client.
   *
   * @param writeRequest - Function to write RPC requests.
   * @param handleResponse - Function to handle RPC responses.
   */
  initialize(
    writeRequest: (request: JsonRpcCall) => Promise<void>,
    handleResponse: (id: string, response: JsonRpcResponse) => void,
  ): void {
    this.#rpcClient = new RpcClient(
      rpcMethodSpecs,
      writeRequest,
      'host-service:',
    );

    // Set up response handling
    // Note: The caller should call handleResponse when responses arrive
    logger.log('Host service initialized');
  }

  /**
   * Launch a subcluster via kernel RPC.
   *
   * @param config - The cluster configuration.
   * @returns The bootstrap result.
   */
  async launchKernelSubcluster(
    config: ClusterConfig,
  ): Promise<CapData<KRef> | null> {
    if (!this.#rpcClient) {
      throw new Error('Host service not initialized');
    }

    const result = await this.#rpcClient.call('launchSubcluster', {
      config,
    });

    return result as CapData<KRef> | null;
  }

  /**
   * Terminate a subcluster via kernel RPC.
   *
   * @param subclusterId - The subcluster ID to terminate.
   */
  async terminateKernelSubcluster(subclusterId: string): Promise<void> {
    if (!this.#rpcClient) {
      throw new Error('Host service not initialized');
    }

    await this.#rpcClient.call('terminateSubcluster', {
      id: subclusterId,
    });
  }

  /**
   * Queue a message to a vat object via kernel RPC.
   *
   * @param target - The target KRef.
   * @param method - The method name.
   * @param args - The method arguments.
   * @returns The message result.
   */
  async queueMessage(
    target: KRef,
    method: string,
    args: Json[],
  ): Promise<unknown> {
    if (!this.#rpcClient) {
      throw new Error('Host service not initialized');
    }

    return await this.#rpcClient.call('queueMessage', [target, method, args]);
  }

  /**
   * Install a caplet with kernel integration.
   *
   * @param manifest - The caplet manifest.
   * @returns The installed caplet.
   */
  async installCaplet(
    manifest: Parameters<typeof capletInstallerService.installCaplet>[0],
  ) {
    return await capletInstallerService.installCaplet(
      manifest,
      {},
      async (config) => {
        const result = await this.launchKernelSubcluster(config);
        // Get subcluster ID from kernel status if needed
        // For now, we'll track it separately
        return result;
      },
    );
  }

  /**
   * Uninstall a caplet with kernel integration.
   *
   * @param capletId - The caplet ID to uninstall.
   */
  async uninstallCaplet(capletId: string): Promise<void> {
    const caplet = await storageService.getInstalledCaplet(capletId);
    await capletInstallerService.uninstallCaplet(
      capletId,
      caplet?.subclusterId
        ? async (subclusterId) => {
            await this.terminateKernelSubcluster(subclusterId);
          }
        : undefined,
    );
  }

  /**
   * Bootstrap a caplet (launch its subcluster).
   *
   * @param capletId - The caplet ID to bootstrap.
   */
  async bootstrapCaplet(capletId: string): Promise<void> {
    const caplet = await storageService.getInstalledCaplet(capletId);
    if (!caplet) {
      throw new Error(`Caplet ${capletId} is not installed`);
    }

    const result = await capletBootstrapService.bootstrapCaplet(
      capletId,
      caplet.manifest.clusterConfig,
      async (config) => this.launchKernelSubcluster(config),
    );

    // Store subcluster ID if we can extract it
    // Note: We'd need to query kernel status to get the actual subcluster ID
    // For now, this is a placeholder
    logger.log(`Bootstrapped caplet ${capletId}, result:`, result);
  }
}

/**
 * Singleton instance of the host service.
 */
export const hostService = new HostService();
