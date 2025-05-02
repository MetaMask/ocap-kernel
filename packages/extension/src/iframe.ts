import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { isJsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { VatSupervisor } from '@metamask/ocap-kernel';
import {
  MessagePortDuplexStream,
  receiveMessagePort,
} from '@metamask/streams/browser';

const logger = new Logger('iframe');

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

  // eslint-disable-next-line no-new
  new VatSupervisor({
    id: vatId,
    kernelStream,
  });

  logger.info('VatSupervisor initialized with vatId:', vatId);
}
