import { JsonRpcServer } from '@metamask/json-rpc-engine/v2';
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
import type { JsonRpcResponse } from '@metamask/utils';

import defaultSubcluster from '../default-cluster.json';
import { receiveInternalConnections } from '../internal-comms/internal-connections.ts';
import { PlatformServicesClient } from '../PlatformServicesClient.ts';
import { getRelaysFromCurrentLocation } from '../utils/relay-query-string.ts';
import { makeLoggingMiddleware } from './middleware/logging.ts';
import { makePanelMessageMiddleware } from './middleware/panel-message.ts';

const logger = new Logger('kernel-worker');
const DB_FILENAME = 'store.db';

main().catch(logger.error);

/**
 * Run the kernel.
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
  const resetStorage =
    new URLSearchParams(globalThis.location.search).get('reset-storage') ===
    'true';

  const kernel = await Kernel.make(
    kernelStream,
    platformServicesClient,
    kernelDatabase,
    {
      resetStorage,
    },
  );

  const rpcServer = new JsonRpcServer({
    middleware: [
      makeLoggingMiddleware(logger.subLogger('kernel-command')),
      makePanelMessageMiddleware(kernel, kernelDatabase),
    ],
  });

  receiveInternalConnections({
    handleInternalMessage: async (request) => rpcServer.handle(request),
    logger,
  });

  const relays = getRelaysFromCurrentLocation();

  await Promise.all([
    // Initialize remote communications with the relay server passed in the query string
    kernel.initRemoteComms(relays),
    (async () => {
      // Launch the default subcluster if this is the first time
      if (firstTime || resetStorage) {
        const result = await kernel.launchSubcluster(defaultSubcluster);
        logger.info(`Subcluster launched: ${JSON.stringify(result)}`);
      }
    })(),
  ]);
}
