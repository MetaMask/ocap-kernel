import { mkdir } from 'fs/promises';
import { glob } from 'glob';
import { tmpdir } from 'os';
import { resolve, join, basename, format } from 'path';

import { cp } from '../src/file.js';

const makeTestBundleRoot = async (): Promise<string> => {
  const testRoot = resolve(import.meta.url.split(':')[1] as string, '..');

  // copy bundle targets to staging area
  const testBundleRoot = resolve(testRoot, 'bundles');
  const stageBundleRoot = resolve(tmpdir(), 'test/bundles');
  await mkdir(stageBundleRoot, { recursive: true });
  for (const ext of ['.js', '.expected']) {
    await Promise.all(
      (await glob(join(testBundleRoot, `*${ext}`))).map(async (filePath) => {
        const name = basename(filePath, ext);
        await cp(filePath, format({ dir: stageBundleRoot, name, ext }));
      }),
    );
  }
  await cp(
    join(testRoot, 'test.bundle'),
    join(stageBundleRoot, '../test.bundle'),
  );

  // return the staging area, ready for testing
  return stageBundleRoot;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const getTestBundleNames = async (bundleRoot: string) =>
  (await glob(join(bundleRoot, '*.js'))).map((filepath) =>
    basename(filepath, '.js'),
  );

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const getTestBundleSpecs = (bundleRoot: string, bundleNames: string[]) =>
  bundleNames.map((bundleName) => ({
    name: bundleName,
    script: join(bundleRoot, `${bundleName}.js`),
    expected: join(bundleRoot, `${bundleName}.expected`),
    bundle: join(bundleRoot, `${bundleName}.bundle`),
  }));

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getTestBundles = async () => {
  const testBundleRoot = await makeTestBundleRoot();
  const testBundleNames = await getTestBundleNames(testBundleRoot);
  const testBundleSpecs = getTestBundleSpecs(testBundleRoot, testBundleNames);
  return {
    testBundleRoot,
    testBundleNames,
    testBundleSpecs,
  };
};
