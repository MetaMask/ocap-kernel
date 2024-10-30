import path from 'path';

export const sourceDir = './src';
export const buildDir = path.resolve(sourceDir, '../dist');

export const trustedPreludes = {
  background: path.resolve(sourceDir, 'env/background-trusted-prelude.js'),
  'kernel-worker': path.resolve(
    sourceDir,
    'env/kernel-worker-trusted-prelude.js',
  ),
};
