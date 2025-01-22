import '@ocap/shims/endoify';

import type { VatId } from '@ocap/kernel';
import { makeLogger } from '@ocap/utils';

import { makeMultiplexer } from './make-multiplexer.js';
import { startVatWorker } from './make-vat-worker.js';
import { makeSQLKVStore } from '../kernel/sqlite-kv-store.js';

const vatId = process.env.NODE_VAT_ID as VatId;

if (vatId) {
  console.log('vatId', vatId);
  const logger = makeLogger(`[vat-worker (${vatId})]`);
  logger.debug('starting worker...');
  startVatWorker(vatId, makeMultiplexer, makeSQLKVStore).catch(logger.error);
} else {
  console.log('no vatId set for env variable NODE_VAT_ID');
}
