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
  // const { getSyscall } = vatPowers;
  // const syscall = getSyscall();
  const importedObjects = new Map();
  const weakRefs = new Map();
  const finalizer = new FinalizationRegistry((id) => {
    console.log(`::> ${name}: Imported object ${id} was finalized`);
    weakRefs.delete(id);
  });

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
      return this;
    },

    storeImport(obj, id = 'default') {
      tlog(`Storing import ${id}`, obj);
      importedObjects.set(id, obj);
      return 'stored';
    },

    useImport(id = 'default') {
      tlog(`useImport ${id}`);
      const obj = importedObjects.get(id);
      if (!obj) {
        throw new Error(`Object not found: ${id}`);
      }
      tlog(`Using import ${id}`);
      return E(obj).getValue();
    },

    makeWeak(id) {
      const obj = importedObjects.get(id);
      if (!obj) {
        tlog(`Cannot make weak reference to nonexistent object: ${id}`);
        return false;
      }

      tlog(`Making weak reference to ${id}`);
      const ref = new WeakRef(obj);
      weakRefs.set(id, ref);
      finalizer.register(obj, id);
      importedObjects.delete(id);
      return true;
    },

    forgetImport(id) {
      const had = importedObjects.has(id);
      if (had) {
        tlog(`Forgetting import ${id}`);
        importedObjects.delete(id);
        weakRefs.delete(id);
      } else {
        tlog(`Cannot forget nonexistent import: ${id}`);
      }
      return had;
    },

    getImportedObjectCount() {
      return importedObjects.size;
    },

    listImportedObjects() {
      return Array.from(importedObjects.keys());
    },

    checkAccess(id) {
      if (importedObjects.has(id)) {
        return { status: 'strong', accessible: true };
      }

      const weakRef = weakRefs.get(id);
      if (!weakRef) {
        return { status: 'no reference' };
      }

      const obj = weakRef.deref();
      if (!obj) {
        return { status: 'collected' };
      }

      try {
        const value = E(obj).getValue();
        return { status: 'weak', accessible: true, value };
      } catch (error) {
        return { status: 'error', message: String(error) };
      }
    },

    // No-op to help trigger crank cycles
    noop() {
      return 'noop';
    },
  });
}
