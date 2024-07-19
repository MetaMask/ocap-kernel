import 'ses';
import '@endo/lockdown/commit.js';

import { copyFile } from 'fs/promises';
import { mkdirp } from 'mkdirp';
import path from 'path';
// import bundleSource from '@endo/bundle-source';
import { rimraf } from 'rimraf';

console.log('Bundling shims...')

const rootDir = path.resolve(import.meta.dirname, '..');
const shimsSrc = path.resolve(rootDir, 'src/shims');
const shimsDist = path.resolve(rootDir, 'dist/shims');

// const eventualSendSrc = path.resolve(rootDir, '../../node_modules/@endo/eventual-send/shim.js');

const fileNames = {
  lockdown: 'apply-lockdown.mjs',
  eventualSend: 'eventual-send.mjs',
};

await mkdirp(shimsDist);
await rimraf(`${shimsDist}/*`);

await copyFile(
  path.resolve(shimsSrc, fileNames.lockdown),
  path.resolve(shimsDist, fileNames.lockdown),
);
await copyFile(
  path.resolve(shimsSrc, fileNames.eventualSend),
  path.resolve(shimsDist, fileNames.eventualSend),
);

// const { source } = await bundleSource(eventualSendSrc, { format: 'endoScript' });

console.log('Success!')
