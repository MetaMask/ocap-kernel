import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Vat providing Monotony As A Service (MaaS). It just keeps relentlessly counting up. It's very boring.
 *
 * Monotonicity: a consistent pattern of always increasing.
 * Monotony: a lack of variety or a tedious sameness.
 * It really could be either.
 *
 * @param {unknown} _vatPowers - Special powers granted to this vat (not used here).
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} baggage - Root of vat's persistent state.
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters, baggage) {
  const name = parameters?.name ?? 'anonymous';
  console.log(`buildRootObject "${name}"`);
  if (baggage.has('url')) {
    const url = baggage.get('url');
    console.log(`URL for MaaS: ${url}`);
  } else {
    console.log(`URL for MasS not yet initialized`);
  }

  const myself = makeDefaultExo('root', {
    async bootstrap(_vats, services) {
      console.log(`vat ${name} is bootstrap`);
      const issuer = services.ocapURLIssuerService;
      if (!issuer) {
        console.log(`no ocapURLIssuerService found`);
        throw Error(`MaaS requires an ocap URL issuer`);
      }
      const url = await E(issuer).issue(myself);
      console.log(`URL for MaaS: ${url}`);
      baggage.init('url', url);
      baggage.init('count', 1);
      return url;
    },
    getUrl() {
      return baggage.get('url');
    },
    next(from) {
      const count = baggage.get('count');
      baggage.set('count', count + 1);
      console.log(
        `vat ${name} got 'next' request from ${from}, returning ${count}`,
      );
      return count;
    },
  });
  return myself;
}
