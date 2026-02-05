import { preact } from '@preact/preset-vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(dirname, 'src'),
  plugins: [preact()],
  build: {
    outDir: path.resolve(dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        host: path.resolve(dirname, 'src/host/index.html'),
        caplet: path.resolve(dirname, 'src/caplet/index.html'),
        widget: path.resolve(dirname, 'src/example-widget/index.html'),
      },
    },
  },
  server: {
    open: '/host/index.html',
  },
});
