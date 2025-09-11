// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  const isWatching = process.argv.includes('--watch');
  if (isWatching && !isDev) {
    throw new Error('Cannot watch in non-development mode');
  }

  return {
    css: {
      postcss: './postcss.config.js',
      preprocessorOptions: {
        scss: {
          quietDeps: true,
          silenceDeprecations: ['import'],
        },
      },
    },
    build: {
      emptyOutDir: true,
      outDir: 'dist',
      sourcemap: true,
      cssCodeSplit: false,
      cssMinify: !isDev,
      lib: {
        entry: './src/index.ts',
        formats: ['es', 'cjs'],
        fileName: (format, entryName) => {
          const ext = format === 'es' ? 'mjs' : 'cjs';
          return `${entryName}.${ext}`;
        },
      },
      rollupOptions: {
        external: [/node_modules\/((?!tailwindcss).)+/u],
        output: {
          globals: {
            react: 'React',
            'react-dom': 'ReactDOM',
          },
          assetFileNames: 'styles.css',
        },
      },
    },
    plugins: [
      react(),
      dts({
        tsconfigPath: 'tsconfig.build.json',
        outDir: 'dist',
      }),
    ],
  };
});
