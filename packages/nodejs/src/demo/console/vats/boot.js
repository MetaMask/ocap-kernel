import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

import { makeLogger } from '../../../../dist/demo/logger.mjs';
import { makeVatStreamReader } from '../../../../dist/demo/stream.mjs';

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

  return Far('root', {
    async bootstrap(vats) {
      display('Bootstrap');

      display('Pinging');

      const makeStreamReader = makeVatStreamReader(vats.asyncGenerator);

      const ping = await E(vats.asyncGenerator).ping();
      logger.debug('ping:', ping);

      const counter0 = await E(vats.asyncGenerator).makeCounter(0, 100);
      const counter1 = await E(vats.asyncGenerator).makeCounter(100, 500);
      const counterReader0 = makeStreamReader(counter0);
      const counterReader1 = makeStreamReader(counter1);

      const readCounter = async (counterReader, max, counterId) => {
        for await (const count of counterReader) {
          if (count >= max) {
            display(`stopping @ ${count}`);
            await E(vats.asyncGenerator).stop(counterId);
            display(`stopped @ ${count}`);
            return;
          }
          display(count);
        }
      }

      await Promise.all([
        readCounter(counterReader0, 10, counter0),
        readCounter(counterReader1, 103, counter1),
      ]);

      display('Initialized');

      display('Done');
    },
  });
}
