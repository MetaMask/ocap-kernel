import path from 'path';

export const sourceDir = './src';
export const buildDir = path.resolve(sourceDir, '../dist');

export const jsTrustedPreludes = {
  background: path.resolve(sourceDir, 'background-trusted-prelude.js'),
  'kernel-worker': path.resolve(sourceDir, 'kernel-worker-trusted-prelude.js'),
};
