// @ts-check

import path from 'node:path';

const dirname = path.dirname(new URL(import.meta.url).pathname);
const packagesDir = path.resolve(dirname, '../..');
const extensionDir = path.resolve(packagesDir, 'extension');

export const sourceDir = path.resolve(extensionDir, 'src');
export const outDir = path.resolve(extensionDir, 'dist');
export const kernelBrowserRuntimeSrcDir = path.resolve(
  packagesDir,
  'kernel-browser-runtime/src',
);

/**
 * @type {import('@ocap/repo-tools/vite-plugins').PreludeRecord}
 */
export const trustedPreludes = {
  background: {
    path: path.resolve(sourceDir, 'env/background-trusted-prelude.js'),
  },
  'kernel-worker': { content: "import './endoify.js';" },
};
