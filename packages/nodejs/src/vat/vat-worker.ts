import '@ocap/shims/endoify';

import type { VatId } from '@ocap/kernel';

const streams = '../../dist/vat/streams.mjs';
const store = '../../dist/kernel/sqlite-kv-store.mjs';

const { VatSupervisor } = await import('@ocap/kernel');
const { makeLogger } = await import('@ocap/utils');
const { makeCommandStream } = await import(streams);
const { makeSQLKVStore } = await import(store);

console.debug(`[vat-worker (${process.env.NODE_VAT_ID})] imports complete`);

const vatId = process.env.NODE_VAT_ID as VatId;

if (vatId) {
  console.log('vatId', vatId);
  const logger = makeLogger(`[vat-worker (${vatId})]`);
  logger.debug('starting worker...');
  main().catch(logger.error);
} else {
  console.log('no vatId set for env variable NODE_VAT_ID');
}

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  // eslint-disable-next-line no-void
  console.debug('entered main');
  const commandStream = makeCommandStream();
  await commandStream.synchronize();
  void new VatSupervisor({
    id: vatId,
    commandStream,
    makeKVStore: makeSQLKVStore,
  });
  console.debug('created supervisor');
}