import { isObject } from '@metamask/utils';
import { open } from 'fs/promises';

/**
 * Asynchronously check if a file exists.
 *
 * @param path - The path to check
 * @returns A promise that resolves to true iff a file exists at the given path
 */
export async function exists(path: string): Promise<boolean> {
  try {
    const file = await open(path, 'wx');
    // if the file opens, it didn't exist yet
    await file.close();
    return false;
  } catch (error) {
    if (isObject(error) && error.code === 'EEXIST') {
      return true;
    }
    throw error;
  }
}
