import path from 'path';
import type { Plugin } from 'vite';

/**
 * Vite plugin to ensure that the following are true:
 * - Every entrypoint contains at most one import from a *trusted-header file.
 * - The import statement, if it exists, is the first line of the bundled output.
 *
 * @returns A rollup plugin for automatically externalizing trusted headers and checking they are imported first in the files that import them.
 */
export function endoifyTrustedHeaderPlugin(): Plugin {
  const trustedHeaderImporters = new Map<string, string>();
  const isTrustedHeader = (value: string): boolean =>
    value.match(/-trusted-header\./u) !== null;
  const makeExpectedPrefix = (moduleId: string): RegExp => {
    const headerName = `${path.basename(
      moduleId,
      path.extname(moduleId),
    )}-trusted-header.`;
    const expectedPrefix = new RegExp(
      `^import\\s*['"]\\./${headerName}js['"];`,
      'u',
    );
    console.log(expectedPrefix);
    return expectedPrefix;
  };
  return {
    name: 'ocap-kernel:endoify-trusted-header',

    resolveId: {
      order: 'pre',
      handler(source, importer) {
        if (isTrustedHeader(source) && importer !== undefined) {
          if (trustedHeaderImporters.has(importer)) {
            this.error(
              `MultipleTrustedHeaders: Module "${importer}" attempted to import trusted-header "${source}" ` +
                `but already imported trusted-header "${trustedHeaderImporters.get(
                  importer,
                )}".`,
            );
          }
          trustedHeaderImporters.set(importer, source);
          this.info(
            `Module "${source}" has been externalized because it was identified as a trusted-header.`,
          );
          return { id: source, external: true };
        }
        return null;
      },
    },

    buildEnd: {
      order: 'post',
      handler(error) {
        if (error !== undefined) {
          return;
        }
        const trustedHeaders = Array.from(this.getModuleIds()).filter(
          (moduleId) => isTrustedHeader(moduleId),
        );
        const importers = trustedHeaders.map((trustedHeader) =>
          this.getModuleInfo(trustedHeader)?.importers.at(0),
        );
        importers.forEach((moduleId: string | undefined) => {
          if (moduleId === undefined) {
            this.warn(
              `UnusedTrustedHeader: Module ${moduleId} was identified as a trusted header but no modules import it.`,
            );
            return;
          }
          const code = this.getModuleInfo(moduleId)?.code;
          if (code === null || code === undefined) {
            this.error(
              `NoCode: Module ${moduleId} was identified as a trusted header importer but has no code at buildEnd.`,
            );
          }
          const prefix = makeExpectedPrefix(moduleId);
          if (code.match(prefix) === null) {
            this.error(
              `MissingTrustedHeaderImport: Module ${moduleId} was identified as a trusted header importer, ` +
                `but does not begin with trusted header import.\n` +
                `ExpectedPrefix: ${prefix}\n` +
                `ObservedCode: ${code.split(';').at(0)}`,
            );
          }
        });
      },
    },
  };
}
