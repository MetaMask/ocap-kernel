import '@metamask/kernel-shims/endoify';

import { Logger, makeStreamTransport } from '@metamask/logger';
import type { VatId } from '@metamask/ocap-kernel';
import { VatSupervisor } from '@metamask/ocap-kernel';
import { makeStreams } from '@ocap/nodejs';
import { resolve } from 'node:path';

import makeDemoFs from './fs.ts';
import { getUrlSourceDir } from './url.ts';

const { readFile } = makeDemoFs(
  resolve(getUrlSourceDir(import.meta.url), '../demos'),
);

const LOG_TAG = 'demo-vat-worker';

let logger = new Logger(LOG_TAG);

/* eslint-disable n/no-unsupported-features/node-builtins */

main().catch((reason) => logger.error('main exited with error', reason));

const fileUrlPrefix = 'file:';

/**
 * The main function for the vat worker.
 */
async function main(): Promise<void> {
  // TODO: make this an exception by convention
  // eslint-disable-next-line n/no-process-env
  const vatId = process.env.NODE_VAT_ID as VatId;
  if (!vatId) {
    throw new Error('no vatId set for env variable NODE_VAT_ID');
  }
  const { kernelStream, loggerStream } = await makeStreams();
  logger = new Logger({
    tags: [LOG_TAG, vatId],
    transports: [makeStreamTransport(loggerStream)],
  });
  const fetchBlob = async (blobURL: string): Promise<Response> =>
    blobURL.startsWith(fileUrlPrefix)
      ? new Response(await readFile(blobURL.slice(fileUrlPrefix.length)))
      : fetch(blobURL);
  // eslint-disable-next-line no-void
  void new VatSupervisor({
    id: vatId,
    kernelStream,
    logger,
    fetchBlob,
    vatPowers: { logger },
  });
  logger.debug('vat-worker main');
}
