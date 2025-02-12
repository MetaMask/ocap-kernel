import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { VatConfig } from '@ocap/kernel';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { join } from 'path';

type ModelSize = '1.5b' | '7b' | '8b' | '14b' | '32b' | '70b' | '671b';
type Model = `deepseek-r1:${ModelSize}${string}`;

const makeBundleSpec = (name: string) => `http://localhost:3000/${name}.bundle`;

const getWikiContent = async ({
  path,
  secrecy,
}: {
  path: string;
  secrecy: number;
}) => {
  const resolvedPath = new URL(
    join('wiki', path),
    import.meta.url,
  ).pathname.replace(/\/dist\//, '/src/');
  const loader = new TextLoader(resolvedPath);
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 384,
    chunkOverlap: 64,
  });
  const splitDocs = await splitter.splitDocuments(await loader.load());
  return splitDocs.map((document) => ({
    pageContent: document.pageContent,
    metadata: { secrecy, source: path },
  }));
};

type UserConfig = {
  model: Model;
  docs: { path: string; secrecy: number }[];
  trust: Record<string, number>;
  verbose?: boolean;
};

export const makeUserConfig = async (
  name: string,
  config: UserConfig,
): Promise<Record<string, VatConfig>> => {
  const { model, docs, trust } = config;
  const verbose = config.verbose ?? false;
  return {
    // The vat representing this user agent.
    [name]: {
      bundleSpec: makeBundleSpec('user'),
      parameters: {
        name,
        verbose,
        docs: (await Promise.all(docs.map(getWikiContent))).flat(),
        trust,
      },
    },

    // The LLM vat with the special ollama vat power.
    [`${name}.llm`]: {
      bundleSpec: makeBundleSpec('llm'),
      parameters: { model, verbose },
    },
    // A mock wikipedia API which returns the content of a few wikipedia pages.
    [`${name}.vectorStore`]: {
      bundleSpec: makeBundleSpec('vectorStore'),
      parameters: {
        model: 'mxbai-embed-large',
        verbose,
      },
    },
  };
};
