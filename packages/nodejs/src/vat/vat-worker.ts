import '@ocap/shims/endoify';

import { isVatCommand, VatSupervisor } from '@ocap/kernel';
import type { VatCommand, VatCommandReply } from '@ocap/kernel';
import { NodeWorkerMultiplexer } from '@ocap/streams';
import { makeLogger } from '@ocap/utils';
import { parentPort } from 'node:worker_threads';

import { makeSQLKVStore } from '../kernel/sqlite-kv-store.js';
const vatId = process.env.NODE_VAT_ID

// eslint-disable-next-line n/no-process-env
const logger = makeLogger(`[vat-worker ${vatId}]`);

main().catch(logger.error);

/**
 * The main function for the iframe.
 */
export async function main(): Promise<void> {
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
    isVatCommand,
  );

  const supervisor = new VatSupervisor({
    id: 'iframe',
    commandStream,
    makeKVStore: makeSQLKVStore,
  });
}
