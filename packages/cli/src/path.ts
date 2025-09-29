import { format, parse, resolve } from 'node:path';

/**
 * Given a source file path, resolve its associated bundle file path.
 *
 * @param sourcePath - The path to the source file
 * @returns The path to the bundle file.
 */
export function resolveBundlePath(sourcePath: string): string {
  const sourceFullPath = resolve(sourcePath);
  const { dir, name } = parse(sourceFullPath);
  const bundlePath = format({ dir, name, ext: '.bundle' });
  return bundlePath;
}
