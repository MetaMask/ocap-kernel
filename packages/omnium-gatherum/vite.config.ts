// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import {
  getDefines,
  getPackageDevAliases,
} from '@ocap/repo-tools/build-utils/vite';
import {
  deduplicateAssets,
  extensionDev,
  htmlTrustedPrelude,
  jsTrustedPrelude,
  moveHtmlFilesToRoot,
  watchInternalPackages,
} from '@ocap/repo-tools/vite-plugins';
import type { PreludeRecord } from '@ocap/repo-tools/vite-plugins';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { checker as viteChecker } from 'vite-plugin-checker';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import type { Target } from 'vite-plugin-static-copy';

import * as pkg from './package.json';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(dirname, '..', '..');
const sourceDir = path.resolve(dirname, 'src');
const outDir = path.resolve(dirname, 'dist');
export const kernelBrowserRuntimeSrcDir = path.resolve(
  rootDir,
  'packages/kernel-browser-runtime/src',
);

const staticCopyTargets: readonly (string | Target)[] = [
  // The extension manifest
  'packages/omnium-gatherum/src/manifest.json',
  // Trusted prelude-related
  'packages/kernel-shims/dist/endoify.js',
];

const endoifyImportStatement = `import './endoify.js';`;
const trustedPreludes: PreludeRecord = {
  background: {
    content: endoifyImportStatement,
  },
  'kernel-worker': { content: endoifyImportStatement },
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  const isWatching = process.argv.includes('--watch');
  if (isWatching && !isDev) {
    throw new Error('Cannot watch in non-development mode');
  }

  return {
    root: rootDir,
    define: {
      ...getDefines(isDev),
    },
    resolve: {
      alias: isDev ? getPackageDevAliases(rootDir, pkg.dependencies) : [],
    },
    build: {
      assetsDir: '',
      emptyOutDir: true,
      // Disable Vite's module preload, which may cause SES-dependent code to run before lockdown.
      modulePreload: false,
      outDir,
      minify: !isDev,
      sourcemap: isDev ? 'inline' : false,
      rollupOptions: {
        input: {
          background: path.resolve(sourceDir, 'background.ts'),
          devtools: path.resolve(sourceDir, 'devtools/devtools.html'),
          'kernel-panel': path.resolve(sourceDir, 'devtools/kernel-panel.html'),
          offscreen: path.resolve(sourceDir, 'offscreen.html'),
          popup: path.resolve(sourceDir, 'popup.html'),
          // kernel-browser-runtime
          'kernel-worker': path.resolve(
            kernelBrowserRuntimeSrcDir,
            'kernel-worker',
            'kernel-worker.ts',
          ),
          vat: path.resolve(kernelBrowserRuntimeSrcDir, 'vat', 'iframe.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: (chunkInfo) => {
            // Rename _commonjsHelpers to avoid underscore prefix extension issues
            if (chunkInfo.name === '_commonjsHelpers') {
              return 'commonjsHelpers.js';
            }
            return '[name].js';
          },
          assetFileNames: '[name].[ext]',
        },
      },
    },
    plugins: [
      react(),
      htmlTrustedPrelude(),
      jsTrustedPrelude({ trustedPreludes }),
      viteStaticCopy({
        targets: staticCopyTargets.map((src) =>
          typeof src === 'string' ? { src, dest: './' } : src,
        ),
        watch: { reloadPageOnChange: true },
        silent: isDev,
      }),
      viteChecker({ typescript: { tsconfigPath: 'tsconfig.build.json' } }),
      // Deduplicate sqlite-wasm assets
      deduplicateAssets({
        assetFilter: (fileName) =>
          fileName.includes('sqlite3-') &&
          !fileName.includes('sqlite3-opfs-async-proxy'),
        expectedCount: 2,
      }),
      moveHtmlFilesToRoot(),
      watchInternalPackages({ rootDir, packages: ['kernel-ui'] }),
      // Open the extension in the browser when watching
      isWatching && extensionDev({ extensionPath: outDir }),
    ],
  };
});
