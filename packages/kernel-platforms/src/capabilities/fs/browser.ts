import { makeFsSpecification } from './shared.ts';
import type { PathLike } from './types.ts';

const notImplemented = (name: string): never => {
  throw new Error(`Capability ${name} is not implemented in the browser`);
};

export const { configStruct, capabilityFactory } = makeFsSpecification({
  resolvePath: async (path: PathLike) => path.toString(),
  makeReadFile: () => notImplemented('readFile'),
  makeWriteFile: () => notImplemented('writeFile'),
  makeReaddir: () => notImplemented('readdir'),
});
