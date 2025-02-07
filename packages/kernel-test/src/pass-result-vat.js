import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

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

  return Far('root', {
    async bootstrap(vats) {
      log(`bootstrap start`);
      tlog(`running test ${test}`);
      const promise1 = E(vats.bob).first();
      const promise2 = E(vats.bob).second(promise1);
      const doneP = Promise.all([
        promise1.then(
          (res) => {
            tlog(`first result resolved to ${res}`);
            return 'p1succ';
          },
          (rej) => {
            tlog(`first result rejected with ${rej}`);
            return 'p1fail';
          },
        ),
        promise2.then(
          (res) => {
            tlog(`second result resolved to ${res}`);
            return 'p2succ';
          },
          (rej) => {
            tlog(`second result rejected with ${rej}`);
            return 'p2fail';
          },
        ),
      ]);
      await E(vats.bob).loopback();
      return doneP;
    },

    // This is a hack that effectively does the job of stdout.flush() even
    // though we don't have access to stdout itself here. It makes sure we
    // capture all the log output prior to the return value from `bootstrap`
    // resolving.
    // eslint-disable-next-line no-empty-function
    loopback() {},

    first() {
      tlog(`first`);
      return `Bob's first answer`;
    },
    async second(promiseParam) {
      tlog(`second`);
      const param = await promiseParam;
      tlog(`parameter to second resolved to ${param}`);
      return `Bob's second answer`;
    },
  });
}
