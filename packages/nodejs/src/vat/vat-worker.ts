import '@ocap/shims/endoify';

import type { VatId } from '@ocap/kernel';
import { VatSupervisor } from '@ocap/kernel';
import { makeSQLKVStore } from '@ocap/store/sqlite/nodejs';
import { makeLogger } from '@ocap/utils';

import { makeCommandStream } from './streams.js';

const vatId = process.env.NODE_VAT_ID as VatId;

if (vatId) {
  const logger = makeLogger(`[vat-worker (${vatId})]`);
  main().catch(logger.error);
} else {
  console.log('no vatId set for env variable NODE_VAT_ID');
}

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  const commandStream = makeCommandStream();
  await commandStream.synchronize();
  // eslint-disable-next-line no-void
  void new VatSupervisor({
    id: vatId,
    commandStream,
    makeKVStore: makeSQLKVStore,
  });
}
