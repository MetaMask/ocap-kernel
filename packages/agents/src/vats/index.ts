/**
 * Get the bundle spec for a given bundle name.
 *
 * @param bundleName - The name of the bundle.
 * @returns The bundle spec.
 */
export const getBundleSpec = (bundleName: string): string => {
  try {
    return `file://${new URL(`./${bundleName}.bundle`, import.meta.url).pathname}`;
  } catch (error) {
    throw new Error(
      `Failed to getBundleSpec for ${bundleName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
};
