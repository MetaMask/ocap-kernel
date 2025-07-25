import fs from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { ollamaRootMacOS } from '../constants.ts';
import type { ModuleRecord } from '../types.ts';

export const ollamaRoot = resolve(ollamaRootMacOS);

// **ATTN**: Beware symlinks!
export const makeSubdirCaveat =
  (parent: string) =>
  (path: string): string => {
    const vector = relative(parent, path);
    const isSubdir =
      Boolean(vector) && !vector.startsWith('..') && !isAbsolute(vector);
    if (!isSubdir) {
      throw new Error(`No such file or directory: ${path}`);
    }
    return path;
  };

const withinOllamaRootDir = makeSubdirCaveat(ollamaRoot);

// To remain hardcoded until we converge on an endowment specification format.
export default {
  imports: [],
  exports: ['readFile', 'writeFile', 'promises', 'default'],
  execute: (moduleExports: Record<string, unknown>) => {
    moduleExports.promises = {
      readFile: async (path: string) =>
        fs.promises?.readFile(withinOllamaRootDir(path)),
      writeFile: async (path: string, data: string) =>
        fs.promises?.writeFile(withinOllamaRootDir(path), data),
      access: async (path: string) =>
        fs.promises?.access(withinOllamaRootDir(path)),
    };
    moduleExports.default = { existsSync: (_path: string) => false };
  },
} as ModuleRecord;
