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
import { receiveUiConnections } from '../ui-connections.ts';
import { VatWorkerClient } from '../VatWorkerClient.ts';
import { makeLoggingMiddleware } from './middleware/logging.ts';
import { createPanelMessageMiddleware } from './middleware/panel-message.ts';

const logger = new Logger('kernel-worker');
const DB_FILENAME = 'store.db';

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
  const vatWorkerClient = VatWorkerClient.make(globalThis as PostMessageTarget);
  const kernelDatabase = await makeSQLKernelDatabase({
    dbFilename: DB_FILENAME,
  });
  const firstTime = !kernelDatabase.kernelKVStore.get('initialized');

  const kernel = Kernel.make(kernelStream, vatWorkerClient, kernelDatabase);
  const kernelEngine = new JsonRpcEngine();
  kernelEngine.push(makeLoggingMiddleware(logger.subLogger('kernel-command')));
  kernelEngine.push(createPanelMessageMiddleware(kernel, kernelDatabase));
  // JsonRpcEngine type error: does not handle JSON-RPC notifications
  receiveUiConnections({
    handleInstanceMessage: async (request) =>
      kernelEngine.handle(request as JsonRpcRequest),
    logger,
  });

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
      if (firstTime) {
        const result = await kernel.launchSubcluster(defaultSubcluster);
        logger.info(`Subcluster launched: ${JSON.stringify(result)}`);
      } else {
        logger.info(`Resuming kernel execution`);
      }
    })(),
  ]);
}
