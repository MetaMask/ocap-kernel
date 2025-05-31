import fs from 'node:fs/promises';
import path from 'node:path';

export type DemoFs = {
  resolve: (...args: string[]) => string;
  readFile: (filename: string) => Promise<string>;
  readJson: (filename: string) => Promise<unknown>;
};

/**
 * Creates a set of utilities for reading files from the demo root.
 *
 * @param meta - The import meta object.
 * @returns An object with the following properties:
 * - `resolve`: A function that resolves a path relative to the demo root.
 * - `readFile`: A function that reads a file from the demo root.
 * - `readJson`: A function that reads a json file from the demo root.
 */
export default function makeDemoFs(meta: ImportMeta): DemoFs {
  const root = path.resolve(meta.dirname.replace('/dist/', '/src/'));
  const resolve = (...args: string[]): string => path.resolve(root, ...args);
  const readFile = async (filename: string): Promise<string> =>
    fs.readFile(resolve(filename), 'utf8');
  return {
    resolve,
    readFile,
    readJson: async (filename: string) => readFile(filename).then(JSON.parse),
  };
}
