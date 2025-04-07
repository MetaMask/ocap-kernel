import '@endo/init';
import bundleSource from '@endo/bundle-source';
import { glob } from 'glob';
import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

import { isDirectory } from '../file.ts';
import { logger } from '../logger.ts';
import { resolveBundlePath } from '../path.ts';

/**
 * Create a bundle given path to an entry point.
 *
 * @param sourcePath - Path to the source file that is the root of the bundle.
 * @param destinationPath - Optional path to which to write the bundle.
 *  If not provided, defaults to sourcePath with `.bundle` extension.
 * @returns A promise that resolves when the bundle has been written.
 */
export async function createBundleFile(
  sourcePath: string,
  destinationPath?: string,
): Promise<void> {
  const sourceFullPath = resolve(sourcePath);
  const bundlePath = destinationPath ?? resolveBundlePath(sourceFullPath);
  try {
    const bundle = await bundleSource(sourceFullPath);
    const bundleString = JSON.stringify(bundle);
    await writeFile(bundlePath, bundleString);
    logger.log(`wrote ${bundlePath}: ${new Blob([bundleString]).size} bytes`);
  } catch (problem) {
    logger.error(problem);
  }
}

/**
 * Create a bundle given path to an entry point.
 *
 * @param sourceDir - Path to a directory of source files to bundle.
 * @returns A promise that resolves when the bundles have been written.
 */
export async function createBundleDir(sourceDir: string): Promise<void> {
  logger.log('bundling dir', sourceDir);
  await Promise.all(
    (await glob(join(sourceDir, '*.js'))).map(
      async (source) => await createBundleFile(source),
    ),
  );
}

/**
 * Bundle a target file or every file in the target directory.
 *
 * @param target The file or directory to apply the bundler to.
 * @returns A promise that resolves when bundling is done.
 */
export async function createBundle(target: string): Promise<void> {
  await ((await isDirectory(target)) ? createBundleDir : createBundleFile)(
    target,
  );
}
