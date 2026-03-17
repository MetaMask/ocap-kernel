import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * A consumer vat that obtains an ephemeral exo reference from the provider
 * during bootstrap and calls it on demand.
 *
 * @returns The root object.
 */
export function buildRootObject() {
  let ephemeralRef: unknown;

  return makeDefaultExo('root', {
    async bootstrap(vats: { provider: unknown }) {
      ephemeralRef = await E(vats.provider).getEphemeral();
    },

    async useEphemeral() {
      return E(ephemeralRef).increment();
    },
  });
}
