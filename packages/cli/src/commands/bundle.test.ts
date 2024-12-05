import bundleSourceImport from '@endo/bundle-source';
import { createHash } from 'crypto';
import { readFile, rm } from 'fs/promises';
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
import { getTestBundles } from '../../test/bundles.js';
import { fileExists } from '../file.js';

const bundleSource = bundleSourceImport as ReturnType<typeof vi.fn>;

vi.mock('@endo/bundle-source', () => ({
  default: vi.fn(),
}));

describe('bundle', async () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const { testBundleRoot, testBundleNames, testBundleSpecs } =
    await getTestBundles();

  const deleteTestBundles = async (): Promise<void> =>
    await Promise.all(
      testBundleSpecs.map(async ({ bundle }) => rm(bundle, { force: true })),
    ).then(() => undefined);

  beforeAll(deleteTestBundles);
  afterEach(deleteTestBundles);

  describe('createBundleFile', () => {
    it.for(testBundleSpecs)(
      'bundles a single file: $name',
      async ({ script, expected, bundle }, ctx) => {
        if (!(await fileExists(expected))) {
          // this test case has no expected bundle
          // reporting handled in `describe('[meta]'` above
          ctx.skip();
        }
        ctx.expect(await fileExists(bundle)).toBe(false);

        const expectedBundleContent = await readFile(expected);

        bundleSource.mockImplementationOnce(() => expectedBundleContent);

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
  });

  describe('createBundleDir', () => {
    it('bundles a directory', async () => {
      expect(
        (await glob(join(testBundleRoot, '*.bundle'))).map((filepath) =>
          basename(filepath, '.bundle'),
        ),
      ).toStrictEqual([]);

      bundleSource.mockImplementation(() => 'test content');

      await createBundleDir(testBundleRoot);

      expect(
        (await glob(join(testBundleRoot, '*.bundle'))).map((filepath) =>
          basename(filepath, '.bundle'),
        ),
      ).toStrictEqual(testBundleNames);
    });
  });
});
