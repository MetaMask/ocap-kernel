import { makePromiseKit } from '@endo/promise-kit';
import { watch } from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { unlink } from 'fs/promises';
import { resolve } from 'path';

import { createBundleFile } from './bundle.js';
import { resolveBundlePath } from '../path.js';

type CloseWatcher = () => Promise<void>;

type WatchDirReturn = {
  ready: Promise<CloseWatcher>;
  error: Promise<never>;
};

export const makeWatchEvents = (
  watcher: FSWatcher,
  readyResolve: ReturnType<typeof makePromiseKit<CloseWatcher>>['resolve'],
  throwError: ReturnType<typeof makePromiseKit<never>>['reject'],
): {
  ready: () => void;
  add: (path: string) => void;
  change: (path: string) => void;
  unlink: (path: string) => void;
  error: (error: Error) => void;
} => ({
  ready: () => readyResolve(watcher.close.bind(watcher)),
  add: (path) => {
    console.info(`Source file added:`, path);
    createBundleFile(path, resolveBundlePath(path)).catch(throwError);
  },
  change: (path) => {
    console.info(`Source file changed:`, path);
    createBundleFile(path, resolveBundlePath(path)).catch(throwError);
  },
  unlink: (path) => {
    console.info('Source file removed:', path);
    const bundlePath = resolveBundlePath(path);
    unlink(bundlePath)
      .then(() => console.info(`removed ${bundlePath}`))
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

/**
 * Start a watcher that bundles `.js` files in the target dir.
 *
 * @param dir - The directory to watch.
 * @returns A {@link WatchDirReturn} object with `ready` and `error` properties which are promises.
 *  The `ready` promise resolves to an awaitable method to close the watcher.
 *  The `error` promise never resolves, but rejects when any of the watcher's behaviors encounters an irrecoverable error.
 */
export function watchDir(dir: string): WatchDirReturn {
  const resolvedDir = resolve(dir);

  const { resolve: readyResolve, promise: readyPromise } =
    makePromiseKit<CloseWatcher>();

  const { reject: throwError, promise: errorPromise } = makePromiseKit<never>();

  let watcher = watch(resolvedDir, {
    ignoreInitial: true,
    ignored: [
      '**/node_modules/**',
      '**/*.test.js',
      '**/*.test.ts',
      '**/*.bundle',
      (file, stats) => (stats?.isFile() ?? false) && !file.endsWith('.js'),
    ],
  });

  const events = makeWatchEvents(watcher, readyResolve, throwError);

  for (const key of Object.keys(events)) {
    watcher = watcher.on(key, events[key as keyof typeof events]);
  }

  return {
    ready: readyPromise,
    error: errorPromise,
  };
}
