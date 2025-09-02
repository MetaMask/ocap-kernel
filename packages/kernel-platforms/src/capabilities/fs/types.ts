import { exactOptional, object, string, boolean } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import type { PathLike, existsSync } from 'fs';
import type { readFile, access } from 'fs/promises';

export type { PathLike };

// Throws if the path argument violates expectations (async version).
export type PathCaveat = (path: PathLike) => Promise<void>;
// Throws if the path argument violates expectations (sync version).
export type SyncPathCaveat = (path: PathLike) => void;

export type ReadFile = typeof readFile;
export type Access = typeof access;
export type ExistsSync = typeof existsSync;

export const fsConfigStruct = object({
  rootDir: string(),
  existsSync: exactOptional(boolean()),
  promises: exactOptional(
    object({
      readFile: exactOptional(boolean()),
      access: exactOptional(boolean()),
    }),
  ),
});

export type FsCapability = Partial<{
  existsSync: ExistsSync;
  promises: Partial<{
    readFile: ReadFile;
    access: Access;
  }>;
}>;

export type FsConfig = Infer<typeof fsConfigStruct>;
