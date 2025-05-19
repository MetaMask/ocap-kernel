import '../env/endoify.ts';

import { Logger } from '@metamask/logger';
import type { VatId } from '@metamask/ocap-kernel';

import { makeNodeJsVatSupervisor } from './make-supervisor.ts';

const LOG_TAG = 'nodejs-vat-worker';

let logger = new Logger(LOG_TAG);

main().catch((reason) => logger.error('main exited with error', reason));

/**
 * The main function for the vat worker.
 */
async function main(): Promise<void> {
  const vatId = process.env.NODE_VAT_ID as VatId;
  if (!vatId) {
    throw new Error('no vatId set for env variable NODE_VAT_ID');
  }
  const { logger: streamLogger } = await makeNodeJsVatSupervisor(
    vatId,
    LOG_TAG,
    { fetch: { fromFetch: fetch } },
  );
  logger = streamLogger;
  logger.debug('vat-worker main');
}
