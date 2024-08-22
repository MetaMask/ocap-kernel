import 'ses';
import '@endo/lockdown/commit.js';

import bundleSource from '@endo/bundle-source';
import { createWriteStream } from 'fs';
import { copyFile, mkdir } from 'fs/promises';
import path from 'path';
import { rimraf } from 'rimraf';
import { Readable } from 'stream';
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

for (const fileName of [fileNames.endoify, fileNames.applyLockdown]) {
  await copyFile(path.resolve(src, fileName), path.resolve(dist, fileName));
}

const source = await createEndoBundleReadStream('@endo/eventual-send/shim.js');
const target = createWriteStream(path.resolve(dist, fileNames.eventualSend));

source.pipe(target);
source.on('end', () => console.log('Success!'));
