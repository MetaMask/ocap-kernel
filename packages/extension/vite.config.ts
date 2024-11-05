// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import path from 'path';
import { defineConfig } from 'vite';
import { checker as viteChecker } from 'vite-plugin-checker';
import { viteStaticCopy } from 'vite-plugin-static-copy';

import {
  sourceDir,
  buildDir,
  trustedPreludes,
} from './scripts/build-constants.mjs';
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
export default defineConfig(({ mode }) => ({
  root: sourceDir,

  build: {
    emptyOutDir: true,
    outDir: buildDir,
    rollupOptions: {
      input: {
        background: path.resolve(sourceDir, 'background.ts'),
        'kernel-worker': path.resolve(sourceDir, 'kernel/kernel-worker.ts'),
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
    ...(mode === 'development'
      ? {
          minify: false,
          sourcemap: 'inline',
        }
      : {}),
  },

  plugins: [
    htmlTrustedPrelude(),
    jsTrustedPrelude({ trustedPreludes }),
    viteStaticCopy({
      targets: staticCopyTargets.map((src) => ({ src, dest: './' })),
      watch: { reloadPageOnChange: true },
      silent: mode === 'development',
    }),
    viteChecker({ typescript: { tsconfigPath: 'tsconfig.build.json' } }),
  ],
}));
