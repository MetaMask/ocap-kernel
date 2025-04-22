import { VatSupervisor } from '@ocap/kernel';
import { Logger } from '@ocap/logger';
import {
  MessagePortDuplexStream,
  receiveMessagePort,
} from '@ocap/streams/browser';
import type { JsonRpcMessage } from '@ocap/utils';
import { isJsonRpcMessage } from '@ocap/utils';

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
