import { makePromiseKit } from '@endo/promise-kit';
import { Logger } from '@ocap/logger';
import { watch } from 'chokidar';
import type { FSWatcher, MatchFunction } from 'chokidar';
import { unlink } from 'fs/promises';
import { resolve } from 'path';

import { bundleFile } from './bundle.ts';
import { resolveBundlePath } from '../path.ts';

type CloseWatcher = () => Promise<void>;

type WatchDirReturn = {
  ready: Promise<CloseWatcher>;
  error: Promise<never>;
};

export const makeWatchEvents = (
  watcher: FSWatcher,
  readyResolve: ReturnType<typeof makePromiseKit<CloseWatcher>>['resolve'],
  throwError: ReturnType<typeof makePromiseKit<never>>['reject'],
  logger: Logger,
): {
  ready: () => void;
  add: (path: string) => void;
  change: (path: string) => void;
  unlink: (path: string) => void;
  error: (error: Error) => void;
} => ({
  ready: () => readyResolve(watcher.close.bind(watcher)),
  add: (path) => {
    logger.info(`Source file added:`, path);
    bundleFile(path, { logger, targetPath: resolveBundlePath(path) }).catch(
      throwError,
    );
  },
  change: (path) => {
    logger.info(`Source file changed:`, path);
    bundleFile(path, { logger, targetPath: resolveBundlePath(path) }).catch(
      throwError,
    );
  },
  unlink: (path) => {
    logger.info('Source file removed:', path);
    const bundlePath = resolveBundlePath(path);
    unlink(bundlePath)
      .then(() => logger.info(`removed ${bundlePath}`))
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.message.match(/ENOENT/u)) {
          // If associated bundle does not exist, do nothing.
          return;
        }
        throwError(reason);
      });
  },
  error: (error: Error) => throwError(error),
});

export const shouldIgnore: MatchFunction = (file, stats): boolean =>
  // Ignore files and directories in `node_modules`.
  file.includes('node_modules') ||
  // Watch non-files, but ignore files that are not JavaScript.
  ((stats?.isFile() ?? false) && !file.endsWith('.js'));

/**
 * Start a watcher that bundles `.js` files in the target dir.
 *
 * @param dir - The directory to watch.
 * @param logger - The logger to use.
 * @returns A {@link WatchDirReturn} object with `ready` and `error` properties which are promises.
 *  The `ready` promise resolves to an awaitable method to close the watcher.
 *  The `error` promise never resolves, but rejects when any of the watcher's behaviors encounters an irrecoverable error.
 */
export function watchDir(dir: string, logger: Logger): WatchDirReturn {
  const resolvedDir = resolve(dir);

  const { resolve: readyResolve, promise: readyPromise } =
    makePromiseKit<CloseWatcher>();

  const { reject: throwError, promise: errorPromise } = makePromiseKit<never>();

  let watcher = watch(resolvedDir, {
    ignoreInitial: false,
    ignored: shouldIgnore,
  });

  const events = makeWatchEvents(watcher, readyResolve, throwError, logger);

  for (const key of Object.keys(events)) {
    watcher = watcher.on(key, events[key as keyof typeof events] as never);
  }

  return {
    ready: readyPromise,
    error: errorPromise,
  };
}
