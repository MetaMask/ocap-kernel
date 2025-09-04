/**
 * Cribbed:
 * - reader-ref.ts from [@endo/daemon](https://github.com/endojs/endo/blob/master/packages/daemon/reader-ref.js)
 * - ref-reader.ts from [@endo/daemon](https://github.com/endojs/endo/blob/master/packages/daemon/ref-reader.js)
 *
 * The github source gives the appearance that these are exported from the daemon package, but npm does not.
 */
export { makeEventualIterator } from './eventual-iterator.ts';
export { makeExoGenerator } from './exo-generator.ts';
