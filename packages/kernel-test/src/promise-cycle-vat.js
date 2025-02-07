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

  let promise1;
  let resolve1;
  let promise2;
  let resolve2;

  return Far('root', {
    async bootstrap(vats) {
      log(`bootstrap start`);
      tlog(`running test ${test}`);
      const promiseX = E(vats.bob).genPromise1();
      const promiseY = E(vats.bob).genPromise2();
      if (test === 'promiseCycle') {
        await E(vats.bob).resolveBoth([promiseX], [promiseY]);
      } else if (test === 'promiseCycleMultiCrank') {
        await E(vats.bob).resolve1([promiseY]);
        await E(vats.bob).resolve2([promiseX]);
      } else {
        throw Error(`unknown test ${test}`);
      }

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
    // eslint-disable-next-line no-empty-function
    loopback() {},

    genPromise1() {
      tlog(`genPromise1`);
      const { promise, resolve } = makePromiseKit();
      promise1 = promise;
      resolve1 = resolve;
      return promise1;
    },
    genPromise2() {
      tlog(`genPromise2`);
      const { promise, resolve } = makePromiseKit();
      promise2 = promise;
      resolve2 = resolve;
      return promise2;
    },
    resolveBoth(resolutionX, resolutionY) {
      tlog(`resolveBoth`);
      resolve1(resolutionY);
      resolve2(resolutionX);
    },
    resolve1(resolution) {
      tlog(`resolve1`);
      resolve1(resolution);
    },
    resolve2(resolution) {
      tlog(`resolve2`);
      resolve2(resolution);
    },
  });
}
