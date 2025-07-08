// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import {
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
  sourceDir,
  buildDir,
  trustedPreludes,
} from './scripts/build-constants.mjs';

/**
 * Files that need to be statically copied to the destination directory.
 * Paths are relative from the project root directory.
 */
const staticCopyTargets: readonly (string | Target)[] = [
  // The extension manifest
  'manifest.json',
  // External modules
  'env/dev-console.js',
  'env/background-trusted-prelude.js',
  '../../kernel-shims/dist/endoify.js',
  {
    src: '../../kernel-browser-runtime/dist/static/*',
    dest: './browser-runtime',
  },
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
          offscreen: path.resolve(sourceDir, 'offscreen.html'),
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
        targets: staticCopyTargets.map((src) =>
          typeof src === 'string' ? { src, dest: './' } : src,
        ),
        watch: { reloadPageOnChange: true },
        silent: isDev,
      }),
      viteChecker({ typescript: { tsconfigPath: 'tsconfig.build.json' } }),
      // Import sourcemaps from our own libraries
      // For whatever reason, the types don't match, but it works
      // Open the extension in the browser when watching
      isWatching && extensionDev({ extensionPath: buildDir }),
    ],
  };
});
