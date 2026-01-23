import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Echo service caplet - provides a simple echo method for testing.
 *
 * This Caplet demonstrates the basic structure of a service provider:
 * - Exports buildRootObject following the Caplet vat contract.
 * - Uses makeDefaultExo to create a hardened root object.
 * - Provides an "echo" service that returns the input with a prefix.
 * - Implements a bootstrap method for initialization.
 *
 * @param {object} vatPowers - Standard vat powers granted by the kernel.
 * @param {object} vatPowers.logger - Structured logging interface.
 * @param {object} _parameters - Bootstrap parameters from Omnium (empty for echo-caplet).
 * @param {object} _baggage - Persistent state storage (not used in this simple example).
 * @returns {object} Hardened root object with echo service methods.
 */
export function buildRootObject(vatPowers, _parameters, _baggage) {
  const logger = vatPowers.logger.subLogger({ tags: ['echo-caplet'] });

  logger.log('Echo caplet buildRootObject called');

  return makeDefaultExo('echo-caplet-root', {
    /**
     * Bootstrap method called during vat initialization.
     *
     * This method is optional but recommended for initialization logic.
     * For service providers, this is where you would set up initial state.
     */
    bootstrap() {
      logger.log('Echo caplet bootstrapped and ready');
    },

    /**
     * Echo service method - returns the input message with "Echo: " prefix.
     *
     * This demonstrates a simple synchronous service method.
     * Service methods can also return promises for async operations.
     *
     * @param {string} message - The message to echo.
     * @returns {string} The echoed message with prefix.
     */
    echo(message) {
      logger.log('Echoing message:', message);
      return `Echo: ${message}`;
    },
  });
}
