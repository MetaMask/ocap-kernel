/**
 * Cribbed:
 * - reader-ref.ts from [@endo/daemon](https://github.com/endojs/endo/blob/master/packages/daemon/reader-ref.js)
 * - ref-reader.ts from [@endo/daemon](https://github.com/endojs/endo/blob/master/packages/daemon/ref-reader.js)
 *
 * The github source gives the appearance that these are exported from the daemon package, but npm does not.
 */
export { makeRefIterator as makeEventualIterator } from './ref-reader.ts';
export { makeFarGenerator } from './far-generator.ts';
