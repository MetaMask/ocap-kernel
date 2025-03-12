import '@ocap/shims/endoify';

import type { VatId } from '@ocap/kernel';
import { VatSupervisor } from '@ocap/kernel';
import { makeSQLKVStore } from '@ocap/store/sqlite/nodejs';
import { makeLogger } from '@ocap/utils';
import fs from 'node:fs/promises';
import url from 'node:url';

import makePowers from './powers/make-powers.ts';
import { makeCommandStream } from './streams.ts';

const vatId: VatId = process.env.NODE_VAT_ID as VatId;
const documentRoot = process.env.NODE_DOCUMENT_ROOT as string;

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

  const ollamaUrl = 'http://localhost:11434';

  // eslint-disable-next-line no-void
  void new VatSupervisor({
    id: vatId,
    commandStream,
    makeKVStore: makeSQLKVStore,
    // XXX This makes duplicate powers, even for vats that don't need them >:[
    // Some method is necessary for designating the appropriate powers when the
    // kernel is starting the vat. Running software doesn't need full isolation;
    // only its access within the program must be attenuated by some tame facade.
    makePowers: async () =>
      await makePowers({
        loadDocument: { root: documentRoot },
        ollama: { host: ollamaUrl },
        vectorStore: {
          host: ollamaUrl,
          model: (process.env.EMBED_MODEL as string) ?? undefined,
        },
      }),
    fetchBlob,
  });
}
