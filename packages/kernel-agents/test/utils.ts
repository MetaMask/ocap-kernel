/**
 * Construct a bundle path URL from a bundle name.
 *
 * @param bundleName - The name of the bundle.
 *
 * @returns a path string for the named bundle.
 */
export function getBundleSpec(bundleName: string): string {
  return new URL(
    `../kernel-test/src/vats/${bundleName}.bundle`,
    import.meta.url,
  ).toString();
}
