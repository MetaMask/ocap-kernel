// @ts-check

import path from 'path';

const dirname = path.dirname(new URL(import.meta.url).pathname);
export const rootDir = path.resolve(dirname, '../..');
const extensionDir = path.resolve(rootDir, 'extension');
export const sourceDir = path.resolve(extensionDir, 'src');
export const outDir = path.resolve(extensionDir, 'dist');
export const kernelBrowserRuntimeSrcDir = path.resolve(
  rootDir,
  'kernel-browser-runtime/src',
);

/**
 * @type {import('@ocap/repo-tools').PreludeRecord}
 */
export const trustedPreludes = {
  background: {
    path: path.resolve(sourceDir, 'env/background-trusted-prelude.js'),
  },
  'kernel-worker': { content: "import './endoify.js';" },
};
