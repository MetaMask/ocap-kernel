import { Far } from '@endo/marshal';

/**
 * Build function for testing subcluster functionality.
 *
 * @param {*} _vatPowers - Special powers granted to this vat.
 * @param {*} parameters - Initialization parameters from the vat's config object.
 * @param {*} _baggage - Root of vat's persistent state (not used here).
 * @returns {*} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters, _baggage) {
  const name = parameters?.name ?? 'anonymous';
  const subcluster = parameters?.subcluster ?? 'default';

  /**
   * Print a message to the log.
   *
   * @param {string} message - The message to print.
   */
  function log(message) {
    console.log(`${name}: ${message}`);
  }

  log(`buildRootObject`);
  log(`configuration parameters: ${JSON.stringify(parameters)}`);

  return Far('root', {
    async bootstrap() {
      log(`bootstrap() in ${subcluster}`);
      return 'bootstrap complete';
    },
  });
}
