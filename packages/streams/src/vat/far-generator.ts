import { E } from '@endo/far';
import type { FarRef } from '@endo/far';
import { makePipe } from '@endo/stream';
import type { Writer, Reader } from '@endo/stream';

import { makeIteratorRef } from './reader-ref.ts';

/**
 * Make a FarRef for a generator.
 *
 * @param generator - The generator to make a FarRef for.
 * @returns A FarRef for the generator.
 */
export const makeFarGenerator = <Item>(
  generator: AsyncGenerator<Item>,
): FarRef<AsyncIterator<Item>> => {
  const [writer, reader] = makePipe<Item>() as unknown as [
    Writer<Item>,
    Reader<Item>,
  ];
  (async () => {
    for await (const value of generator) {
      await E(writer).next(value);
    }
    await E(writer).return(undefined);
  })().catch(async (error) => E(writer).throw(error));
  return makeIteratorRef<Item>(reader);
};
