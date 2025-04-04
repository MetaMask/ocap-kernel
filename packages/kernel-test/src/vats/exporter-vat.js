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
   * @param {...any} args - Additional arguments to print.
   */
  function tlog(message, ...args) {
    console.log(`::> ${name}: ${message}`, ...args);
  }

  const exportedObjects = new Map();

  return Far('root', {
    bootstrap() {
      log(`bootstrap`);
      return `bootstrap-${name}`;
    },

    // Create an object in our maps
    createObject(id) {
      const obj = Far('SharedObject', {
        getValue() {
          return id;
        },
      });
      exportedObjects.set(id, obj);
      tlog(`Created object ${id}`);
      return obj;
    },

    // Check if an object exists in our maps
    isObjectPresent(objId) {
      return exportedObjects.has(objId);
    },

    // Remove an object from our tracking, allowing it to be GC'd
    forgetObject(objId) {
      if (exportedObjects.has(objId)) {
        tlog(`Forgetting object ${objId}`);
        exportedObjects.delete(objId);
        return true;
      }
      tlog(`Cannot forget nonexistent object: ${objId}`);
      return false;
    },

    // No-op to help trigger crank cycles
    noop() {
      return 'noop';
    },
  });
}
