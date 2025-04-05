import { mkdir } from 'fs/promises';
import { glob } from 'glob';
import { tmpdir } from 'os';
import { resolve, join, basename, format } from 'path';

import { cp } from '../src/file.ts';

export const validTestBundleNames = ['sample-vat', 'sample-vat-esp'];

export const invalidTestBundleNames = ['bad-vat.fails'];

const testRoot = new URL('.', import.meta.url).pathname;

const makeTestBundleRoot = async () => {
  const stageRoot = resolve(tmpdir(), 'test');

  // copy bundle targets to staging area
  const testBundleRoot = resolve(testRoot, 'bundles');
  const stageBundleRoot = resolve(stageRoot, 'bundles');
  await mkdir(stageBundleRoot, { recursive: true });
  const ext = '.js';
  await Promise.all(
    (await glob(join(testBundleRoot, `*${ext}`))).map(async (filePath) => {
      const name = basename(filePath, ext);
      await cp(filePath, format({ dir: stageBundleRoot, name, ext }));
    }),
  );
  await cp(join(testRoot, 'test.bundle'), join(stageRoot, 'test.bundle'));

  // return the staging area, ready for testing
  return stageBundleRoot;
};

export const makeTestBundleStage = async () => {
  const stageBundleRoot = await makeTestBundleRoot();

  const resolveBundlePath = (bundleName: string): string => {
    return join(stageBundleRoot, `${bundleName}.bundle`);
  };

  const resolveSourcePath = (bundleName: string): string => {
    return join(stageBundleRoot, `${bundleName}.js`);
  };

  const getTestBundleSpecs = (testBundleNames: string[]) =>
    testBundleNames.map((bundleName) => ({
      name: bundleName,
      source: resolveSourcePath(bundleName),
      bundle: resolveBundlePath(bundleName),
    }));

  const globBundles = async (): Promise<string[]> =>
    await glob(join(stageBundleRoot, '*.bundle'));

  return {
    testBundleRoot: stageBundleRoot,
    getTestBundleSpecs,
    resolveBundlePath,
    resolveSourcePath,
    globBundles,
  };
};
