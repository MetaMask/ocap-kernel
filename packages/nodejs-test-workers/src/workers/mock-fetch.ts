import '@metamask/kernel-shims/node-endoify';
import { Logger } from '@metamask/logger';
import type { VatId } from '@metamask/ocap-kernel';
import { makeNodeJsVatSupervisor } from '@ocap/nodejs';

const LOG_TAG = 'nodejs-test-vat-worker';

let logger = new Logger(LOG_TAG);

/* eslint-disable n/no-unsupported-features/node-builtins */

main().catch((reason) => logger.error('main exited with error', reason));

/**
 * The main function for the vat worker.
 */
async function main(): Promise<void> {
  // eslint-disable-next-line n/no-process-env
  const vatId = process.env.NODE_VAT_ID as VatId;
  if (!vatId) {
    throw new Error('no vatId set for env variable NODE_VAT_ID');
  }
  const { logger: streamLogger } = await makeNodeJsVatSupervisor(
    vatId,
    LOG_TAG,
    {
      fetch: {
        fromFetch: async (input: string | URL | Request) => {
          logger.debug('fetch', input);
          return new Response('Hello, world!');
        },
      },
    },
  );
  logger = streamLogger;
  logger.debug('vat-worker main');
}
