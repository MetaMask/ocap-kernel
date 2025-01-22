import '@ocap/shims/endoify';

import type { VatId } from '@ocap/kernel';
import { isVatCommand, VatSupervisor } from '@ocap/kernel';
import type { VatCommand, VatCommandReply } from '@ocap/kernel';
import { NodeWorkerDuplexStream } from '@ocap/streams';

import { makeLogger } from '@ocap/utils';

import { makeMultiplexer } from './make-multiplexer.js';
import { startVatWorker } from './make-vat-worker.js';
import { makeSQLKVStore } from '../kernel/sqlite-kv-store.js';

const vatId = process.env.NODE_VAT_ID as VatId;

if (vatId) {
  console.log('vatId', vatId);
  const logger = makeLogger(`[vat-worker (${vatId})]`);
  logger.debug('starting worker...');
  main().catch(logger.error)
} else {
  console.log('no vatId set for env variable NODE_VAT_ID');
}

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  if (!parentPort) {
    const errMsg = 'Expected to run in Node Worker with parentPort.';
    logger.error(errMsg);
    throw new Error(errMsg);
  }
  const commandStream = new NodeWorkerDuplexStream<VatCommand, VatCommandReply>(
    parentPort,
    isVatCommand,
  );
  // eslint-disable-next-line no-void
  void new VatSupervisor({
    id: 'iframe',
    commandStream,
    makeKVStore: makeSQLKVStore,
  });
}
