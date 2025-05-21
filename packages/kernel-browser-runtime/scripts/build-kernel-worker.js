// @ts-check

import { build } from 'esbuild';
import hasFlag from 'has-flag';
import fs from 'node:fs/promises';
import path from 'node:path';

const isDev = hasFlag('dev') || hasFlag('development');

// We will only run this where it's available, but ESLint doesn't know that
// eslint-disable-next-line n/no-unsupported-features/node-builtins
const rootDir = path.resolve(import.meta.dirname, '..');
const endoifyFile = path.resolve(rootDir, '../kernel-shims/dist/endoify.js');
const outDir = path.resolve(rootDir, 'dist/kernel-worker');
const outfile = path.resolve(outDir, 'index.mjs');

await fs.rm(outDir, { recursive: true, force: true });

await build({
  entryPoints: [path.resolve(rootDir, 'src/kernel-worker/index.ts')],
  outfile,
  // Prepend the endoify shim to the output file
  banner: {
    js: await fs.readFile(endoifyFile, 'utf8'),
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  tsconfig: path.resolve(rootDir, 'tsconfig.build.json'),
  minify: !isDev,
  sourcemap: isDev ? 'inline' : false,
  // This file is dynamically imported in the ocap-kernel package in Node.js only
  external: ['./gc-engine.mjs'],
});

// @sqlite.org/sqlite-wasm fetches certain files at runtime, and esbuild doesn't copy
// them to the output directory
const sqlite3Dir = path.resolve(
  rootDir,
  '../../node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm',
);

const sqlite3Files = ['sqlite3-opfs-async-proxy.js', 'sqlite3.wasm'];

await Promise.all(
  sqlite3Files.map((file) =>
    fs.copyFile(path.resolve(sqlite3Dir, file), path.resolve(outDir, file)),
  ),
);
