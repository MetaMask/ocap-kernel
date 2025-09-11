import fs from 'node:fs/promises';
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
      afterBuild: async (emittedFiles) => {
        await Promise.all(
          Array.from(emittedFiles.entries()).map(async ([dtsPath, content]) => {
            if (!dtsPath.endsWith('.d.ts') && !dtsPath.endsWith('.d.ts.map')) {
              return undefined;
            }

            const mtsPath = dtsPath.replace('.d.ts', '.d.mts');
            const ctsPath = dtsPath.replace('.d.ts', '.d.cts');
            return Promise.all([
              fs.unlink(dtsPath),
              fs.writeFile(mtsPath, content),
              fs.writeFile(ctsPath, content),
            ]);
          }),
        );
      },
    }),
  ],
});
