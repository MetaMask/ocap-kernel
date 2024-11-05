import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { Supervisor } from '@ocap/kernel';
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

  const bootstrap = makeExo(
    'TheGreatFrangooly',
    M.interface('TheGreatFrangooly', {}, { defaultGuards: 'passable' }),
    { whatIsTheGreatFrangooly: () => 'Crowned with Chaos' },
  );

  const supervisor = new Supervisor({ id: 'iframe', multiplexer, bootstrap });

  console.log(supervisor.evaluate('["Hello", "world!"].join(" ");'));
}
