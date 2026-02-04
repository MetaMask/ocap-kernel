import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import { makeEventualIterator, makeExoGenerator } from '@ocap/remote-iterables';

import { unwrapTestLogger } from '../test-powers.ts';
import type { TestPowers } from '../test-powers.ts';

/**
 * Build function for testing async generators.
 *
 * @param vatPowers - The powers of the vat.
 * @param vatPowers.logger - The logger to use.
 * @param parameters - The parameters of the vat.
 * @param parameters.name - The name of the vat.
 * @returns The root object for the vat.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject(
  vatPowers: TestPowers,
  { name }: { name: string },
) {
  const tlog = unwrapTestLogger(vatPowers, name);

  tlog(`${name} buildRootObject`);

  return makeDefaultExo('root', {
    async bootstrap(
      { consumer, producer }: { consumer: unknown; producer: unknown },
      _services: unknown,
    ) {
      tlog(`${name} is bootstrap`);
      await E(consumer).iterate(producer);
    },

    generate: async (stop: number) =>
      makeExoGenerator(
        (async function* () {
          for (let i = 0; i < stop; i++) {
            tlog(`${name} generating ${i}`);
            yield i;
          }
          // Note the IIFE.
        })(),
      ),

    iterate: async (producer: unknown) => {
      const remoteGenerator = await E(producer).generate(5);
      for await (const value of makeEventualIterator(remoteGenerator)) {
        tlog(`${name} iterating ${String(value)}`);
      }
    },
  });
}
