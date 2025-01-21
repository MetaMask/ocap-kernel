import { isVatCommand, VatSupervisor } from '@ocap/kernel';
import type { VatCommand, VatCommandReply } from '@ocap/kernel';
import { MessagePortMultiplexer, receiveMessagePort } from '@ocap/streams';

import { makeSQLKVStore } from './kernel-integration/sqlite-kv-store.js';

main().catch(console.error);

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  const multiplexer = await receiveMessagePort(
    (listener) => addEventListener('message', listener),
    (listener) => removeEventListener('message', listener),
  ).then(async (port) => new MessagePortMultiplexer(port));

  const commandStream = multiplexer.createChannel<VatCommand, VatCommandReply>(
    'command',
    isVatCommand,
  );
  // eslint-disable-next-line no-new
  new VatSupervisor({
    id: 'iframe',
    commandStream,
    makeKVStore: makeSQLKVStore,
  });

  await multiplexer.start();
}
