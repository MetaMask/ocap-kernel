import type { Plugin, RenderedModule } from 'rollup';

export type BundleMetadata = {
  exports: string[];
  modules: Record<
    string,
    { renderedExports: string[]; removedExports: string[] }
  >;
};

/**
 * Rollup plugin that captures export metadata from the bundle.
 *
 * Uses the `generateBundle` hook to extract the exports array and
 * per-module metadata (renderedExports and removedExports) from the
 * entry chunk.
 *
 * @returns A plugin with an additional `getMetadata()` method.
 */
export function exportMetadataPlugin(): Plugin & {
  getMetadata: () => BundleMetadata;
} {
  const metadata: BundleMetadata = { exports: [], modules: {} };

  return {
    name: 'export-metadata',
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) {
          const outputChunk = chunk;
          metadata.exports = outputChunk.exports;
          metadata.modules = Object.fromEntries(
            Object.entries(outputChunk.modules).map(
              ([id, info]: [string, RenderedModule]) => [
                id,
                {
                  renderedExports: info.renderedExports,
                  removedExports: info.removedExports,
                },
              ],
            ),
          );
        }
      }
    },
    getMetadata: () => metadata,
  };
}
