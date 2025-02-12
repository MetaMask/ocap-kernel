const { promises } = await import('fs');
const url = await import('url');

/**
 * Resolve a path given relative to this file.
 *
 * @param {string} relativePath - The path to load, relative to this file.
 * @returns An absolute filepath.
 */
export function resolve(relativePath) {
  return url.fileURLToPath(new URL(relativePath, import.meta.url));
}

/**
 * Load the content from the file at the given filepath.
 *
 * @param {string} relativePath - The path to load, relative to this file.
 * @returns The data stored in filepath.
 */
export async function getContent(relativePath) {
  const rawContent = await promises.readFile(resolve(relativePath));
  return rawContent.toString();
}
