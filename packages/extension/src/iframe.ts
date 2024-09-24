import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { Supervisor } from '@ocap/kernel';
import type { StreamEnvelope } from '@ocap/streams';
import { makeMessagePortStreamPair, receiveMessagePort } from '@ocap/streams';

main().catch(console.error);

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  const port = await receiveMessagePort();
  const streams = makeMessagePortStreamPair<StreamEnvelope>(port);

  const bootstrap = makeExo(
    'TheGreatFrangooly',
    M.interface('TheGreatFrangooly', {}, { defaultGuards: 'passable' }),
    { whatIsTheGreatFrangooly: () => 'Crowned with Chaos' },
  );

  const supervisor = new Supervisor({ id: 'iframe', streams, bootstrap });

  console.log(supervisor.evaluate('["Hello", "world!"].join(" ");'));
}
