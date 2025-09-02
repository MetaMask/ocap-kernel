import type {
  PathLike,
  SyncPathCaveat,
  ReadFile,
  Access,
  ExistsSync,
  FsConfig,
  FsCapability,
} from './types.ts';
import { fsConfigStruct } from './types.ts';
import { makeCapabilitySpecification } from '../../specification.ts';

/**
 * Cross-platform FS operation wrapper with validation (async version)
 *
 * @param operation - The underlying operation to wrap
 * @param syncPathCaveat - The caveat to apply to path arguments
 * @returns The operation restricted by the provided caveat
 */
export const makeCaveatedFsOperation = <
  Operation extends (...args: never[]) => Promise<unknown>,
>(
  operation: Operation,
  syncPathCaveat: SyncPathCaveat,
): Operation => {
  return harden(async (...args: Parameters<Operation>) => {
    try {
      // Assuming first argument is always the path
      syncPathCaveat(args[0] as unknown as PathLike);
      // We don't need async caveats yet, but we could await one here.
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Caveat failed';
      throw new Error(`fs.${operation.name}: ${message}`, { cause });
    }
    return operation(...args);
  }) as Operation;
};

/**
 * Cross-platform synchronous FS operation wrapper with validation
 *
 * @param operation - The underlying synchronous operation to wrap
 * @param syncPathCaveat - The caveat to apply to path arguments
 * @returns The operation restricted by the provided caveat
 */
export const makeCaveatedSyncFsOperation = <
  Operation extends (...args: never[]) => unknown,
>(
  operation: Operation,
  syncPathCaveat: SyncPathCaveat,
): Operation => {
  return harden((...args: Parameters<Operation>) => {
    try {
      // Assuming first argument is always the path
      syncPathCaveat(args[0] as unknown as PathLike);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Caveat failed';
      throw new Error(`fs.${operation.name}: ${message}`, { cause });
    }
    return operation(...args);
  }) as Operation;
};

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * Cross-platform FS capability specification factory
 *
 * @param config - The configuration for the capability specification
 * @param config.makeExistsSync - The factory returning an existsSync operation
 * @param config.promises - Object containing promise-based operation factories
 * @param config.promises.makeReadFile - The factory returning a read file operation
 * @param config.promises.makeAccess - The factory returning an access operation
 * @param config.makePathCaveat - Factory function to create path caveats
 * @returns The capability specification
 */
export const makeFsSpecification = ({
  makeExistsSync,
  promises,
  makePathCaveat,
}: {
  makeExistsSync: () => ExistsSync;
  promises: {
    makeReadFile: () => ReadFile;
    makeAccess: () => Access;
  };
  makePathCaveat: (rootDir: string) => SyncPathCaveat;
}) =>
  makeCapabilitySpecification(
    fsConfigStruct,
    (config: FsConfig): FsCapability => {
      // The construction of this capability left ad-hoc until additional
      // requirements dictate additional structure.
      const { rootDir, existsSync, promises: promisesConfig } = config;
      const caveat = makePathCaveat(rootDir);

      const toExport: FsCapability = {};

      if (existsSync) {
        toExport.existsSync = makeCaveatedSyncFsOperation(
          // eslint-disable-next-line n/no-sync
          makeExistsSync(),
          caveat,
        );
      }

      if (promisesConfig) {
        const promisesObj: FsCapability['promises'] = {};

        if (promisesConfig.readFile) {
          promisesObj.readFile = makeCaveatedFsOperation(
            promises.makeReadFile(),
            caveat,
          );
        }

        if (promisesConfig.access) {
          promisesObj.access = makeCaveatedFsOperation(
            promises.makeAccess(),
            caveat,
          );
        }

        toExport.promises = harden(promisesObj);
      }

      return harden(toExport);
    },
  );
/* eslint-enable @typescript-eslint/explicit-function-return-type */
