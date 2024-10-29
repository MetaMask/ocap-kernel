// @ts-check

import 'ses';
import '@endo/lockdown/commit.js';

import bundleSource from '@endo/bundle-source';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rimraf } from 'rimraf';

console.log('Bundling shims...');

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const srcDir = path.resolve(rootDir, 'src');
const distDir = path.resolve(rootDir, 'dist');
const shim = 'endoify.js';

await mkdir(distDir, { recursive: true });
await rimraf(`${distDir}/*`, { glob: true });

const { source } = await bundleSource(path.resolve(srcDir, shim), {
  format: 'endoScript',
});
await writeFile(path.resolve(distDir, shim), source);

console.log('Success!');
