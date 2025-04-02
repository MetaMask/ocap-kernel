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

  /** @type {WeakMap<object, string>} */
  let weakMap = new WeakMap();

  /** @type {Map<string, object>} */
  const importedObjects = new Map();

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

  return Far('root', {
    bootstrap() {
      log(`bootstrap`);
      return `bootstrap-${name}`;
    },

    /**
     * Store an imported object by ID
     * keeping a strong reference and a weak map entry.
     *
     * @param {object} obj - The imported object to store.
     * @param {string} [id] - The ID to store the object under.
     * @returns {string} The string 'stored'.
     */
    storeImport(obj, id = 'default') {
      tlog(`Storing import ${id}`, obj);
      importedObjects.set(id, obj);
      weakMap.set(obj, id);
      return 'stored';
    },

    /**
     * Use the imported object by ID and call its method.
     *
     * @param {string} id - The ID of the object to use.
     * @returns {*} The result of calling the object's method.
     */
    useImport(id = 'default') {
      tlog(`useImport ${id}`);
      const obj = importedObjects.get(id);
      if (!obj) {
        throw new Error(`Object not found: ${id}`);
      }
      tlog(`Using import ${id}`);
      return E(obj).getValue();
    },

    /**
     * Make the reference to an imported object weak by
     * removing the strong reference, keeping only the weak one.
     *
     * @param {string} id - The ID of the object to make weak.
     * @returns {boolean} True if the object was successfully made weak, false if it doesn't exist.
     */
    makeWeak(id) {
      const obj = importedObjects.get(id);
      if (!obj) {
        tlog(`Cannot make weak reference to nonexistent object: ${id}`);
        return false;
      }
      tlog(`Making weak reference to ${id} (dropping strong ref)`);
      importedObjects.delete(id);
      return true;
    },

    /**
     * Completely forget about the imported object.
     * Once all vats forget it, retireImports() should trigger.
     *
     * @returns {boolean} True if the object was successfully forgotten, false if it doesn't exist.
     */
    forgetImport() {
      weakMap = new WeakMap();
      return true;
    },

    /**
     * List all imported objects.
     *
     * @returns {string[]} An array of all imported object IDs.
     */
    listImportedObjects() {
      return Array.from(importedObjects.keys());
    },

    /**
     * No-op method.
     *
     * @returns {string} The string 'noop'.
     */
    noop() {
      return 'noop';
    },
  });
}
