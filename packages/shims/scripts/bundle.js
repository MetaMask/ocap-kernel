import 'ses';
import '@endo/lockdown/commit.js';
import { createReadStream, createWriteStream } from 'fs';
// TODO: Bundle the eventual send shim using bundle-source after the next endo release.
// import bundleSource from '@endo/bundle-source';
import { mkdirp } from 'mkdirp';
import path from 'path';
import { rimraf } from 'rimraf';

console.log('Bundling shims...');

const rootDir = path.resolve(import.meta.dirname, '..');
const repoNodeModules = path.resolve(rootDir, '../../node_modules');
const pkgSrc = path.resolve(rootDir, 'src');
const pkgDist = path.resolve(rootDir, 'dist');
const srcPaths = [
  path.resolve(repoNodeModules, 'ses/dist/ses.mjs'),
  path.resolve(pkgSrc, 'eventual-send.mjs'),
  path.resolve(pkgSrc, 'endoify-footer.mjs'),
];

// const eventualSendSrc = path.resolve(rootDir, '../../node_modules/@endo/eventual-send/shim.js');
// const { eventualSendSrcBundled } = await bundleSource(eventualSendSrc, { format: 'endoScript' });

await mkdirp(pkgDist);
await rimraf(`${pkgDist}/*`);

const srcStreams = srcPaths.map((filePath) => createReadStream(filePath));
const distStream = createWriteStream(path.resolve(pkgDist, 'endoify.mjs'));

// tell the src streams to begin piping their next when they end
srcStreams[0].on('end', () => srcStreams[1].pipe(distStream, { end: false }));
srcStreams[1].on('end', () => srcStreams[2].pipe(distStream, { end: true }));
srcStreams[2].on('end', () => console.log('Success!'));

// start by piping the first src stream
srcStreams[0].pipe(distStream, { end: false });
