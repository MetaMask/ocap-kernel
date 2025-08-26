import fs from 'fs/promises';
import { resolve } from 'path';

import { makeFsSpecification } from './shared.ts';
import type { PathLike } from './types.ts';

export const { configStruct, capabilityFactory } = makeFsSpecification({
  resolvePath: async (path: PathLike) => resolve(path.toString()),
  makeReadFile: () => fs.readFile,
  makeWriteFile: () => fs.writeFile,
  makeReaddir: () => fs.readdir,
});
