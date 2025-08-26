import type {
  PathLike,
  PathCaveat,
  ResolvedPathCaveat,
  ResolvePath,
  ReadFile,
  WriteFile,
  Readdir,
  FsConfig,
  FsCapability,
} from './types.ts';
import { fsConfigStruct } from './types.ts';
import { makeCapabilitySpecification } from '../../specification.ts';

/**
 * Cross-platform path caveat factory
 *
 * @param resolvePath - The path resolver
 * @returns A caveat that prohibits symlinks
 */
export const makeNoSymlinksCaveat = (resolvePath: ResolvePath): PathCaveat => {
  return async (path: PathLike): Promise<void> => {
    const resolved = await resolvePath(path);
    if (resolved !== String(path)) {
      throw new Error(`Symlinks are prohibited: ${String(path)}`);
    }
  };
};

/**
 * Cross-platform root directory caveat factory
 *
 * @param rootDir - The root directory
 * @param resolvePath - The path resolver
 *
 * @returns A caveat that restricts the path to the provided root directory
 */
export const makeRootCaveat = (
  rootDir: string,
  resolvePath: ResolvePath,
): ResolvedPathCaveat => {
  return async (path: PathLike): Promise<void> => {
    // To remain simple and inefficient until otherwise necessary
    const resolvedPath = await resolvePath(path);
    const resolvedRoot = await resolvePath(rootDir);
    if (!resolvedPath.startsWith(resolvedRoot)) {
      throw new Error(
        `Path ${resolvedPath} is outside allowed root ${rootDir}`,
      );
    }
  };
};

/**
 * Cross-platform combined path caveat factory
 *
 * @param rootDir - The root directory
 * @param resolvePath - The path resolver
 * @returns A caveat that restricts the path to the provided root directory
 */
export const makePathCaveat = (
  rootDir: string,
  resolvePath: ResolvePath,
): PathCaveat => {
  const noSymlinks = makeNoSymlinksCaveat(resolvePath);
  const withinRoot = makeRootCaveat(rootDir, resolvePath);

  return harden(async (path: PathLike) => {
    await noSymlinks(path);
    const resolved = await resolvePath(path);
    await withinRoot(resolved);
  });
};

/**
 * Cross-platform FS operation wrapper with validation
 *
 * @param operation - The underlying operation to wrap
 * @param pathCaveat - The caveat to apply to path arguments
 * @returns The operation restricted by the provided caveat
 */
export const makeCaveatedFsOperation = <
  Operation extends (...args: never[]) => unknown,
>(
  operation: Operation,
  pathCaveat: PathCaveat,
): Operation => {
  return harden(async (...args: Parameters<Operation>) => {
    // Assuming first argument is always the path
    await pathCaveat(args[0] as unknown as PathLike);
    return operation(...args);
  }) as Operation;
};

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * Cross-platform FS capability specification factory
 *
 * @param config - The configuration for the capability specification
 * @param config.resolvePath - A function to use to resolve paths
 * @param config.makeReadFile - The factory returning a read file operation
 * @param config.makeWriteFile - The factory returning a write file operation
 * @param config.makeReaddir - The factory returning a readdir operation
 * @returns The capability specification
 */
export const makeFsSpecification = ({
  resolvePath,
  makeReadFile,
  makeWriteFile,
  makeReaddir,
}: {
  resolvePath: ResolvePath;
  makeReadFile: () => ReadFile;
  makeWriteFile: () => WriteFile;
  makeReaddir: () => Readdir;
}) =>
  makeCapabilitySpecification(
    fsConfigStruct,
    (config: FsConfig): FsCapability => {
      // The construction of this capability left ad-hoc until additional
      // requirements dictate additional structure.
      const { rootDir, readFile, writeFile, readdir } = config;
      const caveat = makePathCaveat(rootDir, resolvePath);

      const toExport: FsCapability = {};
      if (readFile) {
        toExport.readFile = makeCaveatedFsOperation(makeReadFile(), caveat);
      }
      if (writeFile) {
        toExport.writeFile = makeCaveatedFsOperation(makeWriteFile(), caveat);
      }
      if (readdir) {
        toExport.readdir = makeCaveatedFsOperation(makeReaddir(), caveat);
      }
      return harden(toExport);
    },
  );
/* eslint-enable @typescript-eslint/explicit-function-return-type */
