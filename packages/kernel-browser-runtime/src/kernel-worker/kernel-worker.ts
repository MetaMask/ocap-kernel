import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/wasm';
import { isJsonRpcCall } from '@metamask/kernel-utils';
import type { JsonRpcCall } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { Kernel } from '@metamask/ocap-kernel';
import type { PostMessageTarget } from '@metamask/streams/browser';
import {
  MessagePortDuplexStream,
  receiveMessagePort,
} from '@metamask/streams/browser';
import type { JsonRpcRequest, JsonRpcResponse } from '@metamask/utils';

import defaultSubcluster from '../default-cluster.json';
import { PlatformServicesClient } from '../PlatformServicesClient.ts';
import { receiveUiConnections } from '../ui-connections.ts';
import { makeLoggingMiddleware } from './middleware/logging.ts';
import { createPanelMessageMiddleware } from './middleware/panel-message.ts';

const logger = new Logger('kernel-worker');
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
    JsonRpcCall,
    JsonRpcResponse
  >(port, isJsonRpcCall);

  // Initialize kernel dependencies
  const platformServicesClient = PlatformServicesClient.make(
    globalThis as PostMessageTarget,
  );
  const kernelDatabase = await makeSQLKernelDatabase({
    dbFilename: DB_FILENAME,
  });
  const firstTime = !kernelDatabase.kernelKVStore.get('initialized');

  const kernel = await Kernel.make(
    kernelStream,
    platformServicesClient,
    kernelDatabase,
    {
      resetStorage: ALWAYS_RESET_STORAGE,
    },
  );
  const kernelEngine = new JsonRpcEngine();
  kernelEngine.push(makeLoggingMiddleware(logger.subLogger('kernel-command')));
  kernelEngine.push(createPanelMessageMiddleware(kernel, kernelDatabase));
  // JsonRpcEngine type error: does not handle JSON-RPC notifications
  receiveUiConnections({
    handleInstanceMessage: async (request) =>
      kernelEngine.handle(request as JsonRpcRequest),
    logger,
  });
  const launchDefaultSubcluster = firstTime || ALWAYS_RESET_STORAGE;

  await Promise.all([
    platformServicesClient.start(),
    kernel.initRemoteComms(),
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
        logger.info(`Subcluster launched: ${JSON.stringify(result)}`);
      } else {
        logger.info(`Resuming kernel execution`);
      }
    })(),
  ]);
}
