import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for vat that sends remote messages to other kernels.
 *
 * @param {unknown} vatPowers - Special powers granted to this vat.
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} _baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject({ logger }, parameters, _baggage) {
  const name = parameters?.name ?? 'RemoteSender';
  logger.log(`buildRootObject "${name}"`);

  let issuerService;
  let redeemerService;

  return makeDefaultExo('remoteSenderRoot', {
    async bootstrap(vats, services) {
      logger.log(`vat ${name} is bootstrap`);
      issuerService = services.ocapURLIssuerService;
      redeemerService = services.ocapURLRedemptionService;

      if (issuerService && vats.receiver) {
        const url = await E(issuerService).issue(vats.receiver);
        logger.log(`url for receiver: ${url}`);
        return { message: `${name} bootstrap complete`, ocapURL: url };
      }

      return { message: `${name} bootstrap complete` };
    },

    async sendMessage(remoteURL, method, args = []) {
      logger.log(`${name} attempting to redeem URL: ${remoteURL}`);

      if (redeemerService) {
        const remoteObject = await E(redeemerService).redeem(remoteURL);
        logger.log(`${name} redeemed URL successfully`);
        const result = await E(remoteObject)[method](...args);
        logger.log(`${name} got result:`, result);
        return result;
      }

      logger.log('no ocapURLRedemptionService found');
      throw new Error('ocapURLRedemptionService not available');
    },

    hello(from) {
      const message = `${name} received hello from ${from}`;
      logger.log(message);
      return message;
    },
  });
}
