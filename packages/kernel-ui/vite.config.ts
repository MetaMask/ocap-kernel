// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    build: {
      emptyOutDir: false,
      outDir: './dist',
      lib: {
        entry: './src/index.ts',
        name: 'KernelUI',
        formats: ['es', 'cjs'],
        fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
      rollupOptions: {
        external: [
          'react',
          'react-dom',
          '@endo/eventual-send',
          '@endo/marshal',
          '@metamask/kernel-browser-runtime',
          '@metamask/kernel-rpc-methods',
          '@metamask/kernel-shims',
          '@metamask/kernel-utils',
          '@metamask/logger',
          '@metamask/ocap-kernel',
          '@metamask/streams',
          '@metamask/utils',
          'ses',
        ],
        output: {
          globals: {
            react: 'React',
            'react-dom': 'ReactDOM',
          },
          assetFileNames: 'styles.css',
        },
      },
      cssCodeSplit: false,
      cssMinify: true,
    },
    css: {
      modules: {
        localsConvention: 'camelCase',
        generateScopedName: '[name]__[local]___[hash:base64:5]',
      },
    },
    plugins: [react()],
  };
});
