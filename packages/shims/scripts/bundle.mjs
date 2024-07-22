import 'ses';
import '@endo/lockdown/commit.js';

import { copyFile } from 'fs/promises';
import { mkdirp } from 'mkdirp';
import path from 'path';
// import bundleSource from '@endo/bundle-source';
import { rimraf } from 'rimraf';

console.log('Bundling shims...');

const rootDir = path.resolve(import.meta.dirname, '..');
const src = path.resolve(rootDir, 'src');
const dist = path.resolve(rootDir, 'dist');

// const eventualSendSrc = path.resolve(rootDir, '../../node_modules/@endo/eventual-send/shim.js');

const fileNames = {
  endoify: 'endoify.mjs',
  eventualSend: 'eventual-send.mjs',
  lockdown: 'apply-lockdown.mjs',
};

await mkdirp(dist);
await rimraf(`${dist}/*`);

for (const fileName of Object.values(fileNames)) {
  await copyFile(path.resolve(src, fileName), path.resolve(dist, fileName));
}

// const { source } = await bundleSource(eventualSendSrc, { format: 'endoScript' });

console.log('Success!');
