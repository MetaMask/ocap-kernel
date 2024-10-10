import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { Supervisor } from '@ocap/kernel';
import type { StreamEnvelope, StreamEnvelopeReply } from '@ocap/kernel';
import { MessagePortDuplexStream, receiveMessagePort } from '@ocap/streams';

main().catch(console.error);

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  const port = await receiveMessagePort(
    (listener) => addEventListener('message', listener),
    (listener) => removeEventListener('message', listener),
  );
  const stream = new MessagePortDuplexStream<
    StreamEnvelope,
    StreamEnvelopeReply
  >(port);

  const bootstrap = makeExo(
    'TheGreatFrangooly',
    M.interface('TheGreatFrangooly', {}, { defaultGuards: 'passable' }),
    { whatIsTheGreatFrangooly: () => 'Crowned with Chaos' },
  );

  const supervisor = new Supervisor({ id: 'iframe', stream, bootstrap });

  console.log(supervisor.evaluate('["Hello", "world!"].join(" ");'));
}
