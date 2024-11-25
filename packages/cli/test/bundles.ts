import { glob } from 'glob';
import { resolve, join, basename } from 'path';

const testBundleRoot = resolve(
  import.meta.url.split(':')[1] as string,
  '../bundles',
);

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
  const testBundleNames = await getTestBundleNames(testBundleRoot);
  const testBundleSpecs = getTestBundleSpecs(testBundleRoot, testBundleNames);
  return {
    testBundleRoot,
    testBundleNames,
    testBundleSpecs,
  };
};
