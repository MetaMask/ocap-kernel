// @ts-check

import 'ses';
import '@endo/lockdown/commit.js';

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rimraf } from 'rimraf';

import { generateEndoScriptBundle } from './helpers/generate-endo-script-bundle.js';

console.log('Bundling shims...');

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const srcDir = path.resolve(rootDir, 'src');
const distDir = path.resolve(rootDir, 'dist');
const argv = Object.freeze([...process.argv]);

await mkdir(distDir, { recursive: true });
await rimraf(`${distDir}/*`, { glob: true });

await generateEndoScriptBundle(
  path.resolve(srcDir, 'endoify.js'),
  path.resolve(distDir, `endoify.js`),
  { argv },
);

console.log('Success!');
