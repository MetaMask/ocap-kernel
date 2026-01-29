// @ts-check

import 'ses';
import '@endo/lockdown/commit.js';

import bundleSource from '@endo/bundle-source';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rimraf } from 'rimraf';

console.log('Bundling shims...');

const shims = ['endoify.js', 'endoify-repair.js', 'eventual-send.js'];

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const srcDir = path.resolve(rootDir, 'src');
const distDir = path.resolve(rootDir, 'dist');

await mkdir(distDir, { recursive: true });
await rimraf(`${distDir}/*`, { glob: true });

await Promise.all(
  shims.map(async (shim) => {
    const { source } = await bundleSource(path.resolve(srcDir, shim), {
      format: 'endoScript',
    });
    await writeFile(path.resolve(distDir, shim), source);
  }),
);

// Copy endoify-node.js (not bundled - imports peer dependency @libp2p/webrtc)
await copyFile(
  path.resolve(srcDir, 'endoify-node.js'),
  path.resolve(distDir, 'endoify-node.js'),
);

console.log('Success!');
