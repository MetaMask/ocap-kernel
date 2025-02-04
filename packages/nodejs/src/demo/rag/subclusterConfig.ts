
import { TextLoader } from "langchain/document_loaders/fs/text";
import type { ClusterConfig } from "@ocap/kernel";
import { readFile } from "fs/promises";
import { join } from "path";
import type { Document } from '@langchain/core/documents';
import type { Json } from "@metamask/utils";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

type ModelSize = '1.5b' | '7b' | '8b' | '14b' | '32b' | '70b' | '671b';
type Model = `deepseek-r1:${ModelSize}`;

const makeBundleSpec = (name: string) => `http://localhost:3000/${name}.bundle`;

// XXX Todo: RAG in a separate vat, with introduction at bootstrap time. 
const getWikiContent = async (path: string) => {
  const resolvedPath = new URL(join('wiki', path), import.meta.url).pathname.replace(/\/dist\//, '/src/');
  const loader = new TextLoader(resolvedPath);
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 384,
    chunkOverlap: 64,
  });
  const splitDocs = await splitter.splitDocuments(await loader.load());
  console.log('\n----------');
  console.log('SPLIT DOCS');
  console.log('path:', path);
  console.log(JSON.stringify(splitDocs, null, 2));
  console.log('----------\n');
  return splitDocs.map((document) => ({
    pageContent: document.pageContent,
    metadata: { source: path },
  }));
}

export const makeConfig = async (
  model: Model,
  verbose: boolean = false,
): Promise<ClusterConfig> => ({
  bootstrap: 'user',
  vats: {
    // The LLM vat with the special ollama vat power. 
    ollama: {
      bundleSpec: makeBundleSpec('ollama'),
      parameters: { model, verbose },
    },
    // A mock wikipedia API which returns the content of a few wikipedia pages.
    wiki: {
      bundleSpec: makeBundleSpec('wiki'),
      parameters: {
        model: 'mxbai-embed-large'
      },
    },
    // The bootstrap vat representing a user action.
    user: {
      bundleSpec: makeBundleSpec('user'),
      parameters: {
        prompt: [
          'Describe the "confused deputy problem".',
          'Then, define "object capability model" (OCAP).',
          'Finally, explain how OCAP solves the confused deputy problem.',
        ].join(' '),
        verbose,
        docs: [
          ...await getWikiContent('ambient-authority.txt'),
          ...await getWikiContent('confused-deputy-problem.txt'),
        ],
      },
    },
  },
});
