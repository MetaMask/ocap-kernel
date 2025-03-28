import { Far } from '@endo/marshal';

/**
 * Build function for a very simple vat that just tests WeakRef creation.
 *
 * @param {object} _vatPowers - Special powers granted to this vat.
 * @param {object} parameters - Initialization parameters from the vat's config object.
 * @returns {object} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters) {
  const name = parameters?.name ?? 'anonymous';

  /**
   * Print a message to the test log.
   *
   * @param {string} message - The message to print.
   */
  function tlog(message) {
    console.log(`::> ${name}: ${message}`);
  }

  return Far('root', {
    async bootstrap() {
      // Simply create an object and a WeakRef to it
      const obj = { value: 'test object' };
      const weakRef = new WeakRef(obj);

      // Verify the WeakRef works
      const retrieved = weakRef.deref();
      if (retrieved && retrieved.value === 'test object') {
        tlog('WeakRef created and object is accessible');
      } else {
        tlog('ERROR: WeakRef failed to retrieve object');
      }

      return 'gc-test-complete';
    },
  });
}
