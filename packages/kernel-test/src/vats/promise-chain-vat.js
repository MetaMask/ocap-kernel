import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';

/**
 * Build function for vats that will run various tests.
 *
 * @param {*} vatPowers - Special powers granted to this vat (not used here).
 * @param {*} parameters - Initialization parameters from the vat's config object.
 * @param {*} _baggage - Root of vat's persistent state (not used here).
 * @returns {*} The root object for the new vat.
 */
export function buildRootObject(vatPowers, parameters, _baggage) {
  const name = parameters?.name ?? 'anonymous';
  const test = parameters?.test ?? 'unspecified';
  const limit = Number(parameters?.limit ?? 3);
  const logger = vatPowers.logger.subLogger({ tags: ['test', name] });
  const tlog = (...args) => logger.log(...args);

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

  /**
   * Wait for the next promise in the chain.
   *
   * @param {*} who - Who to take the next step.
   * @param {*} prevP - Promise for the previous step.
   *
   * @returns {string} A string at the end.
   */
  function waitFor(who, prevP) {
    tlog(`waitFor start`);
    return prevP.then(
      async (res) => {
        const [value, nextPrevP] = res;
        if (value < limit) {
          tlog(`count ${value} < ${limit}, recurring...`);
          await E(who).bobGen();
          return waitFor(who, nextPrevP);
        }
        tlog(`finishing chain`);
        return 'end of chain';
      },
      (rej) => {
        tlog(`Bob rejected, ${rej}`);
      },
    );
  }

  let bobResolve = null;
  let bobValue = 0;

  return Far('root', {
    async bootstrap(vats) {
      log(`bootstrap start`);
      tlog(`running test ${test}`);

      const bobReadyP = E(vats.bob).bobInit();
      await E(vats.bob).bobGen();
      const doneP = waitFor(vats.bob, bobReadyP);
      await E(vats.bob).loopback();
      return doneP;
    },

    // This is a hack that effectively does the job of stdout.flush() even
    // though we don't have access to stdout itself here. It makes sure we
    // capture all the log output prior to the return value from `bootstrap`
    // resolving.
    loopback() {
      return undefined;
    },

    bobInit() {
      log(`bobInit`);
      const { promise, resolve } = makePromiseKit();
      bobResolve = resolve;
      return promise;
    },
    bobGen() {
      log(`bobGen start`);
      const { promise, resolve } = makePromiseKit();
      const next = [bobValue, promise];
      bobValue += 1;
      tlog(`bobGen set value to ${bobValue}`);
      bobResolve(next);
      bobResolve = resolve;
      log(`bobGen done`);
    },
  });
}
