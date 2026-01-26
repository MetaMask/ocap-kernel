import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for Alice's vat.
 * Alice orchestrates the third-party handoff between Bob and Carol.
 *
 * @param {object} vatPowers - Special powers granted to this vat.
 * @param {object} vatPowers.logger - The logger object.
 * @returns {object} The root object for the new vat.
 */
export function buildRootObject({ logger }) {
  return makeDefaultExo('aliceRoot', {
    bootstrap() {
      logger.log('Alice vat bootstrap');
    },

    /**
     * Orchestrates a third-party handoff by getting an exo from Bob,
     * passing it to Carol, and having Carol use it.
     *
     * @param {object} bob - Reference to Bob's vat root.
     * @param {object} carol - Reference to Carol's vat root.
     * @param {string} greeting - The greeting for Bob to use.
     * @param {string} name - The name for Carol to greet.
     * @returns {Promise<string>} The greeting result.
     */
    async performHandoff(bob, carol, greeting, name) {
      logger.log('Alice starting handoff');

      // Get exo from Bob
      const greeter = await E(bob).createGreeter(greeting);
      logger.log('Alice received greeter from Bob');

      // Pass to Carol and have her use it
      const result = await E(carol).receiveAndGreet(greeter, name);
      logger.log(`Alice got result: ${result}`);

      return result;
    },
  });
}
