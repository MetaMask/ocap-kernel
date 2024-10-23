// @ts-check
// eslint-disable-next-line spaced-comment
/// <reference types="vitest"/>

import path from 'path';
import { defineConfig } from 'vite';
import tsconfigPathsPlugin from 'vite-tsconfig-paths';

/**
 * Get the default vitest config. See https://vitest.dev/config/ for details.
 *
 * @param {string} projectRoot - The vite project root directory.
 * @returns {import('vite').UserConfig} The default vitest config.
 */
export const getDefaultConfig = (projectRoot = './src') =>
  defineConfig({
    root: projectRoot,

    plugins: [
      // Resolve imports using the "paths" property of the relevant tsconfig.json,
      // if possible.
      tsconfigPathsPlugin(),
    ],

    test: {
      environment: 'jsdom',
      restoreMocks: true,
      coverage: {
        enabled: true,
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        reportsDirectory: path.resolve(projectRoot, '../coverage'),
        thresholds: {
          100: true,
        },
      },
      reporters: ['basic'],
      silent: true,
      testTimeout: 2000,
    },
  });
