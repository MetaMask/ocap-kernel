import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { VatPowers } from '@metamask/ocap-kernel';

/**
 * Build function for vat that receives remote messages from other kernels.
 *
 * @param vatPowers - Special powers granted to this vat.
 * @param vatPowers.logger - The logger for the vat.
 * @param parameters - Initialization parameters from the vat's config object.
 * @param parameters.name - The name of the vat.
 * @param _baggage - Root of vat's persistent state (not used here).
 * @returns The root object for the new vat.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject(
  { logger }: VatPowers,
  parameters: { name?: string } = {},
  _baggage: unknown = null,
) {
  const name = parameters?.name ?? 'RemoteReceiver';
  logger.log(`buildRootObject "${name}"`);

  let issuerService: unknown;

  return makeDefaultExo('remoteReceiverRoot', {
    async bootstrap(
      vats: { receiver?: unknown },
      services: { ocapURLIssuerService?: unknown },
    ) {
      logger.log(`vat ${name} is bootstrap`);
      issuerService = services.ocapURLIssuerService;

      if (issuerService && vats.receiver) {
        const url = await E(issuerService).issue(vats.receiver);
        logger.log(`url for receiver: ${url}`);
        return { message: `${name} bootstrap complete`, ocapURL: url };
      }

      return { message: `${name} bootstrap complete` };
    },

    hello(from: string) {
      const message = `${name} says hello back to ${from}`;
      logger.log(message);
      return message;
    },
  });
}
