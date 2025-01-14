import '@ocap/shims/endoify';

import type { VatId } from '@ocap/kernel';
import { makeLogger } from '@ocap/utils';

import { makeSQLKVStore } from './kernel/sqlite-kv-store.js';
import { makeMultiplexer } from './vat/make-multiplexer.js';
import { makeVatWorker } from './vat/make-vat-worker.js';

const vatId = process.env.NODE_VAT_ID as VatId;

if (vatId) {
  const logger = makeLogger(`[vat-worker (${vatId})]`);
  logger.debug('starting worker...');
  const { start, stop } = makeVatWorker(vatId, makeMultiplexer, makeSQLKVStore);
  try {
    await start();
  } catch (problem) {
    logger.error(problem);
  } finally {
    await stop();
  }
} else {
  console.log('no vatId set for env variable NODE_VAT_ID');
}
