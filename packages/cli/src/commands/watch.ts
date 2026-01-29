import { makePromiseKit } from '@endo/promise-kit';
import type { PromiseKit } from '@endo/promise-kit';
import { Logger } from '@metamask/logger';
import { watch } from 'chokidar';
import type { FSWatcher, MatchFunction } from 'chokidar';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

import { bundleFile as rawBundleFile } from './bundle.ts';
import { resolveBundlePath } from '../path.ts';

type CloseWatcher = () => Promise<void>;

type WatchDirReturn = {
  ready: Promise<CloseWatcher>;
  error: Promise<never>;
};

export const makeWatchEvents = (
  watcher: FSWatcher,
  readyResolve: PromiseKit<CloseWatcher>['resolve'],
  throwError: PromiseKit<never>['reject'],
  logger: Logger,
): {
  ready: () => void;
  add: (path: string) => void;
  change: (path: string) => void;
  unlink: (path: string) => void;
  error: (error: Error) => void;
} => {
  const bundleFile = (path: string): void => {
    rawBundleFile(path, { logger, targetPath: resolveBundlePath(path) }).catch(
      (error) => logger.error(`Failed to bundle file:`, error),
    );
  };

  return {
    ready: () => readyResolve(watcher.close.bind(watcher)),
    add: (path) => {
      logger.info(`Source file added:`, path);
      bundleFile(path);
    },
    change: (path) => {
      logger.info(`Source file changed:`, path);
      bundleFile(path);
    },
    unlink: (path) => {
      logger.info('Source file removed:', path);
      const bundlePath = resolveBundlePath(path);
      unlink(bundlePath)
        .then(() => logger.info(`Removed:`, bundlePath))
        .catch((reason: unknown) => {
          if (reason instanceof Error && reason.message.match(/ENOENT/u)) {
            // If associated bundle does not exist, do nothing.
            return;
          }
          throwError(reason);
        });
    },
    error: (error: Error) => throwError(error),
  };
};

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
