import { OllamaEmbeddings } from '@langchain/ollama';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';

type Args = {
  host: string;
  model?: string;
};

type GetVectorStore = () => MemoryVectorStore;

const DEFAULT_EMBED_MODEL = 'mxbai-embed-large-8k';

/**
 * Make a function that returns a vector store.
 *
 * @param options0 - The options for the vector store.
 * @param options0.host - The host to reach the local ollama server.
 * @param options0.model - The model to use for the vector store.
 * @returns A function that returns a vector store.
 */
export default function makeGetVectorStore({
  host,
  model,
}: Args): GetVectorStore {
  const embeddings = new OllamaEmbeddings({
    baseUrl: host,
    model: model ?? DEFAULT_EMBED_MODEL,
  });
  const vectorStore = new MemoryVectorStore(embeddings);

  // XXX Hardening the vectorStore renders it inoperational, so we wrap it in
  // an arrow function which returns a soft vectorStore even after hardening.
  const getVectorStore = (): MemoryVectorStore => vectorStore;

  return getVectorStore;
}
