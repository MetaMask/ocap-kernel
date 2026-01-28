import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for a vat that tests promise behaviors.
 * This vat provides methods to test kernel promise (kp kref) handling.
 *
 * @param {object} vatPowers - Special powers granted to this vat.
 * @param {object} vatPowers.logger - The logger object.
 * @returns {object} The root object for the new vat.
 */
export function buildRootObject({ logger }) {
  let deferredResolver = null;
  let deferredRejecter = null;

  return makeDefaultExo('promiseRoot', {
    bootstrap() {
      logger.log('Promise vat bootstrap');
    },

    /**
     * Returns a promise that resolves to a greeter exo.
     *
     * @param {string} greeting - The greeting prefix to use.
     * @returns {Promise<object>} A promise resolving to a greeter exo.
     */
    makeGreeter(greeting) {
      logger.log(`makeGreeter called with greeting: ${greeting}`);
      return makeDefaultExo('greeter', {
        greet(name) {
          const message = `${greeting}, ${name}!`;
          logger.log(`Greeter says: ${message}`);
          return message;
        },
      });
    },

    /**
     * Makes a deferred promise that can be resolved or rejected
     * via separate method calls.
     *
     * @returns {Promise<unknown>} An unresolved promise.
     */
    makeDeferredPromise() {
      logger.log('makeDeferredPromise called');
      return new Promise((resolve, reject) => {
        deferredResolver = resolve;
        deferredRejecter = reject;
      });
    },

    /**
     * Resolves the deferred promise created by makeDeferredPromise.
     *
     * @param {unknown} value - The value to resolve with.
     */
    resolveDeferredPromise(value) {
      logger.log(`resolveDeferredPromise called with: ${value}`);
      if (deferredResolver) {
        deferredResolver(value);
        deferredResolver = null;
        deferredRejecter = null;
      } else {
        logger.log('No deferred promise to resolve');
      }
    },

    /**
     * Rejects the deferred promise created by makeDeferredPromise.
     *
     * @param {string} reason - The rejection reason.
     */
    rejectDeferredPromise(reason) {
      logger.log(`rejectDeferredPromise called with reason: ${reason}`);
      if (deferredRejecter) {
        deferredRejecter(new Error(reason));
        deferredResolver = null;
        deferredRejecter = null;
      } else {
        logger.log('No deferred promise to reject');
      }
    },

    /**
     * Returns a promise that immediately rejects with the given reason.
     *
     * @param {string} reason - The rejection reason.
     * @returns {Promise<never>} A rejecting promise.
     */
    getRejectingPromise(reason) {
      logger.log(`getRejectingPromise called with reason: ${reason}`);
      return Promise.reject(new Error(reason));
    },

    /**
     * Accepts a promise argument and awaits it before returning.
     *
     * @param {Promise<unknown>} promiseArg - A promise to await.
     * @returns {Promise<string>} A message containing the resolved value.
     */
    async awaitPromiseArg(promiseArg) {
      logger.log('awaitPromiseArg called, awaiting promise...');
      const result = await promiseArg;
      logger.log(`awaitPromiseArg resolved to: ${result}`);
      return `received: ${result}`;
    },

    /**
     * Gets a deferred promise from another vat and awaits it.
     * This tests cross-vat kernel promise handling.
     *
     * @param {object} promiserVat - A reference to another promise-vat.
     * @returns {Promise<string>} A message containing the resolved value.
     */
    async awaitDeferredFromVat(promiserVat) {
      logger.log('awaitDeferredFromVat called, getting deferred promise...');
      const deferredPromise = E(promiserVat).makeDeferredPromise();
      logger.log('Got deferred promise, awaiting...');
      const result = await deferredPromise;
      logger.log(`Deferred promise resolved to: ${result}`);
      return `received: ${result}`;
    },
  });
}
