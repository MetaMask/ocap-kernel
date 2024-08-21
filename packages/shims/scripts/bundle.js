import 'ses';
import '@endo/lockdown/commit.js';

import bundleSource from '@endo/bundle-source';
import { copyFile, mkdir } from 'fs/promises';
import path from 'path';
import { rimraf } from 'rimraf';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';

console.log('Bundling shims...');

const rootDir = path.resolve(import.meta.dirname, '..');
const src = path.resolve(rootDir, 'src');
const dist = path.resolve(rootDir, 'dist');
const fileNames = {
  endoify: 'endoify.mjs',
  eventualSend: 'eventual-send.mjs',
  applyLockdown: 'apply-lockdown.mjs',
};

await mkdir(dist, { recursive: true });
await rimraf(`${dist}/*`, { glob: true });

for (const fileName of [fileNames.endoify, fileNames.applyLockdown]) {
  await copyFile(path.resolve(src, fileName), path.resolve(dist, fileName));
}

/**
 * Bundles the target file as endoScript and returns the content as a readable stream
 * 
 * @param {string} specifier - import path to the file to bundle, e.g. '@endo/eventual-send/shim.js'
 * @returns {Promise<Readable>}
 */
const createEndoBundleReadStream = async (specifier) => {
  const filePath = fileURLToPath(import.meta.resolve(specifier));
  const { source: bundle } = await bundleSource(filePath, { format: 'endoScript' });
  return Readable.from(bundle);
}

const eSendBundle = await createEndoBundleReadStream('@endo/eventual-send/shim.js');
const eSendOutput = createWriteStream(path.resolve(dist, fileNames.eventualSend));

eSendBundle.pipe(eSendOutput);
eSendBundle.on('end', () => console.log('Success!'));
