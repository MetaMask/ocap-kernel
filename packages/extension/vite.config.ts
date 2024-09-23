// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import path from 'path';
import { defineConfig } from 'vite';
import { checker as viteChecker } from 'vite-plugin-checker';
import { viteStaticCopy } from 'vite-plugin-static-copy';

import { htmlTrustedPrelude } from './vite-plugins/html-trusted-prelude';
import { jsTrustedPrelude } from './vite-plugins/js-trusted-prelude';

const projectRoot = './src';

const jsTrustedPreludes = {
  background: path.resolve(projectRoot, 'background-trusted-prelude.js'),
};

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
  // Trusted preludes
  ...new Set(Object.values(jsTrustedPreludes)),
];

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  root: projectRoot,

  build: {
    emptyOutDir: true,
    outDir: path.resolve(projectRoot, '../dist'),
    rollupOptions: {
      input: {
        background: path.resolve(projectRoot, 'background.ts'),
        offscreen: path.resolve(projectRoot, 'offscreen.html'),
        iframe: path.resolve(projectRoot, 'iframe.html'),
        iframe1: path.resolve(projectRoot, 'poc-iframe-angel.html'),
        iframe2: path.resolve(projectRoot, 'poc-iframe-shadow.html'),
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
    jsTrustedPrelude({
      trustedPreludes: jsTrustedPreludes,
    }),
    viteStaticCopy({
      targets: staticCopyTargets.map((src) => ({ src, dest: './' })),
      watch: { reloadPageOnChange: true },
      silent: mode === 'development',
    }),
    viteChecker({ typescript: { tsconfigPath: 'tsconfig.build.json' } }),
  ],
}));
