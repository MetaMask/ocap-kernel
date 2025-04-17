import { isErrorWithCode } from '@metamask/utils';
import { copyFile, lstat, access } from 'fs/promises';

/**
 * Check if the target path is a directory.
 *
 * @param target The path to check.
 * @returns A promise which resolves to true if the target path is a directory.
 */
export async function isDirectory(target: string): Promise<boolean> {
  // May not work on Windows.
  try {
    return (await lstat(target)).isDirectory();
  } catch (error) {
    if (isErrorWithCode(error)) {
      switch (error.code) {
        case 'ENOENT':
          return false;
        default:
          break;
      }
    }
    throw error;
  }
}

/**
 * Asynchronously copy file(s) from source to destination.
 *
 * @param source - Where to copy file(s) from.
 * @param destination - Where to copy file(s) to.
 * @returns A promise that resolves when copying is complete.
 */
export async function cp(source: string, destination: string): Promise<void> {
  if (await isDirectory(source)) {
    throw new Error('Directory cp not implemented.');
  }
  await copyFile(source, destination);
}

/**
 * Asynchronously check if a file exists.
 *
 * @param path - The path to check
 * @returns A promise that resolves to true iff a file exists at the given path
 */
export async function fileExists(path: string): Promise<boolean> {
  // May not work on Windows.
  try {
    // if the file can be accessed, it exists
    await access(path);
    return true;
  } catch (error) {
    if (isErrorWithCode(error)) {
      switch (error.code) {
        case 'EEXIST':
          return true;
        case 'ENOENT':
          return false;
        default:
          break;
      }
    }
    throw error;
  }
}
