import '@endo/init';
import endoBundleSource from '@endo/bundle-source';
import { importHook } from '@metamask/kernel-utils/import-hook';
import { Logger } from '@metamask/logger';
import { glob } from 'glob';
import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

import { isDirectory } from '../file.ts';
import { resolveBundlePath } from '../path.ts';

type BundleFileOptions = {
  logger: Logger;
  targetPath?: string;
};

/**
 * Create a bundle given path to an entry point.
 *
 * @param sourcePath - Path to the source file that is the root of the bundle.
 * @param options - Options for bundling the file.
 * @param options.logger - The logger to use for logging (required).
 * @param options.targetPath - Optional path to which to write the bundle.
 *  If not provided, defaults to sourcePath with `.bundle` extension.
 * @returns A promise that resolves when the bundle has been written.
 */
export async function bundleFile(
  sourcePath: string,
  options: BundleFileOptions,
): Promise<void> {
  const { logger, targetPath } = options;
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
 * @param sourceDir - Path to a directory of source files to bundle.
 * @param options - Options for bundling the directory.
 * @param options.logger - The logger to use for logging (required).
 * @returns A promise that resolves when the bundles have been written.
 */
export async function bundleDir(
  sourceDir: string,
  options: { logger: Logger },
): Promise<void> {
  const { logger } = options;
  logger.info('bundling dir', sourceDir);
  await Promise.all(
    (await glob(join(sourceDir, '*.js'))).map(
      async (source) => await bundleFile(source, { logger }),
    ),
  );
}

/**
 * Bundle a target file or every file in the target directory.
 *
 * @param target - The file or directory to apply the bundler to.
 * @param logger - The logger to use for logging.
 *
 * @returns A promise that resolves when bundling is done.
 */
export async function bundleSource(
  target: string,
  logger: Logger,
): Promise<void> {
  try {
    const targetIsDirectory = await isDirectory(target);
    await (targetIsDirectory ? bundleDir : bundleFile)(target, { logger });
  } catch (problem) {
    logger.error(`error bundling target ${target}`, problem);
  }
}
