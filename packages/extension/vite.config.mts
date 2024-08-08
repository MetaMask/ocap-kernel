// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />
/// <reference types="node" />

import path from 'path';
import { fileURLToPath } from 'url';
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

/**
 * Module specifiers that will be ignored by Rollup if imported, and therefore
 * not transformed.
 */
const externalModules: Readonly<string[]> = [
  './dev-console.mjs',
  resolvedModulePaths['@ocap/shims/endoify'],
  resolvedModulePaths['@ocap/shims/eventual-send'],
  resolvedModulePaths['ses'],
  // './endoify.mjs',
  // '@ocap/shims/endoify',
  // '@ocap/shims/eventual-send',
  // 'ses',
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

  resolvedModulePaths['@ocap/shims/endoify'],

  // Dependencies of external modules

  resolvedModulePaths['@ocap/shims/eventual-send'],
  resolvedModulePaths['ses'],
  // '../../../node_modules/ses/dist/lockdown.mjs',
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
    viteStaticCopy({
      targets: staticCopyTargets.map((src) => ({ src, dest: './' })),
      watch: { reloadPageOnChange: true },
    }),
  ],
});
