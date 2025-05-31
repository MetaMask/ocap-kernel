/**
 * This vat is used to bootstrap other vats for demonstration purposes.
 * The supported ocap-kernel entrypoint is the 'bootstrap' property of the clusterConfig.
 */
import { E, Far } from '@endo/far';

/**
 * Build function for the bootstrapper vat.
 *
 * @param {unknown} _vatPowers - Special powers granted to this vat (not used here).
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {string} parameters.methodName - Name of the method to call on the root object.
 * @param {unknown[]} parameters.args - Arguments to pass to the method.
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters) {
  const { methodName, args } = parameters;
  return Far('root', {
    bootstrap: (vats) => E(vats.target)[methodName](...(args ?? [])),
  });
}
