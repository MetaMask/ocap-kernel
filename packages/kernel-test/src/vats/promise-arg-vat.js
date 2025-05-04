import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

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
  const testLogger = vatPowers.logger.subLogger({ tags: ['test', name] });
  const tlog = (...args) => testLogger.log(...args);

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
    async bootstrap(vats) {
      log(`bootstrap start`);
      tlog(`running test ${test}`);
      let doneP = Promise.resolve('no activity');
      if (!['promiseArg1', 'promiseArg2', 'promiseArg3'].includes(test)) {
        throw Error(`unknown test ${test}`);
      }
      let resolver;
      const param = new Promise((resolve, _reject) => {
        resolver = resolve;
      });
      if (test === 'promiseArg2') {
        tlog(`resolving the promise that will be sent to Bob`);
        resolver(`${name} said hi before send`);
      }
      tlog(`sending the promise to Bob`);
      const responseFromBob = E(vats.bob).hereIsAPromise(param);
      if (test === 'promiseArg1') {
        tlog(`resolving the promise that was sent to Bob`);
        resolver(`${name} said hi after send`);
      }
      tlog(`awaiting Bob's response`);
      doneP = responseFromBob.then(
        (res) => {
          const [bobDoneP, bobDoneMsg] = res;
          tlog(`Bob's response to hereIsAPromise: '${bobDoneMsg}'`);
          if (test === 'promiseArg3') {
            tlog(`resolving the promise that was sent to Bob`);
            resolver(`${name} said hi after Bob's reply`);
          }
          return bobDoneP;
        },
        (rej) => {
          tlog(`Bob's response to hereIsAPromise rejected as '${rej}'`);
          return 'bobFail';
        },
      );
      await E(vats.bob).loopback();
      return await doneP;
    },

    // This is a hack that effectively does the job of stdout.flush() even
    // though we don't have access to stdout itself here. It makes sure we
    // capture all the log output prior to the return value from `bootstrap`
    // resolving.
    loopback() {
      return undefined;
    },

    async hereIsAPromise(promise) {
      log(`hereIsAPromise start`);
      const doneP = promise.then(
        (res) => {
          tlog(`the promise parameter resolved to '${res}'`);
          return 'bobPSucc';
        },
        (rej) => {
          tlog(`the promise parameter rejected as '${rej}'`);
          return 'bobPFail';
        },
      );
      log(`hereIsAPromise done`);
      return [doneP, `${name}.hereIsAPromise done`];
    },
  });
}
