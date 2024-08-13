import 'ses';
import '@endo/lockdown/commit.js';

import bundleSource from '@endo/bundle-source';
import { mkdirp } from 'mkdirp';
import { copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// TODO: Bundle the eventual send shim using bundle-source after the next endo release.
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

const resolvedModulePaths = {
  ses: fileURLToPath(await import.meta.resolve('ses')),
  eventualSend: fileURLToPath(
    await import.meta.resolve('@endo/eventual-send/shim.js'),
  ),
};

// console.log('Resolved module paths:', resolvedModulePaths);

await mkdirp(dist);
await rimraf(`${dist}/*`);

for (const fileName of Object.values(fileNames)) {
  await copyFile(path.resolve(src, fileName), path.resolve(dist, fileName));
}

const eventualSendSourcePath = resolvedModulePaths.eventualSend;
const { source: eventualSendBundleSource } = await bundleSource(
  eventualSendSourcePath,
  { format: 'endoScript' },
);
await writeFile(
  path.resolve(dist, fileNames.eventualSend),
  eventualSendBundleSource,
);

console.log('Success!');
