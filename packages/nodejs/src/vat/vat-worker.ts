import '@ocap/shims/endoify';

import type { VatId } from '@ocap/kernel';
import { VatSupervisor } from '@ocap/kernel';
import { makeLogger } from '@ocap/utils';
import fs from 'node:fs/promises';
import url from 'node:url';

import { makeCommandStream } from './streams.ts';

const vatId = process.env.NODE_VAT_ID as VatId;

/* eslint-disable n/no-unsupported-features/node-builtins */

if (vatId) {
  const logger = makeLogger(`[vat-worker (${vatId})]`);
  main().catch((error) => logger.error(error));
} else {
  console.log('no vatId set for env variable NODE_VAT_ID');
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
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  const commandStream = makeCommandStream();
  await commandStream.synchronize();
  // eslint-disable-next-line no-void
  void new VatSupervisor({
    id: vatId,
    commandStream,
    fetchBlob,
  });
}
