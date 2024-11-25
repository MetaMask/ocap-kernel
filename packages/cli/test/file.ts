import { open } from 'fs/promises';

/**
 * Asynchronously check if a file exists.
 *
 * @param path - The path to check
 * @returns A promise that resolves to true iff a file exists at the given path
 */
export async function exists(path: string): Promise<boolean> {
  return open(path, 'wx')
    .then(async (file) => {
      // if the file opens, it didn't exist yet
      await file.close();
      return false;
    })
    .catch((error) => {
      if (error.code === 'EEXIST') {
        return true;
      }
      throw error;
    });
}
