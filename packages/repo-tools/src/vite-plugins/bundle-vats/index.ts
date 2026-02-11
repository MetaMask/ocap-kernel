import type { Plugin } from 'vite';

import { bundleVat } from './bundle-vat.ts';

export { bundleVat } from './bundle-vat.ts';
export type { VatBundle } from './bundle-vat.ts';

type VatEntry = {
  /** Absolute path to the vat source file */
  source: string;
  /** Output path relative to build outDir (e.g., 'echo/echo-caplet.bundle') */
  output: string;
};

type BundleVatsOptions = {
  vats: VatEntry[];
};

/**
 * Vite plugin that bundles vat source files as part of the build pipeline.
 *
 * Registers vat sources for watch mode and emits bundled assets during
 * `generateBundle`.
 *
 * @param options - Plugin options specifying which vats to bundle.
 * @returns A Vite plugin.
 */
export function bundleVats(options: BundleVatsOptions): Plugin {
  return {
    name: 'ocap-kernel:bundle-vats',

    buildStart() {
      for (const vat of options.vats) {
        this.addWatchFile(vat.source);
      }
    },

    async generateBundle() {
      const results = await Promise.all(
        options.vats.map(async (vat) => {
          const bundle = await bundleVat(vat.source);
          return { fileName: vat.output, bundle };
        }),
      );

      for (const { fileName, bundle } of results) {
        this.emitFile({
          type: 'asset',
          fileName,
          source: JSON.stringify(bundle),
        });
      }
    },
  };
}
