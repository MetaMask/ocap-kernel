import path from 'path';
import type { Plugin } from 'vite';

/**
 * Vite plugin to ensure that the following are true:
 * - Every bundle contains at most one import from a trusted prelude file.
 * - The import statement, if it exists, is the first line of the bundled output.
 *
 * @returns A vite plugin for automatically externalizing trusted preludes and checking they are imported first in the files that import them.
 */
export function jsTrustedPreludePlugin(): Plugin {
  const trustedPreludeImporters = new Map<string, string>();
  const isTrustedPrelude = (value: string): boolean =>
    value.match(/-trusted-prelude\./u) !== null;
  const makeExpectedPrefix = (moduleId: string): RegExp => {
    const preludeName = `${path.basename(
      moduleId,
      path.extname(moduleId),
    )}-trusted-prelude.`;
    const expectedPrefix = new RegExp(
      `^import\\s*['"]\\./${preludeName}js['"];`,
      'u',
    );
    return expectedPrefix;
  };
  return {
    name: 'ocap-kernel:js-trusted-prelude',

    resolveId: {
      order: 'pre',

      /**
       * Automatically externalize files with names `*-trusted-prelude.*`, and ensure no source imports more than one such file.
       *
       * @param source - The module which is doing the importing.
       * @param importer - The module being imported.
       * @returns A ResolveIdResult indicating how vite should resolve this source.
       * @throws If a source attempts to import more than one trusted prelude.
       */
      handler(source, importer) {
        if (isTrustedPrelude(source) && importer !== undefined) {
          // Check if this importer has already imported another trusted prelude.
          if (trustedPreludeImporters.has(importer)) {
            this.error(
              `Module "${importer}" attempted to import trusted prelude "${source}" ` +
                `but already imported trusted prelude "${trustedPreludeImporters.get(
                  importer,
                )}".`,
            );
          }
          trustedPreludeImporters.set(importer, source);
          // Tell vite to externalize this source.
          this.info(
            `Module "${source}" has been externalized because it was identified as a trusted prelude.`,
          );
          return { id: source, external: true };
        }
        return null;
      },
    },

    buildEnd: {
      order: 'post',
      /**
       * Check that identified trusted preludes are their importers' first import in the output bundle.
       *
       * @param error - The error that caused the build to end, undefined if none (yet) occured.
       * @throws If an identified trusted prelude importer does not import its trusted prelude at buildEnd.
       */
      handler(error): void {
        if (error !== undefined) {
          return;
        }
        const trustedPreludes = Array.from(this.getModuleIds()).filter(
          isTrustedPrelude,
        );
        const importers = trustedPreludes.map((trustedPrelude) =>
          this.getModuleInfo(trustedPrelude)?.importers.at(0),
        );
        importers.forEach((moduleId: string | undefined) => {
          if (moduleId === undefined) {
            this.warn(
              `Module ${moduleId} was identified as a trusted prelude but no modules import it.`,
            );
            return;
          }
          const code = this.getModuleInfo(moduleId)?.code;
          if (!code) {
            this.error(
              `Module ${moduleId} was identified as a trusted prelude importer but has no code at buildEnd.`,
            );
          }
          const prefix = makeExpectedPrefix(moduleId);
          if (code.match(prefix) === null) {
            this.error(
              `Module ${moduleId} was identified as a trusted prelude importer, ` +
                `but does not begin with trusted prelude import.\n` +
                `Expected prefix: ${prefix}\n` +
                `Observed code: ${code.split(';').at(0)}`,
            );
          }
        });
      },
    },
  };
}
