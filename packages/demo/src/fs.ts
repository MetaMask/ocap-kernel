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
 * @param root - The root directory of the demo.
 * @returns An object with the following properties:
 * - `resolve`: A function that resolves a path relative to the demo root.
 * - `readFile`: A function that reads a file from the demo root.
 * - `readJson`: A function that reads a json file from the demo root.
 */
export default function makeDemoFs(root: string): DemoFs {
  const resolve = (...args: string[]): string => path.resolve(root, ...args);
  const readFile = async (filename: string): Promise<string> =>
    fs.readFile(resolve(filename), 'utf8');
  const readJson = async (filename: string): Promise<unknown> =>
    readFile(filename).then(JSON.parse);

  return { resolve, readFile, readJson };
}
