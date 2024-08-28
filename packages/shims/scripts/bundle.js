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
const srcDir = path.resolve(rootDir, 'src');
const distDir = path.resolve(rootDir, 'dist');

await mkdir(distDir, { recursive: true });
await rimraf(`${distDir}/*`, { glob: true });

for (const [name, specifier] of Object.entries({
  endoify: path.resolve(srcDir, 'endoify.js'),
})) {
  const outputPath = path.resolve(distDir, `${name}.js`);
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
