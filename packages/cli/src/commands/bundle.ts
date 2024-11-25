import '@endo/init';
import bundleSource from '@endo/bundle-source';
import { glob } from 'glob';
import { lstat, writeFile } from 'node:fs/promises';
import { resolve, parse, format, join } from 'node:path';

/**
 * Create a bundle given path to an entry point.
 *
 * @param sourcePath - Path to the source file that is the root of the bundle.
 * @returns A promise that resolves when the bundle has been written.
 */
export async function createBundle(sourcePath: string): Promise<void> {
  if ((await lstat(sourcePath)).isDirectory()) {
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
 * @returns A promise that resolves when the bundles have been written.
 */
export async function createBundleDir(sourceDir: string): Promise<void> {
  if (!(await lstat(sourceDir)).isDirectory()) {
    throw new Error('createBundleDir must be called on directory', {
      cause: { sourceDir },
    });
  }
  console.log('bundling dir', sourceDir);
  for (const source of await glob(join(sourceDir, '**/*.js'))) {
    await createBundle(source);
  }
}
