import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { isJsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { VatSupervisor } from '@metamask/ocap-kernel';
import {
  MessagePortDuplexStream,
  receiveMessagePort,
} from '@metamask/streams/browser';
import { makePlatform } from '@ocap/kernel-platforms/browser';

import { setupConsoleForwarding } from '../utils/console-forwarding.ts';

const logger = new Logger('vat-iframe');

main().catch(logger.error);

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  const kernelStream = await receiveMessagePort(
    (listener) => addEventListener('message', listener),
    (listener) => removeEventListener('message', listener),
  ).then(async (port) =>
    MessagePortDuplexStream.make<JsonRpcMessage, JsonRpcMessage>(
      port,
      isJsonRpcMessage,
    ),
  );

  const urlParams = new URLSearchParams(window.location.search);
  const vatId = urlParams.get('vatId') ?? 'unknown';

  setupConsoleForwarding({
    source: `vat-${vatId}`,
    onMessage: (message) => {
      window.parent.postMessage(message, '*');
    },
  });

  // eslint-disable-next-line no-new
  new VatSupervisor({
    id: vatId,
    kernelStream,
    logger: logger.subLogger(vatId),
    makePlatform,
  });

  logger.info('VatSupervisor initialized with vatId:', vatId);
}
