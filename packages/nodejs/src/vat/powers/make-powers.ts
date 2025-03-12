import makeLoadDocument from './load-document';
import type { Args as LoadDocumentArgs } from './load-document.js';
import makeGetOllama from './ollama';
import makeGetVectorStore from './vector-store';

type Args = {
  loadDocument?: LoadDocumentArgs;
  ollama?: {
    host: string;
  };
  vectorStore?: {
    host: string;
    model: string;
  };
};

/**
 * Make the powers for a vat.
 *
 * @param param0 - The args.
 * @param param0.loadDocument - The loadDocument power.
 * @param param0.ollama - The ollama power.
 * @param param0.vectorStore - The vectorStore power.
 * @returns A Powers object.
 */
export default async function makePowers({
  loadDocument,
  ollama,
  vectorStore,
}: Args): Promise<Record<string, unknown>> {
  let powers = {
    setInterval,
    clearInterval,
    getStdout: () => process.stdout,
  } as Record<string, unknown>;

  if (loadDocument) {
    powers = {
      ...powers,
      loadDocument: makeLoadDocument(loadDocument),
    };
  }
  if (ollama) {
    powers = {
      ...powers,
      ollama: await makeGetOllama(ollama),
    };
  }
  if (vectorStore) {
    powers = {
      ...powers,
      getVectorStore: makeGetVectorStore(vectorStore),
    };
  }

  return powers;
}
