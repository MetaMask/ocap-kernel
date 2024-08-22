import 'ses';
import '@endo/lockdown/commit.js';

import bundleSource from '@endo/bundle-source';
import { copyFile, mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { rimraf } from 'rimraf';
import { fileURLToPath } from 'url';

console.log('Bundling shims...');

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const src = path.resolve(rootDir, 'src');
const dist = path.resolve(rootDir, 'dist');
const fileNames = {
  endoify: 'endoify.mjs',
  eventualSend: 'eventual-send.mjs',
  applyLockdown: 'apply-lockdown.mjs',
};

await mkdir(dist, { recursive: true });
await rimraf(`${dist}/*`);

for (const fileName of [fileNames.endoify, fileNames.applyLockdown]) {
  await copyFile(path.resolve(src, fileName), path.resolve(dist, fileName));
}

const eventualSendSourcePath = fileURLToPath(
  import.meta.resolve('@endo/eventual-send/shim.js'),
);

const { source: eventualSendBundleSource } = await bundleSource(
  eventualSendSourcePath,
  { format: 'endoScript' },
);

await writeFile(
  path.resolve(dist, fileNames.eventualSend),
  eventualSendBundleSource,
);

console.log('Success!');
