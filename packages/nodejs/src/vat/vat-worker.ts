import '@metamask/kernel-shims/endoify';

import { Logger } from '@metamask/logger';
import type { VatId } from '@metamask/ocap-kernel';
import { VatSupervisor } from '@metamask/ocap-kernel';
import fs from 'node:fs/promises';
import url from 'node:url';

import { makeKernelStream } from './streams.ts';

const vatId = process.env.NODE_VAT_ID as VatId;
const processLogger = new Logger('nodejs-vat-worker');

/* eslint-disable n/no-unsupported-features/node-builtins */

if (vatId) {
  const vatLogger = processLogger.subLogger(vatId);
  main(vatLogger).catch(vatLogger.error);
} else {
  processLogger.error('no vatId set for env variable NODE_VAT_ID');
}

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
 *
 * @param _logger - The logger to use for logging. (currently unused)
 */
async function main(_logger: Logger): Promise<void> {
  const kernelStream = makeKernelStream();
  await kernelStream.synchronize();
  // eslint-disable-next-line no-void
  void new VatSupervisor({
    id: vatId,
    kernelStream,
    fetchBlob,
  });
}
