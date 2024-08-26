// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import { load as loadHtml } from 'cheerio';
import path from 'path';
import { format as prettierFormat } from 'prettier';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const projectRoot = './src';

/**
 * Files that need to be statically copied to the destination directory.
 * Paths are relative from the project root directory.
 */
const staticCopyTargets: readonly string[] = [
  // The extension manifest
  'manifest.json',
  // External modules
  'dev-console.js',
  '../../shims/dist/endoify.js',
  'background-trusted-header.js',
];

// https://vitejs.dev/config/
export default defineConfig({
  root: projectRoot,

  build: {
    emptyOutDir: true,
    outDir: path.resolve(projectRoot, '../dist'),
    rollupOptions: {
      input: {
        background: path.resolve(projectRoot, 'background.ts'),
        offscreen: path.resolve(projectRoot, 'offscreen.html'),
        iframe: path.resolve(projectRoot, 'iframe.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },

  plugins: [
    endoifyHtmlFilesPlugin(),
    viteStaticCopy({
      targets: staticCopyTargets.map((src) => ({ src, dest: './' })),
      watch: { reloadPageOnChange: true },
    }),
    endoifyTrustedHeaderPlugin(),
  ],
});

/**
 * Vite plugin to insert the endoify script before the first script in the head element.
 *
 * @throws If the HTML document already references the endoify script or lacks the expected
 * structure.
 * @returns The Vite plugin.
 */
function endoifyHtmlFilesPlugin(): Plugin {
  const endoifyElement = '<script src="endoify.js" type="module"></script>';

  return {
    name: 'externalize-plugin',
    async transformIndexHtml(htmlString): Promise<string> {
      const htmlDoc = loadHtml(htmlString);

      if (htmlDoc('script[src="endoify.ts"]').length > 0) {
        throw new Error(
          `HTML document should not reference "endoify.ts" directly:\n${htmlString}`,
        );
      }

      if (htmlDoc('script[src="endoify.js"]').length > 0) {
        throw new Error(
          `HTML document already references endoify script:\n${htmlString}`,
        );
      }

      if (htmlDoc('head').length !== 1 || htmlDoc('head > script').length < 1) {
        throw new Error(
          `Expected HTML document with a single <head> containing at least one <script>. Received:\n${htmlString}`,
        );
      }

      htmlDoc(endoifyElement).insertBefore('head:first script:first');

      return await prettierFormat(htmlDoc.html(), {
        parser: 'html',
        tabWidth: 2,
      });
    },
  };
}

/**
 * Vite plugin to ensure that the following are true:
 * - Every entrypoint contains at most one import from a *trusted-header file.
 * - The import statement, if it exists, is the first line of the bundled output.
 *
 * @returns A rollup plugin for automatically externalizing trusted headers and checking they are imported first in the files that import them.
 */
function endoifyTrustedHeaderPlugin(): Plugin {
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
    name: 'ocap-kernel:trusted-header',

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
