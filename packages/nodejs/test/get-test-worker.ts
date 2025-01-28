/**
 * Get a path for a node worker file from its name.
 *
 * @param name - The name of the test worker file to retrieve.
 * @returns The path for a test worker file.
 */
export const getTestWorkerFile = (name: string): string =>
  new URL(`./workers/${name}.js`, import.meta.url).pathname;
