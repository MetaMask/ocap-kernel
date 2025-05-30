// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import path from 'path';
import sourcemaps from 'rollup-plugin-sourcemaps2';
import { defineConfig } from 'vite';
import type { Plugin as VitePlugin } from 'vite';
import { checker as viteChecker } from 'vite-plugin-checker';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import type { Target } from 'vite-plugin-static-copy';

// We will only run this where it's available, but ESLint doesn't know that
// eslint-disable-next-line n/no-unsupported-features/node-builtins
const sourceDir = path.resolve(import.meta.dirname, 'src');
const buildDir = path.resolve(sourceDir, '../dist/static');

/**
 * Files that need to be statically copied to the destination directory.
 * Paths are relative from the project root directory.
 */
const staticCopyTargets: readonly (string | Target)[] = [
  '../../kernel-shims/dist/endoify.js',
];

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  const isWatching = process.argv.includes('--watch');
  if (isWatching && !isDev) {
    throw new Error('Cannot watch in non-development mode');
  }

  return {
    root: sourceDir,

    build: {
      // assetsDir: buildDir,
      emptyOutDir: true,
      outDir: buildDir,
      rollupOptions: {
        input: {
          vat: path.resolve(sourceDir, 'vat', 'iframe.html'),
          // The stub.html file only exists to get Vite to bundle the web worker file correctly
          stub: path.resolve(sourceDir, 'kernel-worker', 'stub.html'),
          'kernel-worker': path.resolve(
            sourceDir,
            'kernel-worker',
            'kernel-worker.ts',
          ),
        },
        output: {
          format: 'esm',
          entryFileNames: (chunkInfo) => {
            if (!chunkInfo.facadeModuleId) {
              return '[name].js';
            }

            const fileName = ['kernel-worker', 'vat'].includes(chunkInfo.name)
              ? 'index'
              : '[name]';

            const relativePath = path.relative(
              sourceDir,
              chunkInfo.facadeModuleId,
            );
            return `${path.dirname(relativePath)}/${fileName}.js`;
          },
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
          preserveModulesRoot: sourceDir,
        },
      },
      ...(isDev
        ? {
            minify: false,
            sourcemap: 'inline',
          }
        : {}),
    },

    plugins: [
      viteStaticCopy({
        targets: staticCopyTargets.map((src) =>
          typeof src === 'string' ? { src, dest: './' } : src,
        ),
        watch: { reloadPageOnChange: true },
        silent: isDev,
      }),
      viteChecker({ typescript: { tsconfigPath: 'tsconfig.build.json' } }),
      // Remove files from the output
      {
        name: 'filter-stub',
        enforce: 'post',
        generateBundle(_, bundle) {
          for (const key of Object.keys(bundle)) {
            if (path.basename(key).includes('stub')) {
              delete bundle[key];
            }
          }
        },
      },
      isDev && (sourcemaps() as unknown as VitePlugin),
    ],
  };
});
