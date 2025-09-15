import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build a root object for a vat that uses the fetch capability.
 *
 * @param {object} vatPowers - The powers of the vat.
 * @param {object} vatPowers.logger - The logger for the vat.
 * @returns {Promise<object>} The root object.
 */
export async function buildRootObject(vatPowers) {
  const logger = vatPowers.logger.subLogger({
    tags: ['test', 'endowment-user'],
  });
  const tlog = (...args) => logger.log(...args);

  tlog('buildRootObject');

  const root = makeDefaultExo('root', {
    bootstrap: () => {
      tlog('bootstrap');
    },
    hello: async (url) => {
      try {
        const response = await fetch(url);
        const text = await response.text();
        tlog(`response: ${text}`);
        return text;
      } catch (error) {
        tlog(`error: ${error}`);
        throw error;
      }
    },
  });

  return root;
}
