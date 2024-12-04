// @ts-check

import '@endo/init';
import bundleSource from '@endo/bundle-source';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

run().catch((problem) => {
  console.error('Failed with', problem);
  process.exitCode = 1;
});

/**
 * Run program at top level.
 */
async function run() {
  const argv = process.argv.splice(2);
  for (const vatPath of argv) {
    await createBundle(vatPath);
  }
}

/**
 * Create a bundle given path to an entry point.
 *
 * @param {string} sourcePath - Path to the source file that is the root of the bundle.
 * @returns {Promise<any>} The resulting bundle.
 */
async function createBundle(sourcePath) {
  // eslint-disable-next-line n/no-process-env
  const sourceFullPath = path.resolve(process.env.INIT_CWD ?? '.', sourcePath);
  const { dir, name } = path.parse(sourceFullPath);
  const bundlePath = path.format({ dir, name, ext: '.bundle' });
  const bundle = await bundleSource(sourceFullPath);
  const bundleString = JSON.stringify(bundle);
  await writeFile(bundlePath, bundleString);
  console.log(`wrote ${bundlePath}: ${bundleString.length} bytes`);
}
