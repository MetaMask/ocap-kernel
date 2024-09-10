import path from 'path';
import type { Plugin, ResolvedConfig } from 'vite';

// This type is referenced in JSDoc strings in this file.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type RollupOptions = ResolvedConfig['build']['rollupOptions'];

type PluginContext = {
  warn: (message: string) => void;
  error: (message: string) => never;
};

/**
 * Resolve trusted prelude file names as their basename only, rewriting `.[mc]?ts` files as `.[mc]?js`.
 *
 * @param fileName - The trusted prelude fileName to resolve.
 * @returns The simple filename '[basename].[ext]', with '*ts' extensions converted to '*js' extensions.
 */
const resolvePreludeFileName = (fileName: string): string =>
  path.basename(fileName).replace(/ts$/u, 'js');

/**
 * Check if the given code begins by importing the given trusted prelude.
 *
 * @param code - The code to evaluate.
 * @param preludeFileName - The file name of the trusted prelude.
 * @returns True if the code begins by importing the trusted prelude file, false otherwise.
 */
const importsTrustedPreludeFirst = (
  code: string,
  preludeFileName: string,
): boolean =>
  code.match(
    new RegExp(
      `^import\\s*['"]\\./${resolvePreludeFileName(preludeFileName)}['"];`,
      'u',
    ),
  ) !== null;

/**
 * A Vite plugin to ensure the following.
 * - Every declared trusted prelude is handled externally (automatically merged into {@link RollupOptions.external}).
 * - Every declared trusted prelude importer:
 *   - Is a declared entry point (throws during {@link Plugin.buildStart} otherwise).
 *   - Imports at most one declared trusted prelude (throws during {@link Plugin.generateBundle} otherwise).
 *   - Begins by importing its declared trusted header (prepended during {@link Plugin.generateBundle} if missing).
 *
 * @param pluginConfig - The config options bag.
 * @param pluginConfig.trustedPreludes - A mapping from the keys of {@link RollupOptions.input} to the file names of trusted preludes for the corresponding entry point.
 * @returns The Vite plugin.
 */
