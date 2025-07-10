import fs from './hooks/fs.ts';
import path from './hooks/path.ts';
import type { ImportHook, ModuleRecord } from './types.ts';

const holes = {
  fs,
  'node:fs': fs,
  path,
  'node:path': path,
} as Record<string, ModuleRecord>;

export const importHook: ImportHook = (specifier: string) => holes[specifier];
