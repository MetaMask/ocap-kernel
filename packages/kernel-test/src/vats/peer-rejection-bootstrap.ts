import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Bootstrap vat for testing peer-rejection propagation.
 * Receives a `peer` root reference that may be a rejected kernel promise
 * (e.g. if the peer vat failed to launch), and logs whether calls resolve
 * or reject so integration tests can inspect the outcome.
 *
 * @returns The root object for this vat.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject() {
  return makeDefaultExo('root', {
    async bootstrap({ peer }: { peer: unknown }) {
      await E(peer as object)
        .ping()
        // eslint-disable-next-line no-console
        .then(() => console.log('peer resolved'))
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          // eslint-disable-next-line no-console
          console.log(`peer rejected: ${message}`);
        });
    },
  });
}
