import '@ocap/shims/endoify';
import bundleSource from '@endo/bundle-source';
import { writeFile } from 'fs/promises';

import { resolve } from './lib.mjs';

main(resolve('vat.js'), resolve('vat.bundle')).catch(console.error);

/**
 *
 * @param source
 * @param target
 */
async function main(source, target) {
  console.log('bundleSource', bundleSource);
  const bundle = await bundleSource(source);
  const bundleString = JSON.stringify(bundle);
  await writeFile(target, bundleString);
  console.log(`wrote ${target}: ${new Blob([bundleString]).size} bytes`);
}
