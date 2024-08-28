import 'ses';
import '@endo/lockdown/commit.js';

import bundleSource from '@endo/bundle-source';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { rimraf } from 'rimraf';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';

console.log('Bundling shims...');

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const src = path.resolve(rootDir, 'src');
const dist = path.resolve(rootDir, 'dist');

await mkdir(dist, { recursive: true });
await rimraf(`${dist}/*`, { glob: true });

/**
 * Bundles the target file as endoScript and returns the content as a readable stream.
 *
 * @param {string} specifier - Import path to the file to bundle, e.g. `'@endo/eventual-send/shim.js'`.
 * @returns {Promise<Readable>} The bundled file contents as a Readable stream.
 */
const createEndoBundleReadStream = async (specifier) => {
  const filePath = fileURLToPath(import.meta.resolve(specifier));
  const { source: bundle } = await bundleSource(filePath, {
    format: 'endoScript',
  });
  return Readable.from(bundle);
};

const sources = {
  ses: createReadStream(
    path.resolve(rootDir, '../../node_modules/ses/dist/ses.mjs'),
  ),
  eventualSend: await createEndoBundleReadStream('@endo/eventual-send/shim.js'),
  shim: createReadStream(path.resolve(src, 'endoify.js')),
};

const target = createWriteStream(path.resolve(dist, 'endoify.js'));

sources.ses.pipe(target, { end: false });
sources.ses.on('end', () => sources.eventualSend.pipe(target, { end: false }));
sources.eventualSend.on('end', () => sources.shim.pipe(target, { end: true }));
sources.shim.on('end', () => console.log('Success!'));
