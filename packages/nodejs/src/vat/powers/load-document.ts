
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export type Args = {
  useTmpDir?: boolean,
  root: string,
} | {
  useTmpDir: true,
  root?: never,
}

/**
 * Makes a view which loads .txt documents from the root
 * 
 * @param args - The arguments
 * @param args.root - The base filepath to load documents from.
 * @param args.useTmpDir - Whether to .
 * @returns A method for loading a document by name. 
 */
export default function makeLoadDocument({ root, useTmpDir }: Args) {
  if (root === undefined && useTmpDir === undefined) {
    throw new Error('Bad arguments', { cause: { root, useTmpDir } });
  }
  let base = useTmpDir ? tmpdir() : undefined;
  if (root) {
    base = base ? join(base, root) : root;
  }
  // XXX name might exit 'base' via '..'s or symlinks
  const resolve = (name: string) => `${base}/${name}.txt`;

  const loadDocument = async (name: string, secrecy: string) => {
    const source = resolve(name);
    const pageContent = await readFile(source, "utf8");
    if (!pageContent) {
      throw new Error(`Could not find document ${name}`);
    }
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 384,
      chunkOverlap: 64,
    });
    const splitDocs = await splitter.splitDocuments([{
      pageContent,
      // XXX secrecy should be handled in a separate routine
      metadata: { source: name, secrecy },
    }]);
    return splitDocs.map((document) => ({
      pageContent: document.pageContent,
      metadata: { ...document.metadata },
    }));
  }

  return loadDocument;
}
