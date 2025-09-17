import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for vat that sends remote messages to other kernels.
 *
 * @param {unknown} _vatPowers - Special powers granted to this vat.
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} _baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters, _baggage) {
  const name = parameters?.name ?? 'RemoteSender';
  console.log(`buildRootObject "${name}"`);

  let issuerService;
  let redeemerService;

  return makeDefaultExo('remoteSenderRoot', {
    async bootstrap(vats, services) {
      console.log(`vat ${name} is bootstrap`);
      issuerService = services.ocapURLIssuerService;
      redeemerService = services.ocapURLRedemptionService;

      if (issuerService && vats.receiver) {
        const url = await E(issuerService).issue(vats.receiver);
        console.log(`url for receiver: ${url}`);
        return { message: `${name} bootstrap complete`, ocapURL: url };
      }

      return { message: `${name} bootstrap complete` };
    },

    async sendMessage(remoteURL, method, args = []) {
      console.log(`${name} attempting to redeem URL: ${remoteURL}`);

      if (redeemerService) {
        const remoteObject = await E(redeemerService).redeem(remoteURL);
        console.log(`${name} redeemed URL successfully`);
        const result = await E(remoteObject)[method](...args);
        console.log(`${name} got result:`, result);
        return result;
      }

      console.log('no ocapURLRedemptionService found');
      throw new Error('ocapURLRedemptionService not available');
    },

    hello(from) {
      const message = `${name} received hello from ${from}`;
      console.log(message);
      return message;
    },
  });
}
