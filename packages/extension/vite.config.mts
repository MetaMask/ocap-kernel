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
      // Ignore the following module specifiers if imported
      external: [
        // This file and its imports must not be modified
        './apply-lockdown.mjs',
      ],
      input: {
        background: path.resolve(projectRoot, 'background.ts'),
        offscreen: path.resolve(projectRoot, 'offscreen.html'),
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
        { src: '../../germs/src/shims/apply-lockdown.mjs', dest: './' },
        { src: '../../../node_modules/ses/dist/ses.mjs', dest: './' },
        { src: '../../../node_modules/ses/dist/lockdown.mjs', dest: './' },
      ],
    }),
  ],
});
