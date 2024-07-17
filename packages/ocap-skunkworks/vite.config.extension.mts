import path from 'path';
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy';

const root = './src/extension';

// https://vitejs.dev/config/
export default defineConfig({
  root,
  assetsInclude: ['**/*.json'],
  build: {
    emptyOutDir: true,
    outDir: path.resolve(root, '../../dist'),
    rollupOptions: {
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
    viteStaticCopy({ targets: [{ src: 'manifest.json', dest: './' }]})
  ]
});
