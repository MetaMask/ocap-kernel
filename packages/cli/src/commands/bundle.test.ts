import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { glob } from 'glob';
import { join, basename } from 'path';
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';

import { createBundleFile, createBundleDir } from './bundle.js';
import {
  getBundlePath,
  makeTestBundles,
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
  beforeEach(() => {
    vi.resetModules();
  });

  const { testBundleRoot, testBundleSpecs, deleteTestBundles } =
    await makeTestBundles(validTestBundleNames);

  beforeAll(deleteTestBundles);
  afterEach(deleteTestBundles);

  describe('createBundleFile', () => {
    it.for(testBundleSpecs)(
      'bundles a single file: $name',
      async ({ script, expected, bundle }, ctx) => {
        if (!(await fileExists(expected))) {
          // this test case has no expected bundle
          ctx.skip();
        }
        ctx.expect(await fileExists(bundle)).toBe(false);

        const expectedBundleContent = await readFile(expected);

        mocks.bundleSource.mockImplementationOnce(() => expectedBundleContent);

        await createBundleFile(script);

        ctx.expect(await fileExists(bundle)).toBe(true);

        const bundleContent = await readFile(bundle);
        const expectedBundleHash = createHash('sha256')
          .update(expectedBundleContent)
          .digest();
        const bundleHash = createHash('sha256').update(bundleContent).digest();

        ctx
          .expect(bundleHash.toString('hex'))
          .toStrictEqual(expectedBundleHash.toString('hex'));
      },
    );

    it('calls console.error if bundling fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const badBundle = getBundlePath('bad-vat.fails');
      await createBundleFile(badBundle);
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
    });
  });

  describe('createBundleDir', () => {
    it('bundles a directory', async () => {
      expect(
        (await glob(join(testBundleRoot, '*.bundle'))).map((filepath) =>
          basename(filepath, '.bundle'),
        ),
      ).toStrictEqual([]);

      // mocked bundleSource fails iff the target filename has '.fails.'
      mocks.bundleSource.mockImplementation((bundlePath) => {
        if (bundlePath.includes('.fails.')) {
          throw new Error(`Failed to bundle ${bundlePath}`);
        }
        return 'test content';
      });

      await createBundleDir(testBundleRoot);

      const bundledOutputs = (await glob(join(testBundleRoot, '*.bundle'))).map(
        (filepath) => basename(filepath, '.bundle'),
      );

      expect(bundledOutputs.length).toBeGreaterThan(0);

      expect(bundledOutputs).toStrictEqual(validTestBundleNames);
    });
  });
});
