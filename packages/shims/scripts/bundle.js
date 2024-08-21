import 'ses';
import '@endo/lockdown/commit.js';

import bundleSource from '@endo/bundle-source';
import { mkdir } from 'fs/promises';
import path from 'path';
import { rimraf } from 'rimraf';
import { fileURLToPath } from 'url';
import { createReadStream, createWriteStream } from 'fs';
import { Readable } from 'stream';

console.log('Bundling shims...');

const rootDir = path.resolve(import.meta.dirname, '..');
const src = path.resolve(rootDir, 'src');
const dist = path.resolve(rootDir, 'dist');

await mkdir(dist, { recursive: true });
await rimraf(`${dist}/*`, { glob: true });

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

const sources = [
  createReadStream(path.resolve(rootDir, '../../node_modules/ses/dist/ses.mjs')),
  await createEndoBundleReadStream('@endo/eventual-send/shim.js'),
  createReadStream(path.resolve(src, 'endoify.mjs')),
];

const target = createWriteStream(path.resolve(dist, 'endoify.mjs'));

sources[0].pipe(target, { end: false });
sources[0].on('end', () => sources[1].pipe(target, { end: false }));
sources[1].on('end', () => sources[2].pipe(target, { end: true }));
sources[2].on('end', () => console.log('Success!'));
