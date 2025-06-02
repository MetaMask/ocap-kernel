// @ts-check

import path from 'path';

export const sourceDir = './src';
export const buildDir = path.resolve(sourceDir, '../dist');

/**
 * @type {import('@ocap/vite-plugins').PreludeRecord}
 */
export const trustedPreludes = {
  background: {
    path: path.resolve(sourceDir, 'env/background-trusted-prelude.js'),
  },
};
