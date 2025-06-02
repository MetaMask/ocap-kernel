import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Get the source directory of a URL.
 *
 * @param url - The URL to get the source directory of.
 *
 * @returns The source directory of the URL.
 */
export const getUrlSourceDir = (url: string): string =>
  path.resolve(fileURLToPath(url).replace('/dist/', '/src/'), '..');
