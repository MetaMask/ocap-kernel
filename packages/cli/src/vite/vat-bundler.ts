import { build } from 'vite';
import type { Rollup, PluginOption } from 'vite';

import { exportMetadataPlugin } from './export-metadata-plugin.ts';
import type { BundleMetadata } from './export-metadata-plugin.ts';

export type VatBundle = BundleMetadata & {
  moduleFormat: 'vite-iife';
  code: string;
};

/**
 * Bundle a vat source file using vite.
 *
 * Produces an IIFE bundle that assigns exports to a `__vatExports__` global,
 * along with metadata about the bundle's exports and modules.
 *
 * @param sourcePath - Absolute path to the vat entry point.
 * @returns The bundle object containing code and metadata.
 */
export async function bundleVat(sourcePath: string): Promise<VatBundle> {
  const metadataPlugin = exportMetadataPlugin();

  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: sourcePath,
        formats: ['iife'],
        name: '__vatExports__',
      },
      rollupOptions: {
        output: {
          exports: 'named',
          inlineDynamicImports: true,
        },
        plugins: [metadataPlugin as unknown as PluginOption],
      },
      minify: false,
    },
  });

  const output = Array.isArray(result) ? result[0] : result;
  const chunk = (output as Rollup.RollupOutput).output.find(
    (item): item is Rollup.OutputChunk => item.type === 'chunk' && item.isEntry,
  );

  if (!chunk) {
    throw new Error(`Failed to produce bundle for ${sourcePath}`);
  }

  // SES rejects code containing `import(` patterns, even in comments.
  // Replace them with a safe alternative that won't trigger detection.
  const sanitizedCode = chunk.code.replace(/\bimport\s*\(/gu, 'IMPORT(');

  return {
    moduleFormat: 'vite-iife',
    code: sanitizedCode,
    ...metadataPlugin.getMetadata(),
  };
}
