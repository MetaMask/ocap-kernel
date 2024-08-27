import 'ses';
import '@endo/lockdown/commit.js';

import bundleSource from '@endo/bundle-source';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rimraf } from 'rimraf';

import endoScriptIdentifierTransformPlugin from './helpers/rollup-plugin-endo-script-identifier-transform.js';

console.log('Bundling shims...');

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const dist = path.resolve(rootDir, 'dist');

await mkdir(dist, { recursive: true });
await rimraf(`${dist}/*`, { glob: true });

for (const [name, specifier] of Object.entries({
  endoify: path.resolve('src', 'endoify.js'),
})) {
  const outputPath = path.resolve(dist, `${name}.js`);
  const sourcePath = fileURLToPath(import.meta.resolve(specifier));

  let { source } = await bundleSource(sourcePath, { format: 'endoScript' });

  if (!process.argv.includes('--without-rollup-transform')) {
    source = endoScriptIdentifierTransformPlugin({
      scopedRoot: path.resolve(rootDir, '../..'),
    }).transform(source, specifier).code;
  }

  await writeFile(outputPath, source);
}

console.log('Success!');
