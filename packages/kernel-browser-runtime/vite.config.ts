// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import { jsTrustedPrelude } from '@ocap/vite-plugins';
import type { PreludeRecord } from '@ocap/vite-plugins';
import path from 'path';
import sourcemaps from 'rollup-plugin-sourcemaps2';
import { defineConfig } from 'vite';
import type { Plugin as VitePlugin } from 'vite';
import { checker as viteChecker } from 'vite-plugin-checker';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import type { Target } from 'vite-plugin-static-copy';

// The importing files end up in `./<entrypoint>/index.js`, and we statically copy
// endoify.js to `./`
const endoifyImportStatement = `import "../endoify.js";`;

export const trustedPreludes: PreludeRecord = {
  'kernel-worker': { content: endoifyImportStatement },
  vat: { content: endoifyImportStatement },
};

/**
 * Files that need to be statically copied to the destination directory.
 * Paths are relative from the project root directory.
 */
const staticCopyTargets: readonly (string | Target)[] = [
  '../../kernel-shims/dist/endoify.js',
];

// We will only run this where it's available, but ESLint doesn't know that
// eslint-disable-next-line n/no-unsupported-features/node-builtins
const sourceDir = path.resolve(import.meta.dirname, 'src');
const buildDir = path.resolve(sourceDir, '../dist/static');

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  const isWatching = process.argv.includes('--watch');
  if (isWatching && !isDev) {
    throw new Error('Cannot watch in non-development mode');
  }

  return {
    root: sourceDir,
    // Ensures that transformed import specifiers are relative to the importing file, which
    // is necessary since consumers may place these files anywhere.
    // See: https://vite.dev/guide/build.html#relative-base
    base: './',

    build: {
      emptyOutDir: true,
      outDir: buildDir,
      // Disable Vite's module preload, which may cause SES-dependent code to run before lockdown.
      modulePreload: false,
      rollupOptions: {
        input: {
          vat: path.resolve(sourceDir, 'vat', 'iframe.html'),
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

            const fileName = Object.keys(trustedPreludes).includes(
              chunkInfo.name,
            )
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
      jsTrustedPrelude({ trustedPreludes }),
      viteStaticCopy({
        targets: staticCopyTargets.map((src) =>
          typeof src === 'string' ? { src, dest: './' } : src,
        ),
        watch: { reloadPageOnChange: true },
        silent: isDev,
      }),
      viteChecker({ typescript: { tsconfigPath: 'tsconfig.build.json' } }),
      isDev && (sourcemaps() as unknown as VitePlugin),
      // For unknown reasons, Vite duplicates the WASM binary file of @sqlite.org/sqlite-wasm.
      // (The file is conditionally imported by multiple files, so that may be the reason.)
      // To avoid bloating the bundle, we introduce the following distasteful hack, which:
      // 1. finds the extraneous sqlite-wasm files
      // 2. deletes them from the bundle
      {
        name: 'deduplicate-sqlite-wasm',
        enforce: 'post',
        generateBundle(_, bundle) {
          const extraneousAssets = Object.values(bundle).filter(
            (assetOrChunk) =>
              assetOrChunk.fileName.startsWith('assets/sqlite3-') &&
              !assetOrChunk.fileName.includes('opfs-async-proxy'),
          );

          if (extraneousAssets.length !== 2) {
            throw new Error(
              `Expected 2 extraneous sqlite3.wasm assets, got ${extraneousAssets.length}: ${extraneousAssets.map((asset) => asset.fileName).join(', ')}`,
            );
          }

          for (const asset of extraneousAssets) {
            delete bundle[asset.fileName];
          }
        },
      },
    ],
  };
});
