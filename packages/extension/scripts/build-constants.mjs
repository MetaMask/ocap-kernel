import path from 'path';

export const sourceDir = './src';
export const buildDir = path.resolve(sourceDir, '../dist');

export const trustedPreludes = {
  background: path.resolve(sourceDir, 'ses/background-trusted-prelude.js'),
  'kernel-worker': path.resolve(
    sourceDir,
    'ses/kernel-worker-trusted-prelude.js',
  ),
};
