import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for Carol's vat.
 * Carol can receive exos from other vats and call methods on them.
 *
 * @param {object} vatPowers - Special powers granted to this vat.
 * @param {object} vatPowers.logger - The logger object.
 * @returns {object} The root object for the new vat.
 */
export function buildRootObject({ logger }) {
  /** @type {object | null} */
  let storedExo = null;

  return makeDefaultExo('carolRoot', {
    bootstrap() {
      logger.log('Carol vat bootstrap');
    },

    /**
     * Receive an exo and immediately call a method on it.
     * This proves the third-party handoff worked.
     *
     * @param {object} exo - An exo received from another vat.
     * @param {string} name - The name to greet.
     * @returns {Promise<string>} The greeting from the exo.
     */
    receiveAndGreet(exo, name) {
      logger.log(`Carol received exo and will greet "${name}"`);
      return E(exo).greet(name);
    },

    /**
     * Store an exo for later use.
     *
     * @param {object} exo - An exo to store.
     * @returns {string} Confirmation message.
     */
    storeExo(exo) {
      storedExo = exo;
      logger.log('Carol stored exo');
      return 'stored';
    },

    /**
     * Use a previously stored exo to greet.
     *
     * @param {string} name - The name to greet.
     * @returns {Promise<string>} The greeting from the stored exo.
     */
    useStoredExo(name) {
      if (!storedExo) {
        throw new Error('No exo stored');
      }
      logger.log(`Carol using stored exo to greet "${name}"`);
      return E(storedExo).greet(name);
    },
  });
}
