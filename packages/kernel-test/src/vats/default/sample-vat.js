import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for generic test vat.
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
    async bootstrap(vats, services) {
      console.log(`vat ${name} is bootstrap`);
      const issuer = services.ocapURLIssuerService;
      const redeemer = services.ocapURLRedemptionService;
      baggage.init('redeemer', redeemer);
      console.log(`in bootstrap redeemer=${redeemer}`);
      if (issuer) {
        const url = await E(issuer).issue(vats.bob);
        console.log(`url for bob: ${url}`);
      } else {
        console.log(`no ocapURLIssuerService found`);
      }
      const pb = E(vats.bob).hello(name);
      const pc = E(vats.carol).hello(name);
      console.log(`vat ${name} got "hello" answer from Bob: '${await pb}'`);
      console.log(`vat ${name} got "hello" answer from Carol: '${await pc}'`);
    },
    hello(from) {
      const message = `vat ${name} got "hello" from ${from}`;
      console.log(message);
      return message;
    },
    async doRunRun(url) {
      const redeemer = baggage.get('redeemer');
      console.log(`in doRunRun loaded redeemer=${redeemer}`);
      if (redeemer) {
        const remote = await E(redeemer).redeem(url);
        console.log(`redeemed ${url} successfully (?)`);
        await E(remote).hello(`remote ${name}`);
      } else {
        console.log('no ocapURLRedemptionService found');
        throw new Error('ocapURLRedemptionService not available');
      }

      const remote = await E(redeemer).redeem(url);
      console.log(`redeemed ${url} successfully (?)`);
      const result = await E(remote).hello(`remote ${name}`);
      console.log(`got result from remote: ${result}`);
      return result;
    },
  });
}
