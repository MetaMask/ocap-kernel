// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import path from 'path';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const projectRoot = './src';

// https://vitejs.dev/config/
export default defineConfig({
  root: projectRoot,

  build: {
    emptyOutDir: true,
    outDir: path.resolve(projectRoot, '../dist'),
    rollupOptions: {
      // This tells Rollup to ignore the following module specifiers if imported.
      // Their contents must not be modified.
      external: ['./dev-console.mjs', './endoify.mjs'],
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
      targets: [
        { src: 'manifest.json', dest: './' },
        { src: 'dev-console.mjs', dest: './' },
        { src: '../../shims/dist/endoify.mjs', dest: './' },
        { src: '../../shims/dist/eventual-send.mjs', dest: './' },
        { src: '../../../node_modules/ses/dist/ses.mjs', dest: './' },
        { src: '../../../node_modules/ses/dist/lockdown.mjs', dest: './' },
      ],
      watch: { reloadPageOnChange: true },
    }),
  ],

  test: {
    environment: 'jsdom',
    restoreMocks: true,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // include: [`${projectRoot}/*.ts`],
      reportsDirectory: path.resolve(projectRoot, '../coverage'),
    },
    silent: true,
  },
});
