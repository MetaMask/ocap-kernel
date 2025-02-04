import { readFile, rm } from 'fs/promises';
import { basename } from 'path';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

import { createBundleFile, createBundleDir } from './bundle.js';
import {
  makeTestBundleStage,
  validTestBundleNames,
} from '../../test/bundles.js';
import { fileExists } from '../file.js';

const mocks = vi.hoisted(() => ({
  bundleSource: vi.fn(),
}));

vi.mock('@endo/bundle-source', () => ({
  default: mocks.bundleSource,
}));

vi.mock('@endo/init', () => ({}));

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

    it('calls console.error if bundling fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const badBundle = resolveBundlePath('bad-vat.fails');
      await createBundleFile(badBundle);
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
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
