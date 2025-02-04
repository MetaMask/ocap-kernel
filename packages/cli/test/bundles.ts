import { mkdir, rm } from 'fs/promises';
import { glob } from 'glob';
import { tmpdir } from 'os';
import { resolve, join, basename, format } from 'path';

import { cp } from '../src/file.js';

export const validTestBundleNames = ['sample-vat', 'sample-vat-esp'];

export const invalidTestBundleNames = ['bad-vat.fails'];

const makeTestBundleRoot = async (): Promise<string> => {
  const testRoot = resolve(import.meta.url.split(':')[1] as string, '..');
  const stageRoot = resolve(tmpdir(), 'test');

  // copy bundle targets to staging area
  const testBundleRoot = resolve(testRoot, 'bundles');
  const stageBundleRoot = resolve(stageRoot, 'bundles');
  await mkdir(stageBundleRoot, { recursive: true });
  for (const ext of ['.js', '.expected']) {
    await Promise.all(
      (await glob(join(testBundleRoot, `*${ext}`))).map(async (filePath) => {
        const name = basename(filePath, ext);
        await cp(filePath, format({ dir: stageBundleRoot, name, ext }));
      }),
    );
  }
  await cp(join(testRoot, 'test.bundle'), join(stageRoot, 'test.bundle'));

  // return the staging area, ready for testing
  return stageBundleRoot;
};

export const getBundlePath = (bundleName: string): string => {
  return new URL(join('bundles', bundleName), import.meta.url).pathname;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const getTestBundleSpecs = (bundleRoot: string, bundleNames: string[]) =>
  bundleNames.map((bundleName) => ({
    name: bundleName,
    script: join(bundleRoot, `${bundleName}.js`),
    expected: join(bundleRoot, `${bundleName}.expected`),
    bundle: join(bundleRoot, `${bundleName}.bundle`),
  }));

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const makeTestBundles = async (testBundleNames: string[]) => {
  const testBundleRoot = await makeTestBundleRoot();
  const testBundleSpecs = getTestBundleSpecs(testBundleRoot, testBundleNames);
  const deleteTestBundles = async (): Promise<void> => {
    await Promise.all(
      (await glob(join(testBundleRoot, '*.bundle'))).map(async (bundle) =>
        rm(bundle, { force: true }),
      ),
    );
  };

  return {
    testBundleRoot,
    testBundleSpecs,
    deleteTestBundles,
  };
};
