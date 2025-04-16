import '@endo/init';
import endoBundleSource from '@endo/bundle-source';
import { Logger } from '@ocap/utils';
import { glob } from 'glob';
import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

import { isDirectory } from '../file.ts';
import { resolveBundlePath } from '../path.ts';

/**
 * Create a bundle given path to an entry point.
 *
 * @param logger - The logger to use for logging.
 * @param sourcePath - Path to the source file that is the root of the bundle.
 * @param targetPath - Optional path to which to write the bundle.
 *  If not provided, defaults to sourcePath with `.bundle` extension.
 * @returns A promise that resolves when the bundle has been written.
 */
export async function bundleFile(
  logger: Logger,
  sourcePath: string,
  targetPath?: string,
): Promise<void> {
  const sourceFullPath = resolve(sourcePath);
  const bundlePath = targetPath ?? resolveBundlePath(sourceFullPath);
  try {
    const bundle = await endoBundleSource(sourceFullPath);
    const bundleContent = JSON.stringify(bundle);
    await writeFile(bundlePath, bundleContent);
    logger.info(`wrote ${bundlePath}: ${new Blob([bundleContent]).size} bytes`);
  } catch (problem) {
    logger.error(`error bundling file ${sourceFullPath}`, problem);
  }
}

/**
 * Create a bundle given path to an entry point.
 *
 * @param logger - The logger to use for logging.
 * @param sourceDir - Path to a directory of source files to bundle.
 * @returns A promise that resolves when the bundles have been written.
 */
export async function bundleDir(
  logger: Logger,
  sourceDir: string,
): Promise<void> {
  logger.info('bundling dir', sourceDir);
  await Promise.all(
    (await glob(join(sourceDir, '*.js'))).map(
      async (source) => await bundleFile(logger, source),
    ),
  );
}

/**
 * Bundle a target file or every file in the target directory.
 *
 * @param logger - The logger to use for logging.
 * @param target - The file or directory to apply the bundler to.
 * @returns A promise that resolves when bundling is done.
 */
export async function bundleSource(
  logger: Logger,
  target: string,
): Promise<void> {
  try {
    const targetIsDirectory = await isDirectory(target);
    await (targetIsDirectory ? bundleDir : bundleFile)(logger, target);
  } catch (problem) {
    logger.error(`error bundling target ${target}`, problem);
  }
}
