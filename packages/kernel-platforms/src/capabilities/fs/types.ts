import { exactOptional, object, string, boolean } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import type { PathLike } from 'fs';
import type { readFile, writeFile, readdir } from 'fs/promises';

export type { PathLike };

// Throws if the path argument violates expectations.
export type PathCaveat = (path: PathLike) => Promise<void>;
// As above, but expects a resolved path.
export type ResolvedPathCaveat = (resolvedPath: string) => Promise<void>;

export type ReadFile = typeof readFile;
export type WriteFile = typeof writeFile;
export type Readdir = typeof readdir;

export type ResolvePath = (path: PathLike) => Promise<string>;

export const fsConfigStruct = object({
  rootDir: string(),
  readFile: exactOptional(boolean()),
  writeFile: exactOptional(boolean()),
  readdir: exactOptional(boolean()),
});

export type FsCapability = Partial<{
  readFile: ReadFile;
  writeFile: WriteFile;
  readdir: Readdir;
}>;

export type FsConfig = Infer<typeof fsConfigStruct>;
