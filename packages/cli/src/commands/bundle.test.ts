import type { Logger } from '@metamask/logger';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

import { bundleFile, bundleDir, bundleSource } from './bundle.ts';
import {
  makeTestBundleStage,
  validTestBundleNames,
} from '../../test/bundles.ts';
import { fileExists } from '../file.ts';

const mocks = vi.hoisted(() => {
  return {
    bundleVat: vi.fn(),
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

vi.mock('../vite/vat-bundler.ts', () => ({
  bundleVat: mocks.bundleVat,
}));

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

        const testContent = {
          moduleFormat: 'iife',
          code: 'test-code',
          exports: [],
          external: [],
        };
        mocks.bundleVat.mockImplementationOnce(() => testContent);

        await bundleFile(source, { logger });

        expect(await fileExists(bundle)).toBe(true);

        const bundleContent = JSON.parse(
          await readFile(bundle, { encoding: 'utf8' }),
        );

        expect(bundleContent).toStrictEqual(testContent);
      },
    );

    it('throws if bundling fails', async () => {
      mocks.bundleVat.mockImplementationOnce(() => {
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

      mocks.bundleVat.mockImplementation(() => ({
        moduleFormat: 'iife',
        code: 'test content',
        exports: [],
        external: [],
      }));

      await bundleDir(testBundleRoot, { logger });

      const bundledOutputs = (await globBundles()).map((bundlePath) =>
        basename(bundlePath, '.bundle'),
      );

      expect(bundledOutputs).toStrictEqual(validTestBundleNames);
    });

    it('throws if bundling fails', async () => {
      mocks.bundleVat.mockImplementationOnce(() => {
        throw new Error('test error');
      });
      await expect(bundleDir(testBundleRoot, { logger })).rejects.toThrow(
        'test error',
      );
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
