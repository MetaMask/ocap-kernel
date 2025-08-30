import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import {
  makeEventualIterator,
  makeRemoteGenerator,
} from '@ocap/remote-iterables';

/**
 * Build function for testing async generators.
 *
 * @param {object} vatPowers - The powers of the vat.
 * @param {object} vatPowers.logger - The logger to use.
 * @param {object} parameters - The parameters of the vat.
 * @param {string} parameters.name - The name of the vat.
 * @returns {object} The root object for the vat.
 */
export function buildRootObject({ logger }, { name }) {
  const tlogger = logger.subLogger({ tags: ['test', name] });
  const tlog = (...args) => tlogger.log(...args);

  tlog(`${name} buildRootObject`);

  return makeDefaultExo('root', {
    async bootstrap({ consumer, producer }, _services) {
      tlog(`${name} is bootstrap`);
      await E(consumer).iterate(producer);
    },

    generate: async (stop) =>
      makeRemoteGenerator(
        (async function* () {
          for (let i = 0; i < stop; i++) {
            tlog(`${name} generating ${i}`);
            yield i;
          }
          // Note the IIFE.
        })(),
      ),

    iterate: async (producer) => {
      const remoteGenerator = await E(producer).generate(5);
      for await (const value of makeEventualIterator(remoteGenerator)) {
        tlog(`${name} iterating ${value}`);
      }
    },
  });
}
