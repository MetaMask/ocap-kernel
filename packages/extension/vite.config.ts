// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import {
  deduplicateAssets,
  extensionDev,
  htmlTrustedPrelude,
  jsTrustedPrelude,
} from '@ocap/repo-tools/vite-plugins';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { checker as viteChecker } from 'vite-plugin-checker';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import type { Target } from 'vite-plugin-static-copy';

import * as pkg from './package.json';
import {
  kernelBrowserRuntimeSrcDir,
  outDir,
  sourceDir,
  trustedPreludes,
} from './scripts/build-constants.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(dirname, '..', '..');
const staticCopyTargets: readonly (string | Target)[] = [
  // The extension manifest
  'packages/extension/src/manifest.json',
  // Trusted prelude-related
  'packages/extension/src/env/dev-console.js',
  'packages/extension/src/env/background-trusted-prelude.js',
  'packages/kernel-shims/dist/endoify.js',
];

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  const isWatching = process.argv.includes('--watch');
  if (isWatching && !isDev) {
    throw new Error('Cannot watch in non-development mode');
  }

  const resetStorage = process.env.RESET_STORAGE ?? 'false';

  return {
    root: rootDir,
    define: {
      'process.env.RESET_STORAGE': JSON.stringify(String(resetStorage)),
    },
    resolve: {
      alias: isDev ? getPackageDevAliases(pkg.dependencies) : [],
    },
    build: {
      assetsDir: '',
      emptyOutDir: true,
      // Disable Vite's module preload, which may cause SES-dependent code to run before lockdown.
      modulePreload: false,
      outDir,
      minify: !isDev,
      sourcemap: isDev ? 'inline' : false,
      rollupOptions: {
        input: {
          background: path.resolve(sourceDir, 'background.ts'),
          offscreen: path.resolve(sourceDir, 'offscreen.html'),
          popup: path.resolve(sourceDir, 'popup.html'),
          // kernel-browser-runtime
          'kernel-worker': path.resolve(
            kernelBrowserRuntimeSrcDir,
            'kernel-worker',
            'kernel-worker.ts',
          ),
          vat: path.resolve(kernelBrowserRuntimeSrcDir, 'vat', 'iframe.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
        },
      },
    },
    plugins: [
      react(),
      htmlTrustedPrelude(),
      jsTrustedPrelude({ trustedPreludes }),
      viteStaticCopy({
        targets: staticCopyTargets.map((src) =>
          typeof src === 'string' ? { src, dest: './' } : src,
        ),
        watch: { reloadPageOnChange: true },
        silent: isDev,
      }),
      viteChecker({ typescript: { tsconfigPath: 'tsconfig.build.json' } }),
      // Deduplicate sqlite-wasm assets
      deduplicateAssets({
        assetFilter: (fileName) =>
          fileName.includes('sqlite3-') &&
          !fileName.includes('sqlite3-opfs-async-proxy'),
        expectedCount: 2,
      }),
      // Would you believe that there's no other way to do this?
      {
        name: 'move-html-files-to-root',
        generateBundle: {
          order: 'post',
          handler(_, bundle) {
            for (const chunk of Object.values(bundle)) {
              if (!chunk.fileName.endsWith('.html')) {
                continue;
              }
              chunk.fileName = path.basename(chunk.fileName);
            }
          },
        },
      },
      // Watch kernel-ui dist folder and trigger rebuilds
      {
        name: 'watch-kernel-ui',
        configureServer(server) {
          server.watcher.add(path.resolve(rootDir, 'kernel-ui/dist'));
          server.watcher.on('change', (file) => {
            if (file.includes('kernel-ui/dist')) {
              server.moduleGraph.invalidateAll();
            }
          });
        },
      },
      // Open the extension in the browser when watching
      isWatching && extensionDev({ extensionPath: outDir }),
    ],
  };
});

/**
 * Generates Vite aliases for workspace packages to enable proper sourcemap handling in development.
 *
 * By default, Vite resolves workspace packages to their `dist` folders, which breaks the
 * sourcemap chain. These aliases force Vite to use the original TypeScript source from the
 * `src` directories instead, ensuring a complete and accurate sourcemap for debugging.
 *
 * A special alias for `@metamask/kernel-ui/styles.css` is included to resolve the
 * built stylesheet correctly from its `dist` folder.
 *
 * @param deps - The dependencies object from the `package.json` file.
 * @returns An array of Vite alias objects for development mode.
 */
function getPackageDevAliases(
  deps: Record<string, string> = {},
): { find: string; replacement: string }[] {
  const workspacePackages = Object.keys(deps)
    .filter(
      (name) => name.startsWith('@metamask/') && deps[name] === 'workspace:^',
    )
    .map((pkgName) => ({
      find: pkgName,
      replacement: path.resolve(
        rootDir,
        `packages/${pkgName.replace('@metamask/', '')}/src`,
      ),
    }));

  return [
    // Special alias for kernel-ui styles, which are in dist
    {
      find: '@metamask/kernel-ui/styles.css',
      replacement: path.resolve(rootDir, 'packages/kernel-ui/dist/styles.css'),
    },
    ...workspacePackages,
  ];
}
