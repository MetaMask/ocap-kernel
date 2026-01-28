import { makeCapTP } from '@endo/captp';
import { JsonRpcServer } from '@metamask/json-rpc-engine/v2';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/wasm';
import { isJsonRpcMessage, stringify } from '@metamask/kernel-utils';
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
import type { KernelHostRoot } from './kernel-host-vat.ts';
import { makeKernelHostSubclusterConfig } from './kernel-host-vat.ts';
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

  // Launch the kernel host subcluster to get a proper system vat for CapTP
  let kernelHostRoot: KernelHostRoot | undefined;
  const hostSubclusterConfig = makeKernelHostSubclusterConfig((root) => {
    kernelHostRoot = root;
  });

  try {
    await kernel.launchSystemSubcluster(hostSubclusterConfig);
    logger.log('Launched kernel host subcluster');
  } catch (error) {
    logger.error('Failed to launch kernel host subcluster:', error);
    throw error;
  }

  if (!kernelHostRoot) {
    throw new Error('Kernel host root was not captured during launch');
  }

  // Create CapTP with the kernel host vat root as the bootstrap
  // This gives background proper presences for dynamic subcluster roots
  const sendCapTPMessage = (captpMessage: CapTPMessage): void => {
    const notification = makeCapTPNotification(captpMessage);
    messageStream.write(notification).catch((error) => {
      logger.error('Failed to send CapTP message:', error);
    });
  };

  const { dispatch: dispatchCapTP, abort: abortCapTP } = makeCapTP(
    'kernel',
    sendCapTPMessage,
    kernelHostRoot,
  );

  messageStream
    .drain((message) => {
      if (isCapTPNotification(message)) {
        const captpMessage = message.params[0];
        dispatchCapTP(captpMessage);
      } else {
        throw new Error(`Unexpected message: ${stringify(message)}`);
      }
    })
    .catch((error) => {
      abortCapTP(error);
      logger.error('Message stream error:', error);
    });

  const relays = getRelaysFromCurrentLocation();
  await kernel.initRemoteComms({ relays });
}
