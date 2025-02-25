import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

import { makeLogger } from '../../../../dist/demo/logger.mjs';

/**
 * Build function for the LLM test vat.
 *
 * @param {unknown} _vatPowers - Special powers granted to this vat (not used here).
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} _baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters, _baggage) {
  const { verbose } = parameters;

  const logger = makeLogger({ label: 'boot', verbose });

  const displayWithBanner = (title, content) => {
    const sep = ''.padStart(title.length, '-');
    logger.log(`\n${sep}\n${title.toUpperCase()}: ${content}\n${sep}\n`);
  };

  const display = (content) => displayWithBanner('demo', content);

  const makeCounterReader = (vat, id) => {
    const counterReader = {
      async next() {
        return await E(vat).next(id);
      },
      async throw(error) {
        return await E(vat).throw(id, error);
      },
      async return(value) {
        return await E(vat).return(id, value);
      },
      [Symbol.asyncIterator]: () => counterReader,
    }
    return harden(counterReader);
  }

  return Far('root', {
    async bootstrap(vats) {
      display('Bootstrap');

      display('Pinging');

      const ping = await E(vats.asyncGenerator).ping();
      logger.debug('ping:', ping);

      const counter0 = await E(vats.asyncGenerator).makeCounter(0, 100);
      const counter1 = await E(vats.asyncGenerator).makeCounter(100, 500);
      const cr0 = makeCounterReader(vats.asyncGenerator, counter0);
      const cr1 = makeCounterReader(vats.asyncGenerator, counter1);

      const readCounter = async (counter, max, crId) => {
        for await (const count of counter) {
          if (count >= max) {
            display(`stopping @ ${count}`);
            await E(vats.asyncGenerator).stop(crId);
            display(`stopped @ ${count}`);
            break;
          }
          display(count);
        }
      }

      await Promise.all([
        readCounter(cr0, 10, counter0),
        readCounter(cr1, 103, counter1),
      ]);

      display('Initialized');

      display('Done');
    },
  });
}
