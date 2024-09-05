// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import path from 'path';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

import { htmlTrustedPreludePlugin } from './vite-plugins/html-trusted-prelude';
import { jsTrustedPreludePlugin } from './vite-plugins/js-trusted-prelude';

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
  'background-trusted-prelude.js',
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
    htmlTrustedPreludePlugin(),
    viteStaticCopy({
      targets: staticCopyTargets.map((src) => ({ src, dest: './' })),
      watch: { reloadPageOnChange: true },
    }),
    jsTrustedPreludePlugin(),
  ],
});
