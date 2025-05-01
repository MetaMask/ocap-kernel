import '@metamask/kernel-shims/endoify';

import { Logger, makeStreamTransport } from '@metamask/logger';
import type { VatId } from '@metamask/ocap-kernel';
import { VatSupervisor } from '@metamask/ocap-kernel';
import fs from 'node:fs/promises';
import url from 'node:url';

import { makeStreams } from './streams.ts';

const processLogger = new Logger('nodejs-vat-worker');

/* eslint-disable n/no-unsupported-features/node-builtins */

main().catch(processLogger.error);

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
  const logger = processLogger.subLogger({
    tags: [vatId],
    transports: [makeStreamTransport(loggerStream)],
  });
  // eslint-disable-next-line no-void
  void new VatSupervisor({
    id: vatId,
    kernelStream,
    logger,
    fetchBlob,
  });
}
