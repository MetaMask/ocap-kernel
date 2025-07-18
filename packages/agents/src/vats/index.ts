/**
 * Get the bundle spec for a given bundle name.
 *
 * @param bundleName - The name of the bundle.
 * @returns The bundle spec.
 */
export const getBundleSpec = (bundleName: string): string =>
  `file://${new URL(`./${bundleName}.bundle`, import.meta.url).pathname}`;
