import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for vats that will run various tests.
 *
 * @param _vatPowers - Special powers granted to this vat (not used here).
 * @param parameters - Initialization parameters from the vat's config object.
 * @param parameters.name - The name of the vat.
 * @param _baggage - Root of vat's persistent state (not used here).
 * @returns The root object for the new vat.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject(
  _vatPowers: unknown,
  parameters: { name?: string } = {},
  _baggage: unknown = null,
) {
  const name = parameters?.name ?? 'anonymous';

  /**
   * Print a message to the log.
   *
   * @param message - The message to print.
   */
  function log(message: string): void {
    // eslint-disable-next-line no-console
    console.log(`${name}: ${message}`);
  }

  /**
   * Print a message to the log, tagged as part of the test output.
   *
   * @param message - The message to print.
   * @param args - Additional arguments to print.
   */
  function tlog(message: string, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.log(`::> ${name}: ${message}`, ...args);
  }

  const exportedObjects = new Map<string, unknown>();

  return makeDefaultExo('root', {
    bootstrap() {
      log(`bootstrap`);
      return `bootstrap-${name}`;
    },

    // Create an object in our maps
    createObject(id: string) {
      const obj = makeDefaultExo('SharedObject', {
        getValue() {
          return id;
        },
      });
      exportedObjects.set(id, obj);
      tlog(`Created object ${id}`);
      return obj;
    },

    // Check if an object exists in our maps
    isObjectPresent(objId: string) {
      return exportedObjects.has(objId);
    },

    // Remove an object from our tracking, allowing it to be GC'd
    forgetObject(objId: string) {
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
