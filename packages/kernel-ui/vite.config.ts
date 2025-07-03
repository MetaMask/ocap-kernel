// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: 'dist',
    sourcemap: true,
    cssCodeSplit: false,
    cssMinify: true,
    lib: {
      entry: './src/index.ts',
      name: 'KernelUI',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => {
        const ext = format === 'es' ? 'mjs' : 'cjs';
        return `${entryName}.${ext}`;
      },
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
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
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
  },
  plugins: [
    react(),
    dts({
      tsconfigPath: 'tsconfig.build.json',
      outDir: 'dist',
    }),
  ],
});
