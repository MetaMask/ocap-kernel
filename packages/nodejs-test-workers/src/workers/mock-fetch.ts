import '@metamask/kernel-shims/endoify-node';
import { makeNodeJsVatSupervisor } from '@metamask/kernel-node-runtime';
import { Logger } from '@metamask/logger';
import type { VatId } from '@metamask/ocap-kernel';

const LOG_TAG = 'nodejs-test-vat-worker';

let logger = new Logger(LOG_TAG);

// The Snaps network factory reads `globalThis.fetch` at call time, so stub
// it before the supervisor is constructed. Endoify hardens intrinsics but
// not `globalThis.fetch`, so the override sticks.
globalThis.fetch = async (input) => {
  logger.debug('fetch', input);
  return new Response('Hello, world!');
};

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
  );
  logger = streamLogger;
  logger.debug('vat-worker main');
}
