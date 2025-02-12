import '@ocap/shims/endoify';

import { OllamaEmbeddings } from '@langchain/ollama';
import type { VatId } from '@ocap/kernel';
import { VatSupervisor } from '@ocap/kernel';
import { makeLogger } from '@ocap/utils';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { Ollama } from 'ollama';

import { makeCommandStream } from './streams';
import { makeSQLKVStore } from '../kernel/sqlite-kv-store';

const DEFAULT_LLM_MODEL = 'deepseek-r1:1.5b-8k';
const DEFAULT_EMBED_MODEL = 'mxbai-embed-large-8k';

const vatId = process.env.NODE_VAT_ID as VatId;

if (vatId) {
  const logger = makeLogger(`[vat-worker (${vatId})]`);
  main({
    host: 'http://localhost:11434',
    models: {
      llm: process.env.LLM_MODEL ?? (DEFAULT_LLM_MODEL as string),
      embedding: process.env.EMBED_MODEL ?? (DEFAULT_EMBED_MODEL as string),
    },
  }).catch(logger.error);
} else {
  console.log('no vatId set for env variable NODE_VAT_ID');
}

type Args = {
  host: string;
  models: {
    llm: string;
    embedding: string;
  };
};

/**
 * The main function for the iframe.
 *
 * @param options0
 * @param options0.host
 * @param options0.models
 */
async function main({ host, models }: Args): Promise<void> {
  const commandStream = makeCommandStream();
  await commandStream.synchronize();

  // XXX This makes duplicate powers, even for vats that don't need them >:[
  // Some method is necessary for designating the appropriate powers when the
  // kernel is starting the vat. Running software doesn't need full isolation;
  // only its access within the program must be attenuated by some tame facade.
  const ollama = new Ollama({ host });
  const embeddings = new OllamaEmbeddings({ baseUrl: host });
  const vectorStore = new MemoryVectorStore(embeddings);

  const getVectorStore = () => vectorStore;

  // eslint-disable-next-line no-void
  void new VatSupervisor({
    id: vatId,
    commandStream,
    makeKVStore: makeSQLKVStore,
    makePowers: async () => {
      return { ollama, getVectorStore };
    },
  });
}
