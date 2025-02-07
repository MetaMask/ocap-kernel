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

  /**
   * Test if a value is a promise.
   *
   * @param {*} value - The value to test.
   * @returns {boolean} True iff `value` is a promise.
   */
  function isPromise(value) {
    return Promise.resolve(value) === value;
  }

  log(`buildRootObject`);
  log(`configuration parameters: ${JSON.stringify(parameters)}`);

  let promise;
  let resolve;

  return Far('root', {
    async bootstrap(vats) {
      log(`bootstrap start`);
      tlog(`running test ${test}`);
      const promiseX = E(vats.bob).genPromise();
      const promiseY = E(vats.carol).genPromise();
      await E(vats.bob).resolve([promiseY]);
      await E(vats.carol).resolve([promiseX]);

      const resolutionX = await promiseX;
      const resolutionY = await promiseY;
      tlog(`isPromise(resolutionX[0]): ${isPromise(resolutionX[0])}`);
      tlog(`isPromise(resolutionY[0]): ${isPromise(resolutionY[0])}`);
      await E(vats.bob).loopback();
      return 'done';
    },

    // This is a hack that effectively does the job of stdout.flush() even
    // though we don't have access to stdout itself here. It makes sure we
    // capture all the log output prior to the return value from `bootstrap`
    // resolving.
    loopback() {
      return undefined;
    },

    genPromise() {
      tlog(`genPromise`);
      const { promise: aPromise, resolve: aResolve } = makePromiseKit();
      promise = aPromise;
      resolve = aResolve;
      return promise;
    },
    resolve(resolution) {
      tlog(`resolve`);
      resolve(resolution);
    },
  });
}
