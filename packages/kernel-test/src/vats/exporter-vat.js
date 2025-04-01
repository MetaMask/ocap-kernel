// import { E } from '@endo/eventual-send';
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
  //   const { getSyscall } = vatPowers;
  //   const syscall = getSyscall();

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

  // Track objects we've created
  const exportedObjects = new Map();
  // Track WeakRefs
  const weakRefs = new Map();
  // FinalizationRegistry to know when objects are GC'd
  const finalizer = new FinalizationRegistry((id) => {
    console.log(`::> ${name}: Object ${id} was finalized`);
    weakRefs.delete(id);
  });

  return Far('root', {
    bootstrap() {
      log(`bootstrap`);
      return this;
    },

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

    getExportedObjectCount() {
      return exportedObjects.size;
    },

    // Create a weak reference to an object
    makeWeakRef(objId) {
      const obj = exportedObjects.get(objId);
      if (obj) {
        tlog(`Creating weak reference to object ${objId}`);
        const ref = new WeakRef(obj);
        weakRefs.set(objId, ref);
        finalizer.register(obj, objId);
        return true;
      }
      return false;
    },

    // Remove the strong reference, keeping only the weak reference
    removeStrongRef(objId) {
      if (this.makeWeakRef(objId)) {
        tlog(`Removing strong reference to object ${objId}`);
        exportedObjects.delete(objId);
        return true;
      }
      return false;
    },

    // Check if an object is still held strongly
    isStronglyHeld(objId) {
      return exportedObjects.has(objId);
    },

    // Try to access a potentially GC'd object through its weak reference
    tryAccessWeakRef(objId) {
      const weakRef = weakRefs.get(objId);
      if (!weakRef) {
        return { status: 'no weak ref' };
      }

      const obj = weakRef.deref();
      if (!obj) {
        return { status: 'collected' };
      }

      try {
        const value = obj.getValue();
        return { status: 'alive', value };
      } catch (error) {
        return { status: 'error', message: String(error) };
      }
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
