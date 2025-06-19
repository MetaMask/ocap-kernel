import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

/**
 * Build function for vats that will run various tests.
 *
 * @param {object} vatPowers - Special powers granted to this vat.
 * @returns {*} The root object for the new vat.
 */
export function buildRootObject(vatPowers) {
  const { log } = vatPowers.logger.subLogger({ tags: ['test'] });
  return Far('root', {
    async bootstrap({ provider }) {
      const [gate, revoker] = await E(provider).requestPlatform();
      await E(gate).foo().then(log);
      await E(gate).bar().then(log);
      await E(revoker).slam();
      // XXX Methods called on a revoked object should reject, but currently
      // resolve with a 'revoked object' string.
      await E(gate).foo().catch(log);
      log('done');
    },
  });
}
