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

/**
 * Files that need to be statically copied to the destination directory.
 * Paths are relative from the project root directory.
 */
const staticCopyTargets: readonly string[] = [
  // External modules
  '../shims/dist/endoify.js',
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
        'kernel-worker': path.resolve(sourceDir, 'kernel/kernel-worker.ts'),
        'node-worker': path.resolve(sourceDir, 'node/node-worker.ts'),
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
    viteStaticCopy({
      targets: staticCopyTargets.map((src) => ({ src, dest: './' })),
      watch: { reloadPageOnChange: true },
      silent: mode === 'development',
    }),
    viteChecker({ typescript: { tsconfigPath: 'tsconfig.build.json' } }),
  ],
}));
