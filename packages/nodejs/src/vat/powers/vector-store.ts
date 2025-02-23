import { OllamaEmbeddings } from "@langchain/ollama";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

type Args = {
  host: string,
  model?: string,
}

const DEFAULT_EMBED_MODEL = 'mxbai-embed-large-8k';

export default function makeGetVectorStore({ host, model }: Args) {
  const embeddings = new OllamaEmbeddings({
    baseUrl: host,
    model: model ?? DEFAULT_EMBED_MODEL,
  });
  const vectorStore = new MemoryVectorStore(embeddings);
  
  // XXX Hardening the vectorStore renders it inoperational, so we wrap it in
  // an arrow function which returns a soft vectorStore even after hardening.
  const getVectorStore = () => vectorStore;
  
  return getVectorStore;
}
