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

main().catch(logger.error);

/**
 *
 */
async function main(): Promise<void> {
  const port = await receiveMessagePort(
    (listener) => globalThis.addEventListener('message', listener),
    (listener) => globalThis.removeEventListener('message', listener),
  );

  // Initialize kernel dependencies
  const [kernelStream, platformServicesClient, kernelDatabase] =
    await Promise.all([
      MessagePortDuplexStream.make<JsonRpcCall, JsonRpcResponse>(
        port,
        isJsonRpcCall,
      ),
      PlatformServicesClient.make(globalThis as PostMessageTarget),
      makeSQLKernelDatabase({ dbFilename: DB_FILENAME }),
    ]);
  const firstTime = !kernelDatabase.kernelKVStore.get('initialized');

  const kernel = await Kernel.make(
    kernelStream,
    platformServicesClient,
    kernelDatabase,
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

  await Promise.all([
    // Initialize remote communications with the relay server from @ocap/cli
    kernel.initRemoteComms([
      '/ip4/127.0.0.1/tcp/9001/ws/p2p/12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc',
    ]),
    (async () => {
      // Launch the default subcluster if this is the first time
      if (firstTime) {
        const result = await kernel.launchSubcluster(defaultSubcluster);
        logger.info(`Subcluster launched: ${JSON.stringify(result)}`);
      }
    })(),
  ]);
}
