// @ts-check
// eslint-disable-next-line spaced-comment
/// <reference types="vitest"/>

/* eslint-disable jsdoc/valid-types, import/namespace */
import path from 'path';
import { defineConfig } from 'vite';

/**
 * Get the default vitest config. See https://vitest.dev/config/ for details.
 * @param {string} projectRoot - The vite project root directory.
 * @returns {import('vite').UserConfig} The default vitest config.
 */
export const getDefaultConfig = (projectRoot = './src') =>
  defineConfig({
    root: projectRoot,

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
    },
  });