export function jsTrustedPrelude(pluginConfig: {
  trustedPreludes: {
    [key: string]: string;
  };
}): Plugin {
  const { trustedPreludes } = pluginConfig;

  // Plugin state transferred between rollup stages.
  let configError: ((context: PluginContext) => never) | undefined;
  let isTrustedPrelude: (source: string) => boolean;
  let isTrustingImporter: (importer: string) => boolean;
  /**
   * Given the name of a trusted prelude importer, return the resolved file name of its trusted prelude.
   *
   * @param context - The calling plugin context which provides `.warn` and `.error` methods.
   * @param importer - The name of the trusted prelude importer.
   * @throws If importer was not declared as a trusted prelude importer.
   */
  let getTrustedPrelude: (context: PluginContext, importer: string) => string;

  return {
    name: 'ocap-kernel:js-trusted-prelude',

    /**
     * Append declared trusted preludes to the {@link RollupOptions.external} declaration.
     *
     * @returns Changes to be deeply merged into the declared vite config file.
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
     * Whenever the config changes, update config dependent functions and collect configuration errors to be thrown during {@link Plugin.buildStart}.
     *
     * @param viteConfig - The resolved vite config file after all plugins have had a change to modify it.
     */
    configResolved(viteConfig: ResolvedConfig) {
      // Collect entry points.
      const entryPoints = new Map(
        Object.entries(viteConfig.build.rollupOptions.input ?? {}),
      );

      // Parse trusted prelude mappings.
      const misconfiguredKeys: string[] = [];
      const resolvedTrustingImporters = new Map();
      const resolvedTrustedPreludes = new Set();
      for (const [key, source] of Object.entries(trustedPreludes)) {
        // If this trusting importer isn't declared an entry point, add it to misconfigured keys.
        if (!entryPoints.has(key)) {
          misconfiguredKeys.push(key);
          continue;
        }
        const preludeOutputFileName = resolvePreludeFileName(source);
        resolvedTrustingImporters.set(key, preludeOutputFileName);
        resolvedTrustedPreludes.add(preludeOutputFileName);
      }

      // Set trusted prelude functions for use in generateBundle phase.
      isTrustedPrelude = (source: string) =>
        resolvedTrustedPreludes.has(resolvePreludeFileName(source));
      isTrustingImporter = (importer: string) =>
        resolvedTrustingImporters.has(importer);
      getTrustedPrelude = (context: PluginContext, importer: string) => {
        const trustedPrelude = resolvedTrustingImporters.get(importer);
        // Ensure importer was declared and recognized as a trusting importer.
        if (!trustedPrelude) {
          // Shouldn't be possible without heavy interference from other plugins.
          context.error(
            `Module "${importer}" was identified as but not declared as a trusted prelude importer.`,
          );
        }
        return trustedPrelude;
      };

      // If misconfigured, prepare error for buildStart phase.
      configError =
        misconfiguredKeys.length === 0
          ? undefined
          : (context): never => {
              const errorLine = `Configured trusted prelude importers ${JSON.stringify(
                misconfiguredKeys,
              )} must be declared entry points.`;
              context.warn(errorLine);
              context.warn(
                `Declared entry points: ${JSON.stringify(
                  Array.from(entryPoints.keys()),
                )}`,
              );
              return context.error(errorLine);
            };
    },

    /**
     * Throw configuration errors if there were any.
     * Wait until buildStart to throw configuration errors to utilize {@link PluginContext}'s `warn` and `error`.
     *
     * @throws If a declared trusted prelude importer was not a declared entry point.
     */
    buildStart() {
      configError?.(this);
    },

    generateBundle: {
      order: 'post',
      /**
       * At write time, ensure the following.
       * Every declared trusted prelude importer:
       *  - Imports at most one declared trusted prelude (throws otherwise).
       *  - Begins by importing its declared trusted header (prepended if missing).
       *
       * @param _ - Unused.
       * @param bundle - The OutputBundle being generated.
       * @param isWrite - Whether bundle is being written.
       * @throws If a declared trusted prelude importer imports more than one declared trusted prelude.
       */
      async handler(_, bundle, isWrite) {
        if (!isWrite) {
          return;
        }

        // The relevant properties of the OutputChunk type, declared here because it is not exposed by Vite.
        type TrustingChunk = {
          imports: [string, ...string[]];
          fileName: string;
          code: string;
          name: string;
          isEntry: boolean;
        };

        // Collect chunks which import a trusted prelude.
        const trustingChunks: TrustingChunk[] = Object.values(bundle).filter(
          (output) =>
            output.type === 'chunk' && isTrustingImporter(output.name),
        ) as unknown as TrustingChunk[];

        // Validate trusted prelude assumptions for chunks that import them and prepend the import if necessary.
        for (const chunk of trustingChunks) {
          // Ensure trusted prelude importer was declared an entry point.
          if (!chunk.isEntry) {
            // Shouldn't be possible without interference from other plugins.
            this.warn(
              `Identified a trusting chunk ${chunk.name} which was not declared an entry point.`,
            );
          }

          // Check if this chunk has imported more than one trusted prelude.
          const chunkTrustedPreludes = chunk.imports.filter(isTrustedPrelude);
          if (chunkTrustedPreludes.length > 1) {
            // This should only occur due to transitive imports.
            const errorLine = `Module "${chunk.fileName}" attempted to import multiple trusted preludes (perhaps transitively), but no more than one is allowed.`;
            this.warn(errorLine);
            this.warn(
              `Imported preludes: ${JSON.stringify(chunkTrustedPreludes)}`,
            );
            this.error(errorLine);
          }

          // Add the trusted prelude import to the beginning of the file if it is missing.
          const declaredTrustedPrelude = getTrustedPrelude(this, chunk.name);
          if (!importsTrustedPreludeFirst(chunk.code, declaredTrustedPrelude)) {
            this.warn(
              `Module "${chunk.name}" was declared as a trusted prelude importer but its first import was not the declared trusted prelude.`,
            );
            const prefix = `import"./${declaredTrustedPrelude}";`;
            // TODO: Maybe remove redundant import statements from code body.
            // - Note: Not functionally necessary due to idempotency of import statements.
            // - Implementation tip: this.parse(chunk.code).body [...];
            chunk.code = prefix + chunk.code;
            this.warn(
              `Automatically prepended prefix '${prefix}' to code for module "${chunk.name}".`,
            );
          }
        }
      },
    },
  };
}
