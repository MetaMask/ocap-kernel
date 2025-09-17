import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for vat that receives remote messages from other kernels.
 *
 * @param {unknown} _vatPowers - Special powers granted to this vat.
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} _baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters, _baggage) {
  const name = parameters?.name ?? 'RemoteReceiver';
  console.log(`buildRootObject "${name}"`);

  let issuerService;

  return makeDefaultExo('remoteReceiverRoot', {
    async bootstrap(vats, services) {
      console.log(`vat ${name} is bootstrap`);
      issuerService = services.ocapURLIssuerService;

      if (issuerService && vats.receiver) {
        const url = await E(issuerService).issue(vats.receiver);
        console.log(`url for receiver: ${url}`);
        return { message: `${name} bootstrap complete`, ocapURL: url };
      }

      return { message: `${name} bootstrap complete` };
    },

    hello(from) {
      const message = `${name} says hello back to ${from}`;
      console.log(message);
      return message;
    },
  });
}
