import '@endo/init';
import bundleSource from '@endo/bundle-source';
import { glob } from 'glob';
import { writeFile } from 'node:fs/promises';
import { resolve, parse, format, join } from 'node:path';

import { isDirectory } from '../file.js';

/**
 * Create a bundle given path to an entry point.
 *
 * @param sourcePath - Path to the source file that is the root of the bundle.
 * @param check - Whether to check if the sourcePath is a directory. Defaults to true.
 * @returns A promise that resolves when the bundle has been written.
 */
export async function createBundleFile(
  sourcePath: string,
  check: boolean = true,
): Promise<void> {
  if (check && (await isDirectory(sourcePath))) {
    throw new Error('createBundle cannot be called on directory', {
      cause: { sourcePath },
    });
  }

  const sourceFullPath = resolve(sourcePath);
  console.log(sourceFullPath);
  const { dir, name } = parse(sourceFullPath);
  const bundlePath = format({ dir, name, ext: '.bundle' });
  const bundle = await bundleSource(sourceFullPath);
  const bundleString = JSON.stringify(bundle);
  await writeFile(bundlePath, bundleString);
  console.log(`wrote ${bundlePath}: ${bundleString.length} bytes`);
}

/**
 * Create a bundle given path to an entry point.
 *
 * @param sourceDir - Path to a directory of source files to bundle.
 * @param check - Whether to check if the sourceDir is a directory. Defaults to true.
 * @returns A promise that resolves when the bundles have been written.
 */
export async function createBundleDir(
  sourceDir: string,
  check: boolean = true,
): Promise<void> {
  if (check && !(await isDirectory(sourceDir))) {
    throw new Error('createBundleDir must be called on directory', {
      cause: { sourceDir },
    });
  }
  console.log('bundling dir', sourceDir);
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
    false,
  );
}
