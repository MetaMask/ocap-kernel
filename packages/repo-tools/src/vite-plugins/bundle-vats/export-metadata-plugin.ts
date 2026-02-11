import type { Plugin } from 'vite';

type BundleMetadata = {
  exports: string[];
  external: string[];
};

/**
 * Rollup plugin that captures export metadata from the bundle.
 *
 * Uses the `generateBundle` hook to extract the exports array from the
 * entry chunk.
 *
 * @returns A plugin with an additional `getMetadata()` method.
 */
export function exportMetadataPlugin(): Plugin & {
  getMetadata: () => BundleMetadata;
} {
  const metadata: BundleMetadata = { exports: [], external: [] };

  return {
    name: 'export-metadata',
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) {
          metadata.exports = chunk.exports;
        }
      }
    },
    getMetadata: () => metadata,
  };
}
