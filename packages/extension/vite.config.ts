// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import react from '@vitejs/plugin-react';
import path from 'path';
import sourcemaps from 'rollup-plugin-sourcemaps2';
import { defineConfig } from 'vite';
import type { Plugin as VitePlugin } from 'vite';
import { checker as viteChecker } from 'vite-plugin-checker';
import { viteStaticCopy } from 'vite-plugin-static-copy';

import {
  sourceDir,
  buildDir,
  trustedPreludes,
} from './scripts/build-constants.mjs';
import { extensionDev } from './vite-plugins/extension-dev.js';
import { htmlTrustedPrelude } from './vite-plugins/html-trusted-prelude.js';
import { jsTrustedPrelude } from './vite-plugins/js-trusted-prelude.js';

/**
 * Files that need to be statically copied to the destination directory.
 * Paths are relative from the project root directory.
 */
const staticCopyTargets: readonly string[] = [
  // The extension manifest
  'manifest.json',
  // External modules
  'env/dev-console.js',
  '../../shims/dist/endoify.js',
  // Trusted preludes
  ...new Set(Object.values(trustedPreludes)),
];

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  const isWatching = process.argv.includes('--watch');
  if (isWatching && !isDev) {
    throw new Error('Cannot watch in non-development mode');
  }

  return {
    root: sourceDir,

    build: {
      emptyOutDir: true,
      outDir: buildDir,
      rollupOptions: {
        input: {
          background: path.resolve(sourceDir, 'background.ts'),
          'kernel-worker': path.resolve(
            sourceDir,
            'kernel-integration/kernel-worker.ts',
          ),
          offscreen: path.resolve(sourceDir, 'offscreen.html'),
          iframe: path.resolve(sourceDir, 'iframe.html'),
          popup: path.resolve(sourceDir, 'popup.html'),
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
        targets: staticCopyTargets.map((src) => ({ src, dest: './' })),
        watch: { reloadPageOnChange: true },
        silent: isDev,
      }),
      viteChecker({ typescript: { tsconfigPath: 'tsconfig.build.json' } }),
      // Import sourcemaps from our own libraries
      // For whatever reason, the types don't match, but it works
      isDev && (sourcemaps() as unknown as VitePlugin),
      // Open the extension in the browser when watching
      isWatching && extensionDev({ extensionPath: buildDir }),
    ],
  };
});
