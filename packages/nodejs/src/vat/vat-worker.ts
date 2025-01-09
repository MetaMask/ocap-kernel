import '@ocap/shims/endoify';

import { VatSupervisor } from '@ocap/kernel';
import type { VatCommand, VatCommandReply } from '@ocap/kernel';
import { NodeWorkerMultiplexer } from '@ocap/streams';
import { makeLogger } from '@ocap/utils';
import { parentPort } from 'node:worker_threads';

import { makeSQLKVStore } from '../kernel/sqlite-kv-store.js';

// eslint-disable-next-line n/no-process-env
const logger = makeLogger(`[vat-worker (${process.env.NODE_VAT_ID})]`);

main().catch(logger.error);

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  if (!parentPort) {
    const errMsg = 'Expected to run in Node Worker with parentPort.';
    logger.error(errMsg);
    throw new Error(errMsg);
  }
  const multiplexer = new NodeWorkerMultiplexer(parentPort, 'vat');
  console.debug('premulti');
  multiplexer.start().catch(logger.error);
  console.debug('postmulti');
  const commandStream = multiplexer.createChannel<VatCommand, VatCommandReply>(
    'command',
  );
  // eslint-disable-next-line no-void
  void new VatSupervisor({
    id: 'iframe',
    commandStream,
    makeKVStore: makeSQLKVStore,
  });
}
