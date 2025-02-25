import makeLoadDocument from "./load-document";
import makeGetOllama from "./ollama";
import makeGetVectorStore from "./vector-store";

import type { Args as LoadDocumentArgs } from "./load-document.js";

type Args = {
  loadDocument?: LoadDocumentArgs,
  ollama?: {
    host: string,
  },
  vectorStore?: {
    host: string,
    model: string,
  },
}

/**
 * Make the powers for a vat.
 * 
 * @param param0 - The args.
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
  } as Record<string, unknown>;

  if (loadDocument) {
    powers = {
      ...powers,
      loadDocument: makeLoadDocument(loadDocument),
    }
  }
  if (ollama) {
    powers = {
      ...powers,
      ollama: await makeGetOllama(ollama),
    }
  }
  if (vectorStore) {
    powers = {
      ...powers,
      getVectorStore: makeGetVectorStore(vectorStore),
    }
  }

  return powers;
}