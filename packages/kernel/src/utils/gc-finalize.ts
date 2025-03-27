import { delay } from '@ocap/utils';

/**
 * Utility to create a function that performs garbage collection and finalization
 * in a cross-environment compatible way.
 *
 * @returns A function that triggers GC and finalization when possible
 */
function makeGCAndFinalize(): () => Promise<void> {
  // Try to get the best available GC function
  let gcFunction: (() => void) | undefined;

  // First check if GC is directly available (Node with --expose-gc or some browsers)
  if (typeof globalThis.gc === 'function') {
    // Explicitly cast to void function to address type mismatch
    gcFunction = () => {
      // Use type assertion to satisfy the linter
      (globalThis.gc as () => void)();
    };
  }
  // If we're in Node.js, we can try some V8-specific approaches
  else if (
    typeof globalThis === 'object' &&
    Object.prototype.toString.call(globalThis.process) === '[object process]'
  ) {
    try {
      // Try to get V8 and VM modules (this will only work in Node.js)
      // Using require instead of import for conditional loading
      // eslint-disable-next-line n/global-require, @typescript-eslint/no-require-imports
      const v8 = require('v8');
      // eslint-disable-next-line n/global-require, @typescript-eslint/no-require-imports
      const vm = require('vm');
      // Set the flag to expose GC
      v8.setFlagsFromString('--expose_gc');
      // Get the GC function from a new context
      const extractedGC = vm.runInNewContext('gc');
      if (typeof extractedGC === 'function') {
        gcFunction = () => {
          (extractedGC as () => void)();
        };
      }
    } catch (error) {
      // Silently continue if this approach fails
      console.debug('V8-specific GC extraction failed:', error);
    }
  }

  /**
   * Function to trigger garbage collection and finalization
   */
  return async function gcAndFinalize(): Promise<void> {
    try {
      if (gcFunction) {
        // First GC pass
        gcFunction();
        // Allow finalization callbacks to run
        await delay(0);
        // Second GC pass to clean up objects that might have become
        // unreachable during finalization
        gcFunction();
        // Another tick to ensure finalization completes
        await delay(0);
      } else {
        // No GC function available, log warning and cycle the event loop
        console.warn('Deterministic GC not available in this environment');
        await delay(0);
      }
    } catch (error) {
      console.warn('GC operation failed:', error);
    }
  };
}

// Create and export a singleton instance to be used throughout the codebase
export const gcAndFinalize = makeGCAndFinalize();

// Still export the factory function for testing or cases where a fresh instance is needed
export { makeGCAndFinalize };
