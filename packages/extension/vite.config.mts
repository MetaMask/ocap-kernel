// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import path from 'path';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const projectRoot = './src';

/**
 * Module specifiers that will be ignored by Rollup if imported, and therefore
 * not transformed.
 */
const externalModules: Readonly<string[]> = [
  './dev-console.mjs',
  './endoify.mjs',
];

/**
 * Files that need to be statically copied to the destination directory.
 * Paths are relative from the project root directory.
 */
const staticCopyTargets: Readonly<string[]> = [
  // The extension manifest
  'manifest.json',
  // External modules
  'dev-console.mjs',
  '../../shims/dist/endoify.mjs',
  // Dependencies of external modules
  '../../shims/dist/eventual-send.mjs',
  '../../../node_modules/ses/dist/ses.mjs',
  '../../../node_modules/ses/dist/lockdown.mjs',
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

  plugins: [
    viteStaticCopy({
      targets: staticCopyTargets.map((src) => ({ src, dest: './' })),
      watch: { reloadPageOnChange: true },
    }),
  ],
});
