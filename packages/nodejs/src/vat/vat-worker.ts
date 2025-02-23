import '@ocap/shims/endoify';

import type { VatId } from '@ocap/kernel';
import { VatSupervisor } from '@ocap/kernel';
import { makeLogger } from '@ocap/utils';

import { makeCommandStream } from './streams';
import { makeSQLKVStore } from '../kernel/sqlite-kv-store';
import makePowers from './powers/make-powers';

const vatId = process.env.NODE_VAT_ID as VatId;
const documentRoot = process.env.NODE_DOCUMENT_ROOT as string;

if (vatId) {
  const logger = makeLogger(`[vat-worker (${vatId})]`);
  main().catch(logger.error);
} else {
  console.log('no vatId set for env variable NODE_VAT_ID');
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
    makePowers: async () => await makePowers({
      loadDocument: { root: documentRoot },
      ollama: { host: ollamaUrl },
      vectorStore: {
        host: ollamaUrl,
        model: (process.env.EMBED_MODEL as string) ?? undefined,
      },
    }),
  });
}
