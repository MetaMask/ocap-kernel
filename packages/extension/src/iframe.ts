import { VatSupervisor } from '@ocap/kernel';
import {
  MessagePortDuplexStream,
  receiveMessagePort,
} from '@ocap/streams/browser';
import { isJsonRpcMessage } from '@ocap/utils';
import type { JsonRpcMessage } from '@ocap/utils';

main().catch(console.error);

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

  console.log('VatSupervisor initialized with vatId:', vatId);
}
