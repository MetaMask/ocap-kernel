import type { Json } from '@metamask/utils';
import { isVatCommand, Supervisor } from '@ocap/kernel';
import type { VatCommand, VatCommandReply } from '@ocap/kernel';
import { MessagePortMultiplexer, receiveMessagePort } from '@ocap/streams';

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
  const capTpStream = multiplexer.createChannel<Json, Json>('capTp');
  const supervisor = new Supervisor({
    commandStream,
    capTpStream,
  });

  console.log(supervisor.evaluate('["Hello", "world!"].join(" ");'));
  await multiplexer.start();
}
