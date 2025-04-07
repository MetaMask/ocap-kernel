import { readFile, rm } from 'fs/promises';
import { basename } from 'path';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

import { createBundleFile, createBundleDir } from './bundle.ts';
import {
  makeTestBundleStage,
  validTestBundleNames,
} from '../../test/bundles.ts';
import { fileExists } from '../file.ts';

const mocks = vi.hoisted(() => ({
  bundleSource: vi.fn(),
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@endo/bundle-source', () => ({
  default: mocks.bundleSource,
}));

vi.mock('@endo/init', () => ({}));

vi.mock('../logger.ts', () => ({
  logger: mocks.logger,
}));

describe('bundle', async () => {
  const { testBundleRoot, getTestBundleSpecs, globBundles, resolveBundlePath } =
    await makeTestBundleStage();
  const testBundleSpecs = getTestBundleSpecs(validTestBundleNames);

  const deleteTestBundles = async (): Promise<void[]> =>
    Promise.all(
      (await globBundles()).map(async (bundle) => rm(bundle, { force: true })),
    );

  afterAll(deleteTestBundles);

  beforeEach(async () => {
    vi.resetModules();
    await deleteTestBundles();
    vi.resetAllMocks();
  });

  describe('createBundleFile', () => {
    it.each(testBundleSpecs)(
      'bundles a single file: $name',
      async ({ source, bundle }) => {
        expect(await fileExists(bundle)).toBe(false);

        const testContent = { source: 'test-content' };
        mocks.bundleSource.mockImplementationOnce(() => testContent);

        await createBundleFile(source);

        expect(await fileExists(bundle)).toBe(true);

        const bundleContent = JSON.parse(
          await readFile(bundle, { encoding: 'utf8' }),
        );

        expect(bundleContent).toStrictEqual(testContent);
      },
    );

    it('calls logger.error if bundling fails', async () => {
      const badBundle = resolveBundlePath('bad-vat.fails');
      await createBundleFile(badBundle);
      expect(mocks.logger.error).toHaveBeenCalledOnce();
    });
  });

  describe('createBundleDir', () => {
    it('bundles a directory', async () => {
      expect(await globBundles()).toStrictEqual([]);

      // mocked bundleSource fails iff the target filename has '.fails.'
      mocks.bundleSource.mockImplementation((bundlePath) => {
        if (bundlePath.includes('.fails.')) {
          throw new Error(`Failed to bundle ${bundlePath}`);
        }
        return 'test content';
      });

      await createBundleDir(testBundleRoot);

      const bundledOutputs = (await globBundles()).map((bundlePath) =>
        basename(bundlePath, '.bundle'),
      );

      expect(bundledOutputs.length).toBeGreaterThan(0);

      expect(bundledOutputs).toStrictEqual(validTestBundleNames);
    });
  });
});
