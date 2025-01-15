import '@ocap/shims/endoify';

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import type { Json } from '@metamask/utils';
import { VatSupervisor } from '@ocap/kernel';
import type { VatCommand, VatCommandReply } from '@ocap/kernel';
import { NodeWorkerMultiplexer } from '@ocap/streams';
import { makeLogger } from '@ocap/utils';
import { parentPort } from 'node:worker_threads';

// eslint-disable-next-line n/no-process-env
const logger = makeLogger(`[vat-worker (${process.env.NODE_VAT_ID})]`);

main().catch(logger.error);

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  logger.debug('started main');

  if (!parentPort) {
    const errMsg = 'Expected to run in Node Worker with parentPort.';
    logger.error(errMsg);
    throw new Error(errMsg);
  }
  const multiplexer = new NodeWorkerMultiplexer(parentPort, 'vat');
  multiplexer.start().catch(logger.error);
  const commandStream = multiplexer.createChannel<VatCommand, VatCommandReply>(
    'command',
  );
  const capTpStream = multiplexer.createChannel<Json, Json>('capTp');
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

  logger.log(supervisor.evaluate('["Hello", "world!"].join(" ");'));
}
