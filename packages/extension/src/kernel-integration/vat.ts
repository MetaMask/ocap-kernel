import { isVatCommand, VatSupervisor } from '@ocap/kernel';
import type { VatCommand, VatCommandReply } from '@ocap/kernel';
import { MessagePortDuplexStream, receiveMessagePort } from '@ocap/streams';
import { getUrlParam } from '@ocap/utils';

import { makeSQLKVStore } from './sqlite-kv-store.js';

main().catch(console.error);

/**
 * The main function for vat initialization (used by both iframe and web worker)
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

  // eslint-disable-next-line no-new
  new VatSupervisor({
    id: getUrlParam('vatId') ?? 'unknown',
    commandStream,
    makeKVStore: makeSQLKVStore,
  });
}
