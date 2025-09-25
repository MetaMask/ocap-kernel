import type { Plugin as VitePlugin } from 'vite';

type Options = {
  assetFilter: (fileName: string) => boolean;
  expectedCount: number;
};

/**
 * Vite plugin that deletes extraneous assets from the bundle.
 *
 * @param options - Options for the plugin
 * @param options.assetFilter - A function that filters the assets to be deleted
 * @param options.expectedCount - The expected number of assets to be deleted
 * @throws If the number of extraneous assets is not equal to the expected count.
 * @returns The Vite plugin.
 */
export function deduplicateAssets({
  assetFilter,
  expectedCount,
}: Options): VitePlugin {
  return {
    name: 'ocap-kernel:deduplicate-assets',
    enforce: 'post',
    generateBundle(_, bundle) {
      const extraneousAssets = Object.values(bundle).filter((assetOrChunk) =>
        assetFilter(assetOrChunk.fileName),
      );

      if (extraneousAssets.length !== expectedCount) {
        throw new Error(
          `Expected ${expectedCount} extraneous assets, got ${extraneousAssets.length}: ${extraneousAssets.map((asset) => asset.fileName).join(', ')}`,
        );
      }

      for (const asset of extraneousAssets) {
        delete bundle[asset.fileName];
      }
    },
  };
}
