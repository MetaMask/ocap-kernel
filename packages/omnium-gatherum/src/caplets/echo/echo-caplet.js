import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Log a message with caplet prefix.
 *
 * @param {...any} args - Arguments to log.
 */
const log = (...args) => {
  console.log('[echo-caplet]', ...args);
};

/**
 * Echo service caplet - provides a simple echo method for testing.
 *
 * This Caplet demonstrates the basic structure of a service provider:
 * - Exports buildRootObject following the Caplet vat contract.
 * - Uses makeDefaultExo to create a hardened root object.
 * - Provides an "echo" service that returns the input with a prefix.
 * - Implements a bootstrap method for initialization.
 *
 * @param {object} _vatPowers - Standard vat powers granted by the kernel.
 * @param {object} _parameters - Bootstrap parameters from Omnium (empty for echo-caplet).
 * @param {object} _baggage - Persistent state storage (not used in this simple example).
 * @returns {object} Hardened root object with echo service methods.
 */
export function buildRootObject(_vatPowers, _parameters, _baggage) {
  log('buildRootObject called');

  return makeDefaultExo('echo-caplet-root', {
    /**
     * Bootstrap method called during vat initialization.
     *
     * This method is optional but recommended for initialization logic.
     * For service providers, this is where you would set up initial state.
     */
    bootstrap() {
      log('bootstrapped and ready');
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
      log('Echoing message:', message);
      return `echo: ${message}`;
    },
  });
}
