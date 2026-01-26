import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for Bob's vat.
 * Bob can create greeter exos that can be passed to other vats.
 *
 * @param {object} vatPowers - Special powers granted to this vat.
 * @param {object} vatPowers.logger - The logger object.
 * @returns {object} The root object for the new vat.
 */
export function buildRootObject({ logger }) {
  return makeDefaultExo('bobRoot', {
    bootstrap() {
      logger.log('Bob vat bootstrap');
    },

    /**
     * Create a greeter exo that can greet with a custom message.
     * This exo can be passed to other vats (third-party handoff).
     *
     * @param {string} greeting - The greeting prefix to use.
     * @returns {object} A greeter exo with a greet method.
     */
    createGreeter(greeting) {
      return makeDefaultExo('greeter', {
        greet(name) {
          const message = `${greeting}, ${name}!`;
          logger.log(`Greeter says: ${message}`);
          return message;
        },
      });
    },
  });
}
