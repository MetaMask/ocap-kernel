import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';

/**
 * Build function for vats that will run various tests.
 *
 * @param {*} _vatPowers - Special powers granted to this vat (not used here).
 * @param {*} parameters - Initialization parameters from the vat's config object.
 * @param {*} _baggage - Root of vat's persistent state (not used here).
 * @returns {*} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters, _baggage) {
  const name = parameters?.name ?? 'anonymous';
  const test = parameters?.test ?? 'unspecified';

  /**
   * Print a message to the log.
   *
   * @param {string} message - The message to print.
   */
  function log(message) {
    console.log(`${name}: ${message}`);
  }

  /**
   * Print a message to the log, tagged as part of the test output.
   *
   * @param {string} message - The message to print.
   */
  function tlog(message) {
    console.log(`::> ${name}: ${message}`);
  }

  log(`buildRootObject`);
  log(`configuration parameters: ${JSON.stringify(parameters)}`);

  let promise;
  let resolve;

  return Far('root', {
    async bootstrap(vats) {
      log(`bootstrap start`);
      tlog(`running test ${test}`);
      const promise1 = E(vats.bob).genPromise1();
      const promise2 = E(vats.bob).genPromise2();
      await E(vats.bob).resolve([promise1]);

      const resolution = await promise2;
      tlog(`resolution == ${resolution}`);
      await E(vats.bob).loopback();
      return 'done';
    },

    // This is a hack that effectively does the job of stdout.flush() even
    // though we don't have access to stdout itself here. It makes sure we
    // capture all the log output prior to the return value from `bootstrap`
    // resolving.
    // eslint-disable-next-line no-empty-function
    loopback() {},

    genPromise1() {
      tlog(`genPromise1`);
      return 'hello';
    },
    genPromise2() {
      tlog(`genPromise2`);
      const { promise: aPromise, resolve: aResolve } = makePromiseKit();
      promise = aPromise;
      resolve = aResolve;
      return promise;
    },
    resolve(resolution) {
      tlog(`resolve`);
      resolve(resolution[0]);
    },
  });
}
