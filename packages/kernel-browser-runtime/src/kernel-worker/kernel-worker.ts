import { makePromiseKit } from '@endo/promise-kit';
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
import type { JsonRpcResponse } from '@metamask/utils';

import { makeKernelHostVat } from '../host-vat/kernel-side.ts';
import { receiveInternalConnections } from '../internal-comms/internal-connections.ts';
import { PlatformServicesClient } from '../PlatformServicesClient.ts';
import { makeLoggingMiddleware } from './middleware/logging.ts';
import { makePanelMessageMiddleware } from './middleware/panel-message.ts';
import { getRelaysFromCurrentLocation } from '../utils/relay-query-string.ts';

type HandleInternalMessage = (
  request: JsonRpcMessage,
) => Promise<JsonRpcResponse | void>;

const logger = new Logger('kernel-worker');
const DB_FILENAME = 'store.db';

main().catch(logger.error);

/**
 * Run the kernel.
 */
async function main(): Promise<void> {
  // Synchronously start listening for internal connections
  const panelHandlerKit = makePromiseKit<HandleInternalMessage>();
  receiveInternalConnections({
    handlerPromise: panelHandlerKit.promise,
    logger,
  });

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

  const kernel = await Kernel.make(platformServicesClient, kernelDatabase, {
    resetStorage,
  });

  const panelRpcServer = new JsonRpcServer({
    middleware: [
      makeLoggingMiddleware(logger.subLogger('internal-rpc')),
      makePanelMessageMiddleware(kernel, kernelDatabase),
    ],
  });
  panelHandlerKit.resolve(panelRpcServer.handle.bind(panelRpcServer));

  const hostVat = makeKernelHostVat({
    name: 'kernelHost',
    logger: logger.subLogger({ tags: ['host-vat'] }),
  });

  // Connect host vat to the background via the message stream
  // The background will use makeBackgroundHostVat to create the supervisor side
  const hostVatStream = messageStream as unknown as Parameters<
    typeof hostVat.connect
  >[0];
  hostVat.connect(hostVatStream);

  logger.log('Kernel started with host vat transport');

  const relays = getRelaysFromCurrentLocation();
  await kernel.initRemoteComms({ relays });
}
