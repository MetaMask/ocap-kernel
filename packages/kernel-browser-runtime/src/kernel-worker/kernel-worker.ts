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

import {
  isCapTPNotification,
  makeCapTPNotification,
} from '../background-captp.ts';
import type { CapTPMessage } from '../background-captp.ts';
import { receiveInternalConnections } from '../internal-comms/internal-connections.ts';
import { PlatformServicesClient } from '../PlatformServicesClient.ts';
import { makeKernelCapTP } from './captp/index.ts';
import { makeLoggingMiddleware } from './middleware/logging.ts';
import { makePanelMessageMiddleware } from './middleware/panel-message.ts';
import { getRelaysFromCurrentLocation } from '../utils/relay-query-string.ts';

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

  const [messageStream, platformServicesClient, kernelDatabase] =
    await Promise.all([
      MessagePortDuplexStream.make<JsonRpcMessage, JsonRpcMessage>(
        port,
        isJsonRpcMessage,
      ),
      PlatformServicesClient.make(globalThis as PostMessageTarget),
      makeSQLKernelDatabase({ dbFilename: DB_FILENAME }),
    ]);

  const resetStorage =
    new URLSearchParams(globalThis.location.search).get('reset-storage') ===
    'true';

  const kernelP = Kernel.make(platformServicesClient, kernelDatabase, {
    resetStorage,
  });

  const handlerP = kernelP.then((kernel) => {
    const server = new JsonRpcServer({
      middleware: [
        makeLoggingMiddleware(logger.subLogger('internal-rpc')),
        makePanelMessageMiddleware(kernel, kernelDatabase),
      ],
    });
    return async (request: JsonRpcMessage) => server.handle(request);
  });

  receiveInternalConnections({
    handlerPromise: handlerP,
    logger,
  });

  const kernel = await kernelP;

  const kernelCapTP = makeKernelCapTP({
    kernel,
    send: (captpMessage: CapTPMessage) => {
      const notification = makeCapTPNotification(captpMessage);
      messageStream.write(notification).catch((error) => {
        logger.error('Failed to send CapTP message:', error);
      });
    },
  });

  messageStream
    .drain((message) => {
      if (isCapTPNotification(message)) {
        const captpMessage = message.params[0];
        kernelCapTP.dispatch(captpMessage);
      }
    })
    .catch((error) => {
      logger.error('Message stream error:', error);
    });

  const relays = getRelaysFromCurrentLocation();
  await kernel.initRemoteComms({ relays });
}
