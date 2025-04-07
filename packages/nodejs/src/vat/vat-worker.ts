import '@ocap/shims/endoify';

import type { VatId } from '@ocap/kernel';
import { VatSupervisor } from '@ocap/kernel';
import fs from 'node:fs/promises';
import url from 'node:url';

import { makeVatLogger } from './logger.ts';
import { makeCommandStream } from './streams.ts';

const vatId = process.env.NODE_VAT_ID as VatId;

/* eslint-disable n/no-unsupported-features/node-builtins */

const logger = makeVatLogger(vatId);

main(vatId).catch((error) => logger.error(error));

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
 * The main function for the iframe.
 *
 * @param id - The ID of the vat this worker is running.
 */
async function main(id: VatId): Promise<void> {
  if (!id) {
    throw new Error('no vat ID set for env variable NODE_VAT_ID');
  }
  const commandStream = makeCommandStream();
  await commandStream.synchronize();
  // eslint-disable-next-line no-void
  void new VatSupervisor({
    id,
    commandStream,
    fetchBlob,
    logger,
  });
}
