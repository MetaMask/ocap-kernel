import type { Logger } from '@metamask/logger';
import { readFile, rm } from 'fs/promises';
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

  const { testBundleRoot, getTestBundleSpecs, globBundles, resolveBundlePath } =
    await makeTestBundleStage();
  const testBundleSpecs = getTestBundleSpecs(validTestBundleNames);

  const deleteTestBundles = async (): Promise<void[]> =>
    Promise.all(
      (await globBundles()).map(async (bundle) => rm(bundle, { force: true })),
    );

  afterAll(deleteTestBundles);

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

    it('calls logger.error if bundling fails', async () => {
      const loggerErrorSpy = vi.spyOn(logger, 'error');
      const badBundle = resolveBundlePath('bad-vat.fails');
      await bundleFile(badBundle, { logger });
      expect(loggerErrorSpy).toHaveBeenCalledOnce();
    });
  });

  describe('bundleDir', () => {
    it('bundles a directory', async () => {
      expect(await globBundles()).toStrictEqual([]);

      // mocked bundleSource fails iff the target filename has '.fails.'
      mocks.endoBundleSource.mockImplementation((bundlePath) => {
        if (bundlePath.includes('.fails.')) {
          throw new Error(`Failed to bundle ${bundlePath}`);
        }
        return 'test content';
      });

      await bundleDir(testBundleRoot, { logger });

      const bundledOutputs = (await globBundles()).map((bundlePath) =>
        basename(bundlePath, '.bundle'),
      );

      expect(bundledOutputs.length).toBeGreaterThan(0);

      expect(bundledOutputs).toStrictEqual(validTestBundleNames);
    });
  });

  describe('bundleSource', () => {
    it('calls logger.error if bundling fails', async () => {
      mocks.isDirectory.mockImplementationOnce(() => {
        throw new Error('test error');
      });
      const loggerErrorSpy = vi.spyOn(logger, 'error');
      await bundleSource(resolveBundlePath('test'), logger);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('error bundling target'),
        expect.any(Error),
      );
    });
  });
});
