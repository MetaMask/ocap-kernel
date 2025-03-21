import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type {
  ClusterConfig,
  KernelCommand,
  KernelCommandReply,
} from '@ocap/kernel';
import { ClusterConfigStruct, isKernelCommand, Kernel } from '@ocap/kernel';
import { makeSQLKernelDatabase } from '@ocap/store/sqlite/wasm';
import type { PostMessageTarget } from '@ocap/streams/browser';
import {
  MessagePortDuplexStream,
  receiveMessagePort,
} from '@ocap/streams/browser';
import { fetchValidatedJson, makeLogger } from '@ocap/utils';

import { loggingMiddleware } from './middleware/logging.ts';
import { createPanelMessageMiddleware } from './middleware/panel-message.ts';
import { receiveUiConnections } from './ui-connections.ts';
import { ExtensionVatWorkerClient } from './VatWorkerClient.ts';

const logger = makeLogger('[kernel worker]');
const DB_FILENAME = 'store.db';

// XXX Warning: Setting this flag to true causes persistent storage to be
// cleared on extension load. This is a hack to aid development debugging,
// wherein extension reloads are almost exclusively used for retrying from
// scratch after tweaking the code to fix something. Setting the flag will
// prevent the accumulation of long term persistent state, so it should be
// cleared (or simply removed) prior to release.
const ALWAYS_RESET_STORAGE = true;

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
  const kernelDatabase = await makeSQLKernelDatabase({
    dbFilename: DB_FILENAME,
  });
  const firstTime = !kernelDatabase.kernelKVStore.get('initialized');

  const kernel = await Kernel.make(
    kernelStream,
    vatWorkerClient,
    kernelDatabase,
    {
      resetStorage: ALWAYS_RESET_STORAGE,
    },
  );
  const kernelEngine = new JsonRpcEngine();
  kernelEngine.push(loggingMiddleware);
  kernelEngine.push(createPanelMessageMiddleware(kernel, kernelDatabase));
  receiveUiConnections(async (request) => kernelEngine.handle(request), logger);
  const launchDefaultSubcluster = firstTime || ALWAYS_RESET_STORAGE;

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
    // but as yet we have only an intuitive sense (i.e., promises, yay) why this
    // might be true rather than a principled explanation that it is necessarily
    // true. Hence this comment to serve as a marker if some problem crops up
    // with startup wedging and some poor soul is reading through the code
    // trying to diagnose it.
    (async () => {
      if (launchDefaultSubcluster) {
        const result = await kernel.launchSubcluster(defaultSubcluster);
        console.log(`Subcluster launched: ${JSON.stringify(result)}`);
      } else {
        console.log(`Resuming kernel execution`);
      }
    })(),
  ]);
}
