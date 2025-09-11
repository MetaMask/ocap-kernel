import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: './src/index.ts',
      name: '@metamask/kernel-errors',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      external: [
        'ses',
        '@endo/ses',
        // Add workspace dependencies
        /^@metamask\//u,
        /^@ocap\//u,
      ],
    },
    sourcemap: true,
  },
  plugins: [
    dts({
      tsconfigPath: 'tsconfig.build.json',
      outDir: 'dist',
      copyDtsFiles: true,
      // @ts-expect-error - TODO: Fix
      beforeWriteFile: (filePath, content) => {
        if (filePath.endsWith('.d.ts')) {
          // Generate both .d.mts and .d.cts
          const mtsPath = filePath.replace('.d.ts', '.d.mts');
          const ctsPath = filePath.replace('.d.ts', '.d.cts');
          return [
            { filePath: mtsPath, content },
            { filePath: ctsPath, content },
          ];
        }
        return { filePath, content };
      },
    }),
  ],
});
