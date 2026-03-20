import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * A provider vat that exposes a single ephemeral (non-durable) exo.
 * The exo will not survive a vat restart.
 *
 * @returns The root object.
 */
export function buildRootObject() {
  const ephemeral = makeDefaultExo('EphemeralCounter', {
    increment() {
      return 999;
    },
  });

  return makeDefaultExo('root', {
    getEphemeral() {
      return ephemeral;
    },
  });
}
