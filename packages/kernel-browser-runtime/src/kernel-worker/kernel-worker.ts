import { JsonRpcServer } from '@metamask/json-rpc-engine/v2';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/wasm';
import { isJsonRpcMessage } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { Kernel } from '@metamask/ocap-kernel';
import type { PostMessageTarget } from '@metamask/streams/browser';
import {
  MessagePortDuplexStream,
  receiveMessagePort,
} from '@metamask/streams/browser';

import { makeKernelCapTP } from './captp/index.ts';
import { makeMessageRouter } from './captp/message-router.ts';
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

  // Initialize other kernel dependencies
  const [messageRouter, platformServicesClient, kernelDatabase] =
    await Promise.all([
      MessagePortDuplexStream.make<JsonRpcMessage, JsonRpcMessage>(
        port,
        isJsonRpcMessage,
      ).then((stream) => makeMessageRouter(stream)),
      PlatformServicesClient.make(globalThis as PostMessageTarget),
      makeSQLKernelDatabase({ dbFilename: DB_FILENAME }),
    ]);

  const resetStorage =
    new URLSearchParams(globalThis.location.search).get('reset-storage') ===
    'true';

  // Create kernel with the filtered stream (only sees non-CapTP messages)
  const kernelP = Kernel.make(
    messageRouter.kernelStream,
    platformServicesClient,
    kernelDatabase,
    {
      resetStorage,
    },
  );
  const handlerP = kernelP.then((kernel) => {
    const server = new JsonRpcServer({
      middleware: [
        makeLoggingMiddleware(logger.subLogger('kernel-command')),
        makePanelMessageMiddleware(kernel, kernelDatabase),
      ],
    });
    return async (request: JsonRpcCall) => server.handle(request);
  });

  receiveInternalConnections({
    handlerPromise: handlerP,
    logger,
  });

  const kernel = await kernelP;

  // Set up CapTP for background ↔ kernel communication
  const kernelCapTP = makeKernelCapTP({
    kernel,
    send: messageRouter.sendCapTP,
  });
  messageRouter.setCapTPDispatch(kernelCapTP.dispatch);

  // Start the message router (routes incoming messages to kernel or CapTP)
  messageRouter.start().catch((error) => {
    logger.error('Message router error:', error);
  });

  // Initialize remote communications with the relay server passed in the query string
  const relays = getRelaysFromCurrentLocation();
  await kernel.initRemoteComms({ relays });
}
