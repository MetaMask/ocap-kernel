import '@ocap/shims/endoify';

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import type { Json } from '@metamask/utils';
import { VatSupervisor } from '@ocap/kernel';
import type { VatCommand, VatCommandReply } from '@ocap/kernel';
import { NodeWorkerMultiplexer } from '@ocap/streams';
import { parentPort } from 'node:worker_threads';

console.debug('vat INSIDE calling MAIN');

main().catch(console.error);

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  console.debug('vat INSIDE started MAIN');
  if (!parentPort) {
    const errMsg = 'Expected to run in Node Worker with parentPort.';
    console.error(errMsg);
    throw new Error(errMsg);
  }
  const multiplexer = new NodeWorkerMultiplexer(parentPort, 'vat');
  const commandStream = multiplexer.createChannel<VatCommand, VatCommandReply>(
    'command',
  );
  const capTpStream = multiplexer.createChannel<Json, Json>('capTp');
  await multiplexer.start();
  const bootstrap = makeExo(
    'TheGreatFrangooly',
    M.interface('TheGreatFrangooly', {}, { defaultGuards: 'passable' }),
    { whatIsTheGreatFrangooly: () => 'Crowned with Chaos' },
  );

  const supervisor = new VatSupervisor({
    id: 'iframe',
    commandStream,
    capTpStream,
    bootstrap,
  });

  console.log(supervisor.evaluate('["Hello", "world!"].join(" ");'));
}
