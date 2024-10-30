import path from 'path';
import type { Plugin as VitePlugin, ResolvedConfig } from 'vite';

/**
 * A Vite plugin that ensures trusted preludes are imported first in their respective files.
 * The plugin will:
 * - Mark all trusted preludes as external modules
 * - Validate that trusted prelude importers are entry points
 * - Prevent manual imports of trusted preludes
 * - Add the trusted prelude import at the very top of each entry point
 *
 * @param pluginConfig - The plugin configuration object
 * @param pluginConfig.trustedPreludes - A mapping from entry point names to their trusted prelude files
 * @returns A Vite plugin
 */
export function jsTrustedPrelude(pluginConfig: {
  trustedPreludes: Record<string, string>;
}): VitePlugin {
  const { trustedPreludes } = pluginConfig;

  // Track entry points for validation
  let entryPoints: Set<string>;

  return {
    name: 'ocap-kernel:js-trusted-prelude',

    /**
     * Marks trusted preludes as external modules to prevent them from being bundled.
     *
     * @returns The Rollup configuration changes
     */
    config() {
      return {
        build: {
          rollupOptions: {
            external: Object.values(trustedPreludes),
          },
        },
      };
    },

    /**
     * Validates that all trusted prelude importers are declared as entry points.
     * This ensures that trusted preludes are only imported by the files we expect.
     *
     * @param config - The resolved Vite configuration
     * @throws If a trusted prelude importer is not declared as an entry point
     */
    configResolved(config: ResolvedConfig) {
      entryPoints = new Set(
        Object.keys(config.build.rollupOptions.input ?? {}),
      );

      for (const key of Object.keys(trustedPreludes)) {
        if (!entryPoints.has(key)) {
          throw new Error(
            `Trusted prelude importer "${key}" must be declared as an entry point`,
          );
        }
      }
    },

    generateBundle: {
      order: 'post',
      /**
       * Processes the final bundle to:
       * - Ensure entry points are correctly configured
       * - Prevent manual imports of trusted preludes
       * - Add trusted prelude imports at the top of entry points
       *
       * @param _ - Unused options parameter
       * @param bundle - The output bundle being generated
       * @param isWrite - Whether the bundle is being written to disk
       * @throws If an entry point contains manual trusted prelude imports
       */
      handler(_, bundle, isWrite) {
        if (!isWrite) {
          return;
        }

        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk') {
            continue;
          }

          const entryName = path.basename(
            chunk.fileName,
            path.extname(chunk.fileName),
          );
          const preludePath = trustedPreludes[entryName];

          if (!preludePath) {
            continue;
          }

          // Validate chunk is an entry point
          if (!chunk.isEntry) {
            this.error(
              `Trusted prelude importer "${entryName}" must be an entry point`,
            );
          }

          // Check for any existing trusted prelude imports
          const trustedPreludeImports = chunk.imports.filter((imp) =>
            Object.values(trustedPreludes).some(
              (importPath) => path.basename(importPath) === path.basename(imp),
            ),
          );

          if (trustedPreludeImports.length > 0) {
            this.error(
              `Module "${chunk.fileName}" contains trusted prelude imports that should be handled by the plugin: ${trustedPreludeImports.join(', ')}`,
            );
          }

          // Add the import at the top - always use root level import
          const preludeFile = path.basename(preludePath);
          const importStatement = `import "./${preludeFile}";\n`;
          chunk.code = importStatement + chunk.code;
        }
      },
    },
  };
}
