import fs from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: './src/index.ts',
    },
    minify: false,
    sourcemap: true,
    rollupOptions: {
      external: [/node_modules/u],
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
      afterBuild: async (emittedFiles) => {
        const indexDtsFiles = [...emittedFiles.keys()].filter(
          (key) =>
            key.endsWith('dist/index.d.ts') ||
            key.endsWith('dist/index.d.ts.map'),
        );
        if (indexDtsFiles.length !== 2) {
          throw new Error('Root index.d.ts files not found');
        }

        for (const indexDtsPath of indexDtsFiles) {
          const indexDtsContent = emittedFiles.get(indexDtsPath);
          if (!indexDtsContent) {
            throw new Error(
              `File "dist/${path.basename(indexDtsPath)}" is empty`,
            );
          }

          const mtsPath = indexDtsPath.replace('.d.ts', '.d.mts');
          const ctsPath = indexDtsPath.replace('.d.ts', '.d.cts');
          await Promise.all([
            fs.writeFile(mtsPath, indexDtsContent),
            fs.writeFile(ctsPath, indexDtsContent),
            fs.unlink(indexDtsPath),
          ]);
        }
      },
    }),
  ],
});
