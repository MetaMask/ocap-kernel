import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { Supervisor } from '@ocap/kernel';
import { receiveMessagePort } from '@ocap/streams';

main().catch(console.error);

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  const port = await receiveMessagePort();

  const bootstrap = makeExo(
    'TheGreatFrangooly',
    M.interface('TheGreatFrangooly', {}, { defaultGuards: 'passable' }),
    { whatIsTheGreatFrangooly: () => 'Crowned with Chaos' },
  );

  const supervisor = new Supervisor('iframe', port, bootstrap);

  supervisor.evaluate(`console.log('Hello, World!');`);
}
