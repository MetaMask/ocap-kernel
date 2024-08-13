// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import { load as loadHtml } from 'cheerio';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format as prettierFormat } from 'prettier';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const projectRoot = './src';

const modulePaths = {
  '@ocap/shims/endoify': '../../shims/dist/endoify.mjs',
  '@ocap/shims/eventual-send': '../../shims/dist/eventual-send.mjs',
  ses: '../../../node_modules/ses/dist/ses.mjs',
};

const moduleOverrides = {
  ses: '../dist/ses.mjs',
};

const resolvedModulePaths = { ...modulePaths };

for (const [specifier] of Object.entries(modulePaths)) {
  const resolvedPath = fileURLToPath(import.meta.resolve(specifier));

  resolvedModulePaths[specifier] =
    specifier in moduleOverrides
      ? path.resolve(resolvedPath, moduleOverrides[specifier])
      : resolvedPath;
}

console.log('Resolved module paths:', resolvedModulePaths);

const resolvedModuleDependencies: Readonly<Record<string, string[]>> = {
  '@ocap/shims/endoify': [
    // eslint-disable-next-line dot-notation
    resolvedModulePaths['ses'],
    resolvedModulePaths['@ocap/shims/eventual-send'],
  ],
};

/**
 * Module specifiers that will be ignored by Rollup if imported, and therefore
 * not transformed.
 */
const externalModules: Readonly<string[]> = [
  './dev-console.js',
  resolvedModulePaths['@ocap/shims/endoify'],
  ...resolvedModuleDependencies['@ocap/shims/endoify'],
];

/**
 * Files that need to be statically copied to the destination directory.
 * Paths are relative from the project root directory.
 */
const staticCopyTargets: Readonly<string[]> = [
  // The extension manifest

  'manifest.json',

  // External modules

  'dev-console.js',

  // Shims and Dependencies

  resolvedModulePaths['@ocap/shims/endoify'],
  ...resolvedModuleDependencies['@ocap/shims/endoify'],
];

// https://vitejs.dev/config/
export default defineConfig({
  root: projectRoot,

  build: {
    emptyOutDir: true,
    outDir: path.resolve(projectRoot, '../dist'),
    rollupOptions: {
      external: [...externalModules],
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

  resolve: {
    alias: Object.entries(resolvedModulePaths).map(([find, replacement]) => ({
      find,
      replacement,
    })),
  },

  plugins: [
    endoifyHtmlFilesPlugin(),
    viteStaticCopy({
      targets: staticCopyTargets.map((src) => ({ src, dest: './' })),
      watch: { reloadPageOnChange: true },
    }),
  ],
});

/**
 * Vite plugin to insert the endoify script before the first script in the head element.
 * @throws If the HTML document already references the endoify script or lacks the expected
 * structure.
 * @returns The Vite plugin.
 */
function endoifyHtmlFilesPlugin(): Plugin {
  const endoifyElement = '<script src="endoify.mjs" type="module"></script>';

  return {
    name: 'externalize-plugin',
    async transformIndexHtml(htmlString) {
      if (htmlString.includes('endoify.mjs')) {
        throw new Error(
          `HTML document already references endoify script:\n${htmlString}`,
        );
      }

      const htmlDoc = loadHtml(htmlString);
      if (htmlDoc('head').length !== 1 || htmlDoc('head script').length < 1) {
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
