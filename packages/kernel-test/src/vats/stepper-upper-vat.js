import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for MaaS consumer.
 *
 * @param {unknown} _vatPowers - Special powers granted to this vat (not used here).
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} baggage - Root of vat's persistent state.
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters, baggage) {
  const name = parameters?.name ?? 'anonymous';
  console.log(`buildRootObject "${name}"`);

  return makeDefaultExo('root', {
    async bootstrap(_vats, services) {
      console.log(`vat ${name} is bootstrap`);
      const redeemer = services.ocapURLRedemptionService;
      if (!redeemer) {
        console.log('no ocapURLRedemptionService found');
        throw Error('ocapURLRedemptionService not available');
      }
      baggage.init('redeemer', redeemer);
    },
    async setMaas(url) {
      console.log(`@@@@ setMaas ${url}`);
      if (!baggage.has('redeemer')) {
        console.log('@@@@ ocapURLRedemptionService not available');
        throw Error('ocapURLRedemptionService not available');
      }
      const redeemer = baggage.get('redeemer');
      const maas = await E(redeemer).redeem(url);
      if (!maas) {
        console.log(`@@@@ unable to redeem ${url}`);
        throw Error(`unable to redeem ${url}`);
      }
      if (baggage.has('maas')) {
        baggage.set('maas', maas);
      } else {
        baggage.init('maas', maas);
      }
      baggage.init('previous', 0);
      const result = `MaaS service URL set to ${url}`;
      console.log(result);
      return result;
    },
    async step() {
      if (!baggage.has('maas')) {
        const message = 'MaaS service address not set';
        console.log(message);
        throw Error(message);
      }
      const maas = baggage.get('maas');
      const next = await E(maas).next(name);
      const previous = baggage.get('previous');
      const result = `next step: ${next} (last seen was ${previous})`;
      console.log(result);
      baggage.set('previous', next);
      return result;
    },
  });
}
