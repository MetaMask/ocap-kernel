import '@ocap/shims/endoify';

import { Logger } from '@ocap/logger';
import { watch } from 'chokidar';
import type { FSWatcher } from 'chokidar';
import type { Stats } from 'fs';
import { unlink } from 'fs/promises';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { bundleFile } from './bundle.ts';
import { watchDir, makeWatchEvents, shouldIgnore } from './watch.ts';

vi.mock('fs/promises', () => ({
  unlink: vi.fn(async () => new Promise<void>(() => undefined)),
}));

vi.mock('../path.ts', () => ({
  resolveBundlePath: vi.fn((path) => `resolved:${path}`),
}));

vi.mock('./bundle.ts', () => ({
  bundleFile: vi.fn(async () => new Promise<void>(() => undefined)),
}));

vi.mock('chokidar', () => ({
  watch: () => {
    const watcher = {
      on: () => watcher,
      close: async (): Promise<void> => undefined,
    } as unknown as FSWatcher;
    return watcher;
  },
}));

const logger = new Logger('test');

describe('watchDir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an object with ready and error propertes', () => {
    const watcher = watchDir('.', logger);
    expect(watcher).toHaveProperty('ready');
    expect(watcher).toHaveProperty('error');
  });
});

describe('shouldIgnore', () => {
  const missingStats = undefined as unknown as Stats;
  const fileStats = { isFile: () => true } as unknown as Stats;
  const nonFileStats = { isFile: () => false } as unknown as Stats;

  it.each`
    description                     | file                      | stats           | expectation
    ${'a file with missing stats'}  | ${'test.js'}              | ${missingStats} | ${false}
    ${'a non-file'}                 | ${'test.js'}              | ${nonFileStats} | ${false}
    ${'a .js file'}                 | ${'test.js'}              | ${fileStats}    | ${false}
    ${'a .ts file'}                 | ${'test.ts'}              | ${fileStats}    | ${true}
    ${'a .bundle file'}             | ${'test.bundle'}          | ${fileStats}    | ${true}
    ${'a .txt file'}                | ${'test.txt'}             | ${fileStats}    | ${true}
    ${'a .js file in node_modules'} | ${'node_modules/test.js'} | ${fileStats}    | ${true}
  `('returns $expectation for $description', ({ file, expectation, stats }) => {
    expect(shouldIgnore(file, stats)).toBe(expectation);
  });
});

describe('makeWatchEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each`
    event
    ${'ready'}
    ${'add'}
    ${'change'}
    ${'unlink'}
    ${'error'}
  `('returns an object with the expected property: $event', ({ event }) => {
    const events = makeWatchEvents(watch('.'), vi.fn(), vi.fn(), logger);
    expect(events).toHaveProperty(event);
  });

  describe('ready', () => {
    it('calls the provided promise resolver', () => {
      const readyResolve = vi.fn();
      const events = makeWatchEvents(watch('.'), readyResolve, vi.fn(), logger);
      events.ready();
      expect(readyResolve).toHaveBeenCalledOnce();
    });
  });

  describe.each`
    event
    ${'add'}
    ${'change'}
  `('$event', ({ event }: { event: 'add' | 'change' }) => {
    it('calls createBundleFile', () => {
      const events = makeWatchEvents(watch('.'), vi.fn(), vi.fn(), logger);
      const testPath = 'test-path';
      events[event](testPath);
      expect(bundleFile).toHaveBeenCalledOnce();
      expect(bundleFile).toHaveBeenLastCalledWith(testPath, {
        logger,
        targetPath: `resolved:${testPath}`,
      });
    });
  });

  describe('unlink', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('calls unlink', () => {
      const events = makeWatchEvents(watch('.'), vi.fn(), vi.fn(), logger);
      const testPath = 'test-path';
      events.unlink(testPath);
      expect(unlink).toHaveBeenCalledOnce();
      expect(unlink).toHaveBeenLastCalledWith(`resolved:${testPath}`);
    });

    it('calls logger.info on success', async () => {
      const promise = Promise.resolve();
      vi.mocked(unlink).mockReturnValue(promise);

      const events = makeWatchEvents(watch('.'), vi.fn(), vi.fn(), logger);
      const testPath = 'test-path';
      const infoSpy = vi.spyOn(logger, 'info');

      events.unlink(testPath);

      // wait for next crank turn
      await Promise.resolve();

      expect(infoSpy).toHaveBeenCalledTimes(2);
      expect(infoSpy).toHaveBeenNthCalledWith(
        1,
        'Source file removed:',
        testPath,
      );
      expect(infoSpy).toHaveBeenNthCalledWith(
        2,
        `removed resolved:${testPath}`,
      );
    });

    it('ignores ENOENT errors', async () => {
      vi.mocked(unlink).mockRejectedValue(new Error('ENOENT'));

      const throwError = vi.fn();
      const events = makeWatchEvents(watch('.'), vi.fn(), throwError, logger);
      const testPath = 'test-path';

      events.unlink(testPath);

      // wait for next crank turn
      await Promise.resolve();

      expect(throwError).not.toHaveBeenCalled();
    });

    it('throws if unlink fails', async () => {
      const error = new Error('unlink failed');
      vi.mocked(unlink).mockRejectedValue(error);

      const throwError = vi.fn();
      const events = makeWatchEvents(watch('.'), vi.fn(), throwError, logger);
      const testPath = 'test-path';

      events.unlink(testPath);

      // wait two crank turns
      await Promise.resolve();
      await Promise.resolve();

      expect(throwError).toHaveBeenCalledOnce();
      expect(throwError).toHaveBeenLastCalledWith(error);
    });
  });

  describe('error', () => {
    it('calls throwError', () => {
      const throwError = vi.fn();
      const events = makeWatchEvents(watch('.'), vi.fn(), throwError, logger);
      const testError = new Error('test');

      events.error(testError);

      expect(throwError).toHaveBeenCalledOnce();
      expect(throwError).toHaveBeenLastCalledWith(testError);
    });
  });
});
