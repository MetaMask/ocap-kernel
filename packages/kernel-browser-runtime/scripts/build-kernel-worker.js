// @ts-check

import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

// We will only run this where it's available, but ESLint doesn't know that
// eslint-disable-next-line n/no-unsupported-features/node-builtins
const rootDir = path.resolve(import.meta.dirname, '..');
const endoify = path.resolve(rootDir, '../kernel-shims/dist/endoify.js');
const outfile = path.resolve(rootDir, 'dist/kernel-worker/index.mjs');

await build({
  entryPoints: ['./src/kernel-worker/index.ts'],
  outfile,
  // Prepend the endoify shim to the output file
  banner: {
    js: await fs.readFile(endoify, 'utf8'),
  },
  sourcemap: 'inline',
  minify: true,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  // This file is dynamically imported in Node.js only
  external: ['*/gc-engine.ts'],
});
