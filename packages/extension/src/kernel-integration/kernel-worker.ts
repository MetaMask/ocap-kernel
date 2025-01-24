import type { Struct } from '@metamask/superstruct';
import { assert } from '@metamask/superstruct';
import type {
  ClusterConfig,
  KernelCommand,
  KernelCommandReply,
} from '@ocap/kernel';
import { ClusterConfigStruct, isKernelCommand, Kernel } from '@ocap/kernel';
import type { PostMessageTarget } from '@ocap/streams';
import { MessagePortDuplexStream, receiveMessagePort } from '@ocap/streams';
import { makeLogger } from '@ocap/utils';

import { handlePanelMessage } from './handle-panel-message.js';
import { makeSQLKVStore } from './sqlite-kv-store.js';
import { receiveUiConnections } from './ui-connections.js';
import { ExtensionVatWorkerClient } from './VatWorkerClient.js';

const logger = makeLogger('[kernel worker]');

/**
 * Load and validate a cluster configuration file
 *
 * @param configUrl - Path to the config JSON file
 * @param validator - The validator to use to validate the config
 * @returns The validated cluster configuration
 */
export async function fetchValidatedJson<Type>(
  configUrl: string,
  validator: Struct<Type>,
): Promise<Type> {
  try {
    const response = await fetch(configUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch config: ${response.status} ${response.statusText}`,
      );
    }
    const config = await response.json();
    logger.info(`Loaded cluster config: ${JSON.stringify(config)}`);
    assert(config, validator);
    return config;
  } catch (error) {
    throw new Error(
      `Failed to load config from ${configUrl}: ${String(error)}`,
    );
  }
}

main().catch(logger.error);

/**
 *
 */
async function main(): Promise<void> {
  const port = await receiveMessagePort(
    (listener) => globalThis.addEventListener('message', listener),
    (listener) => globalThis.removeEventListener('message', listener),
  );

  const kernelStream = await MessagePortDuplexStream.make<
    KernelCommand,
    KernelCommandReply
  >(port, isKernelCommand);

  // Initialize kernel dependencies
  const vatWorkerClient = ExtensionVatWorkerClient.make(
    globalThis as PostMessageTarget,
  );
  const kvStore = await makeSQLKVStore();

  const kernel = new Kernel(kernelStream, vatWorkerClient, kvStore);
  receiveUiConnections(
    async (message) => handlePanelMessage(kernel, kvStore, message),
    logger,
  );
  await kernel.init();

  const defaultSubcluster = await fetchValidatedJson<ClusterConfig>(
    new URL('../vats/default-cluster.json', import.meta.url).href,
    ClusterConfigStruct,
  );

  await Promise.all([
    vatWorkerClient.start(),
    // XXX We are mildly concerned that there's a small chance that a race here
    // could cause startup to flake non-deterministically. If the invocation
    // here of `launchSubcluster` turns out to depend on aspects of the IPC
    // setup completing successfully but those pieces aren't ready in time, then
    // it could get stuck.  Current experience suggests this is not a problem,
    // but as yet have only an intuitive sense (i.e., promises, yay) why this
    // might be true rather than a principled explanation that it is necessarily
    // true. Hence this comment to serve as a marker if some problem crops up
    // with startup wedging and some poor soul is reading through the code
    // trying to diagnose it.
    (async () => {
      const roots = await kernel.launchSubcluster(defaultSubcluster);
      console.log(`Subcluster launched: ${JSON.stringify(roots)}`);
    })(),
  ]);
}
