import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: './src/index.ts',
    },
    minify: false,
    sourcemap: true,
    rollupOptions: {
      external: [
        'ses',
        '@endo/ses',
        // Add workspace dependencies
        /^@metamask\//u,
        /^@ocap\//u,
      ],
      output: [
        {
          format: 'es',
          dir: 'dist',
          preserveModules: true,
          preserveModulesRoot: 'src',
          entryFileNames: '[name].mjs',
        },
        {
          format: 'cjs',
          dir: 'dist',
          preserveModules: true,
          preserveModulesRoot: 'src',
          entryFileNames: '[name].cjs',
          exports: 'named',
        },
      ],
    },
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
