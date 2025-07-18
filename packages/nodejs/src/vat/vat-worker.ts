import '@metamask/kernel-shims/endoify';

import { Logger, makeStreamTransport } from '@metamask/logger';
import type { VatId } from '@metamask/ocap-kernel';
import { VatSupervisor } from '@metamask/ocap-kernel';
import fs from 'node:fs/promises';
import url from 'node:url';

import { makeStreams } from './streams.ts';

const LOG_TAG = 'nodejs-vat-worker';

let logger = new Logger(LOG_TAG);

/* eslint-disable n/no-unsupported-features/node-builtins */

main().catch((reason) => logger.error('main exited with error', reason));

/**
 * Fetch a blob of bytes from a URL
 *
 * This works like `fetch`, but handles `file:` URLs directly, since Node's
 * `fetch` implementation chokes on those.
 *
 * @param blobURL - The URL of the blob to fetch.
 *
 * @returns a Response containing the requested blob.
 */
async function fetchBlob(blobURL: string): Promise<Response> {
  const parsedURL = new URL(blobURL);
  if (parsedURL.protocol === 'file:') {
    return new Response(await fs.readFile(url.fileURLToPath(parsedURL)));
  }
  return fetch(blobURL);
}

/**
 * The main function for the vat worker.
 */
async function main(): Promise<void> {
  const vatId = process.env.NODE_VAT_ID as VatId;
  if (!vatId) {
    throw new Error('no vatId set for env variable NODE_VAT_ID');
  }
  const { kernelStream, loggerStream } = await makeStreams();
  logger = new Logger({
    tags: [LOG_TAG, vatId],
    transports: [makeStreamTransport(loggerStream)],
  });
  // eslint-disable-next-line no-void
  void new VatSupervisor({
    id: vatId,
    kernelStream,
    logger,
    fetchBlob,
    vatPowers: { logger },
    endowmentsConfig: {
      fetch: {
        urls: [
          'http://localhost:11434/api/pull',
          'http://127.0.0.1:11434/api/pull',
          'http://localhost:11434/api/generate',
          'http://127.0.0.1:11434/api/generate',
        ],
      },
      abort: undefined,
    },
  });
  logger.debug('vat-worker main');
}
