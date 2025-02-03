import '@ocap/shims/endoify';

import type { VatId } from '@ocap/kernel';
import { VatSupervisor } from '@ocap/kernel';
import { makeLogger } from '@ocap/utils';

import { makeCommandStream } from './streams';
import { makeSQLKVStore } from '../kernel/sqlite-kv-store';
import { Ollama } from 'ollama';

const DEFAULT_MODEL = 'deepseek-r1:1.5b';

const vatId = process.env.NODE_VAT_ID as VatId;
const model = process.env.MODEL ?? DEFAULT_MODEL as string;

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

  const host = "http://localhost:11434";

  // XXX This makes duplicate powers, even for vats that don't need them >:[
  // Some method is necessary for designating the appropriate powers when the
  // kernel is starting the vat. Running software doesn't need full isolation,
  // only its access within the program; the 
  const ollama = new Ollama({ host });

  // eslint-disable-next-line no-void
  void new VatSupervisor({
    id: vatId,
    commandStream,
    makeKVStore: makeSQLKVStore,
    makePowers: async () => {
      await ollama.pull({ model });
      return { ollama };
    }
  });
}
