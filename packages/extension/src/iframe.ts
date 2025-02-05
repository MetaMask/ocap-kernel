import { isVatCommand, VatSupervisor } from '@ocap/kernel';
import type { VatCommand, VatCommandReply } from '@ocap/kernel';
import { makeSQLKVStore } from '@ocap/store/sqlite/wasm';
import { MessagePortDuplexStream, receiveMessagePort } from '@ocap/streams';

main().catch(console.error);

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
    makeKVStore: makeSQLKVStore,
  });
}
