// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import {
  deduplicateAssets,
  extensionDev,
  htmlTrustedPrelude,
  jsTrustedPrelude,
} from '@ocap/vite-plugins';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { checker as viteChecker } from 'vite-plugin-checker';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import type { Target } from 'vite-plugin-static-copy';

import {
  rootDir,
  kernelBrowserRuntimeSrcDir,
  outDir,
  sourceDir,
  trustedPreludes,
} from './scripts/build-constants.mjs';

/**
 * Files that need to be statically copied to the destination directory.
 * Paths are relative from the project root directory.
 */
const staticCopyTargets: readonly (string | Target)[] = [
  // The extension manifest
  path.resolve(sourceDir, 'manifest.json'),
  // Trusted prelude-related
  path.resolve(sourceDir, 'env/dev-console.js'),
  path.resolve(sourceDir, 'env/background-trusted-prelude.js'),
  path.resolve(rootDir, 'kernel-shims/dist/endoify.js'),
];

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  const isWatching = process.argv.includes('--watch');
  if (isWatching && !isDev) {
    throw new Error('Cannot watch in non-development mode');
  }

  return {
    root: rootDir,

    build: {
      assetsDir: '',
      emptyOutDir: true,
      // Disable Vite's module preload, which may cause SES-dependent code to run before lockdown.
      modulePreload: false,
      outDir,
      rollupOptions: {
        input: {
          background: path.resolve(sourceDir, 'background.ts'),
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
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
        },
      },
      ...(isDev
        ? {
            minify: false,
            sourcemap: 'inline',
          }
        : {}),
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
      // Would you believe that there's no other way to do this?
      {
        name: 'move-html-files-to-root',
        generateBundle: {
          order: 'post',
          handler(_, bundle) {
            for (const chunk of Object.values(bundle)) {
              if (!chunk.fileName.endsWith('.html')) {
                continue;
              }
              chunk.fileName = path.basename(chunk.fileName);
            }
          },
        },
      },
      // Watch kernel-ui dist folder and trigger rebuilds
      {
        name: 'watch-kernel-ui',
        configureServer(server) {
          server.watcher.add(path.resolve(rootDir, 'kernel-ui/dist'));
          server.watcher.on('change', (file) => {
            if (file.includes('kernel-ui/dist')) {
              server.moduleGraph.invalidateAll();
            }
          });
        },
      },
      // Open the extension in the browser when watching
      isWatching && extensionDev({ extensionPath: outDir }),
    ],
  };
});
