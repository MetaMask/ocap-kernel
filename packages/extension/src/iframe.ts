import { isVatCommand, VatSupervisor } from '@ocap/kernel';
import type { VatCommand, VatCommandReply } from '@ocap/kernel';
import {
  MessagePortDuplexStream,
  receiveMessagePort,
} from '@ocap/streams/browser';
import { Logger } from '@ocap/utils';

const logger = new Logger('iframe');

main().catch(logger.error);

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  const commandStream = await receiveMessagePort(
    (listener) => addEventListener('message', listener),
    (listener) => removeEventListener('message', listener),
  ).then(async (port) =>
    MessagePortDuplexStream.make<VatCommand, VatCommandReply>(
      port,
      isVatCommand,
    ),
  );

  const urlParams = new URLSearchParams(window.location.search);
  const vatId = urlParams.get('vatId') ?? 'unknown';

  // eslint-disable-next-line no-new
  new VatSupervisor({
    id: vatId,
    commandStream,
  });

  logger.info('VatSupervisor initialized with vatId:', vatId);
}
