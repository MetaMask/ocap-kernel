import { glob } from 'glob';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, basename, format } from 'node:path';

import { cp } from '../src/file.ts';

export const validTestBundleNames = ['sample-vat', 'sample-vat-esp'];

const testRoot = new URL('.', import.meta.url).pathname;

const makeTestBundleRoot = async () => {
  const stageRoot = await mkdtemp(join(tmpdir(), 'ocap-cli-test-'));

  // copy bundle targets to staging area
  const testBundleRoot = resolve(testRoot, 'bundles');
  const stageBundleRoot = resolve(stageRoot, 'bundles');
  await mkdir(stageBundleRoot, { recursive: true });
  await Promise.all(
    (await glob(join(testBundleRoot, '*.js'))).map(async (filePath) => {
      const name = basename(filePath, '.js');
      await cp(filePath, format({ dir: stageBundleRoot, name, ext: '.js' }));
    }),
  );
  await cp(join(testRoot, 'test.bundle'), join(stageRoot, 'test.bundle'));

  const cleanup = async () => {
    await rm(stageRoot, { recursive: true, force: true });
  };

  // return the staging area, ready for testing
  return { stageBundleRoot, cleanup };
};

export const makeTestBundleStage = async () => {
  const { stageBundleRoot, cleanup } = await makeTestBundleRoot();

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

  const deleteTestBundles = async (): Promise<void[]> =>
    Promise.all(
      (await globBundles()).map(async (bundle) => rm(bundle, { force: true })),
    );

  return {
    testBundleRoot: stageBundleRoot,
    getTestBundleSpecs,
    resolveBundlePath,
    resolveSourcePath,
    globBundles,
    deleteTestBundles,
    cleanup,
  };
};
