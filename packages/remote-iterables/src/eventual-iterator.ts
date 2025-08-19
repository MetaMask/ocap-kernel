// This type is used in the docs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { makeFarGenerator } from './far-generator.ts';
import { makeRefIterator } from './ref-reader.ts';

/**
 * Make an iterator from a remote generator. Intended to be used in conjunction
 * with {@link makeFarGenerator}. This is the consuming end of the pair.
 *
 * Enables async iterator syntax like below.
 * ```ts
 * const eventualIterator = makeEventualIterator(remoteGeneratorRef);
 * for await (const value of eventualIterator) {
 *   console.log(`A faraway vat yielded: ${value}`);
 * }
 * ```
 *
 * @param iteratorRef - The remotable presence to make an iterator from.
 * @returns An iterator that wraps the remotable presence, enabling async iterator syntax.
 */
export const makeEventualIterator = makeRefIterator;
