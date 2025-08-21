import type { Logger } from '@metamask/logger';
import { readFile } from 'fs/promises';
import { basename } from 'path';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

import { bundleFile, bundleDir, bundleSource } from './bundle.ts';
import {
  makeTestBundleStage,
  validTestBundleNames,
} from '../../test/bundles.ts';
import { fileExists } from '../file.ts';

const mocks = vi.hoisted(() => {
  return {
    endoBundleSource: vi.fn(),
    Logger: vi.fn(
      () =>
        ({
          info: vi.fn(),
          error: vi.fn(),
          subLogger: vi.fn(),
        }) as unknown as Logger,
    ),
    isDirectory: vi.fn(),
  };
});

vi.mock('@endo/bundle-source', () => ({
  default: mocks.endoBundleSource,
}));

vi.mock('@endo/init', () => ({}));

vi.mock('@metamask/logger', () => ({
  Logger: mocks.Logger,
}));

vi.mock('../file.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  isDirectory: mocks.isDirectory,
}));

describe('bundle', async () => {
  let logger: Logger;

  const {
    cleanup,
    deleteTestBundles,
    getTestBundleSpecs,
    globBundles,
    resolveBundlePath,
    testBundleRoot,
  } = await makeTestBundleStage();
  const testBundleSpecs = getTestBundleSpecs(validTestBundleNames);

  afterAll(cleanup);

  beforeEach(async () => {
    await deleteTestBundles();
    vi.resetModules();
    logger = mocks.Logger();
    vi.resetAllMocks();
  });

  describe('bundleFile', () => {
    it.each(testBundleSpecs)(
      'bundles a single file: $name',
      async ({ source, bundle }) => {
        expect(await fileExists(bundle)).toBe(false);

        const testContent = { source: 'test-content' };
        mocks.endoBundleSource.mockImplementationOnce(() => testContent);

        await bundleFile(source, { logger });

        expect(await fileExists(bundle)).toBe(true);

        const bundleContent = JSON.parse(
          await readFile(bundle, { encoding: 'utf8' }),
        );

        expect(bundleContent).toStrictEqual(testContent);
      },
    );

    it('throws if bundling fails', async () => {
      mocks.endoBundleSource.mockImplementationOnce(() => {
        throw new Error('test error');
      });
      await expect(
        bundleFile(resolveBundlePath('test'), { logger }),
      ).rejects.toThrow('test error');
    });
  });

  describe('bundleDir', () => {
    it('bundles a directory', async () => {
      expect(await globBundles()).toStrictEqual([]);

      mocks.endoBundleSource.mockImplementation(() => {
        return 'test content';
      });

      await bundleDir(testBundleRoot, { logger });

      const bundledOutputs = (await globBundles()).map((bundlePath) =>
        basename(bundlePath, '.bundle'),
      );

      expect(bundledOutputs).toStrictEqual(validTestBundleNames);
    });

    it('throws if bundling fails', async () => {
      mocks.endoBundleSource.mockImplementationOnce(() => {
        throw new Error('test error');
      });
      await expect(
        bundleSource(resolveBundlePath('test'), logger),
      ).rejects.toThrow('test error');
    });
  });

  describe('bundleSource', () => {
    it('throws if bundling fails', async () => {
      mocks.isDirectory.mockImplementationOnce(() => {
        throw new Error('test error');
      });
      await expect(
        bundleSource(resolveBundlePath('test'), logger),
      ).rejects.toThrow('test error');
    });
  });
});
