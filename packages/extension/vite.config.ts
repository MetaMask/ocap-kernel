// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import { load as loadHtml } from 'cheerio';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format as prettierFormat } from 'prettier';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const relativeProjectRootPath = './src';
const absoluteProjectRootPath = path.resolve(relativeProjectRootPath);

/**
 * Bare specifier keyed module definitions for
 * externalized and/or bundled modules.
 */
const moduleDefinitions = {
  '@ocap/shims/endoify': { dependencies: ['ses', '@ocap/shims/eventual-send'] },
  // '@ocap/shims/apply-lockdown': { dependencies: ['ses'] },
  '@ocap/shims/eventual-send': { dependencies: ['ses'] },
  ses: { override: '../dist/ses.mjs' },
};

/**
 * Bare specifier keyed relative module paths for
 * externalized and/or bundled modules.
 */
const modulePaths = resolveModulePathsFromDefinitions(moduleDefinitions);

/**
 * Bare specifier keyed module and dependencies paths for
 * externalized and/or bundled modules.
 */
const moduleDependencyPaths = resolveModuleDependencyPathsFromDefinitions(
  moduleDefinitions,
  modulePaths,
);

// console.log('Resolved module paths:', modulePaths);
// console.log('Resolved module dependencies:', moduleDependencyPaths);

// https://vitejs.dev/config/
export default defineConfig({
  root: relativeProjectRootPath,

  build: {
    emptyOutDir: true,
    outDir: path.resolve(relativeProjectRootPath, '../dist'),
    rollupOptions: {
      /**
       * Module specifiers that will be ignored by Rollup if imported, and therefore
       * not transformed.
       */
      external: [
        ...new Set([
          './dev-console.js',
          ...moduleDependencyPaths['@ocap/shims/endoify'],
          // ...resolvedModulesAndDependenciesPaths['@ocap/shims/apply-lockdown'],
        ]),
      ],
      input: {
        background: path.resolve(relativeProjectRootPath, 'background.ts'),
        offscreen: path.resolve(relativeProjectRootPath, 'offscreen.html'),
        iframe: path.resolve(relativeProjectRootPath, 'iframe.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },

  resolve: {
    alias: Object.entries(modulePaths).map(([find, replacement]) => ({
      find,
      replacement,
    })),
  },

  plugins: [
    endoifyHtmlFilesPlugin(),
    viteStaticCopy({
      /**
       * Files that need to be statically copied to the destination directory.
       * Paths are relative from the project root directory.
       */
      targets: [
        ...new Set([
          'manifest.json',
          'dev-console.js',
          ...moduleDependencyPaths['@ocap/shims/endoify'],
          // ...resolvedModulesAndDependenciesPaths['@ocap/shims/apply-lockdown'],
        ]),
      ].map((src) => ({ src, dest: './' })),
      watch: { reloadPageOnChange: true },
    }),
  ],
});

/**
 * Vite plugin to insert the endoify script before the first script in the head element.
 * @throws If the HTML document already references the endoify script or lacks the expected
 * structure.
 * @returns The Vite plugin.
 */
function endoifyHtmlFilesPlugin(): Plugin {
  const endoifyElement = '<script src="endoify.mjs" type="module"></script>';

  return {
    name: 'externalize-plugin',
    async transformIndexHtml(htmlString) {
      if (htmlString.includes('endoify.mjs')) {
        throw new Error(
          `HTML document already references endoify script:\n${htmlString}`,
        );
      }

      const htmlDoc = loadHtml(htmlString);
      if (htmlDoc('head').length !== 1 || htmlDoc('head script').length < 1) {
        throw new Error(
          `Expected HTML document with a single <head> containing at least one <script>. Received:\n${htmlString}`,
        );
      }

      htmlDoc(endoifyElement).insertBefore('head:first script:first');
      return await prettierFormat(htmlDoc.html(), {
        parser: 'html',
        tabWidth: 2,
      });
    },
  };
}

/**
 * Resolve a specifier's dependency graph from module definitions.
 *
 * @template Specifier - The module specifier type.
 * @param specifier - The specifier of the dependent module.
 * @param definitions - The module definitions.
 * @yields The resolved dependencies.
 */
function* resolveDependenciesFormDefinitionsFor<Specifier extends string>(
  specifier: Specifier,
  definitions: Record<Specifier, { dependencies?: Specifier[] } | object>,
): Generator<string> {
  if (
    definitions[specifier] &&
    'dependencies' in definitions[specifier] &&
    Array.isArray(definitions[specifier].dependencies)
  ) {
    for (const dependency of definitions[specifier].dependencies) {
      yield dependency;
      yield* resolveDependenciesFormDefinitionsFor(dependency, definitions);
    }
  }
}

/**
 * Returns a map of module specifiers to their resolved paths.
 *
 * @template Specifier - The module specifier type.
 * @param definitions - The module definitions.
 * @returns The resolved module paths map.
 */
function resolveModulePathsFromDefinitions<Specifier extends string>(
  definitions: Record<Specifier, { override?: string } | object>,
): Record<Specifier, string> {
  const entries: Partial<Record<Specifier, string>> = {};
  for (const specifier of Object.keys(definitions)) {
    entries[specifier] = path.relative(
      absoluteProjectRootPath,
      'override' in definitions[specifier] &&
        typeof definitions[specifier].override === 'string'
        ? path.resolve(
            fileURLToPath(import.meta.resolve(specifier)),
            definitions[specifier].override,
          )
        : fileURLToPath(import.meta.resolve(specifier)),
    );
  }
  return entries as Record<Specifier, string>;
}

/**
 * Returns a map of module specifiers to their resolved module and dependencies paths.
 *
 * @template Specifier - The module specifier type.
 * @param definitions - The module definitions.
 * @param paths - The module paths map.
 * @returns The resolved module and dependencies paths map.
 */
function resolveModuleDependencyPathsFromDefinitions<Specifier extends string>(
  definitions: Record<Specifier, { dependencies?: Specifier[] } | object>,
  paths: Record<Specifier, string>,
): Record<Specifier, string[]> {
  const entries: Partial<Record<Specifier, string[]>> = {};
  for (const specifier of Object.keys(definitions)) {
    entries[specifier] = [
      ...new Set([
        specifier,
        ...resolveDependenciesFormDefinitionsFor(specifier, moduleDefinitions),
      ]),
    ].map((dependency) => paths[dependency]);
  }
  return entries as Record<Specifier, string[]>;
}
