import path from 'path';
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy';

const root = './src/extension';

// https://vitejs.dev/config/
export default defineConfig({
  root,
  build: {
    // Clean the outDir on build
    emptyOutDir: true,
    outDir: path.resolve(root, '../../dist'),
    rollupOptions: {
      // Ignore the following module specifiers if imported
      external: [
        // This file and its imports must not be modified
        './apply-lockdown.mjs',
      ],
      // Our entry points
      input: {
        background: path.resolve(root, 'background.ts'),
        offscreen: path.resolve(root, 'offscreen.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  },
  plugins: [
    viteStaticCopy({ targets: [
      { src: 'manifest.json', dest: './' },
      { src: 'apply-lockdown.mjs', dest: './' },
      { src: '../../../../node_modules/ses/dist/ses.mjs', dest: './' },
      { src: '../../../../node_modules/ses/dist/lockdown.mjs', dest: './' },
    ]})
  ]
});
