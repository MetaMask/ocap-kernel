import 'setimmediate';
import { makePromiseKit } from '@endo/promise-kit';

// Note: This can only be imported from the Start Compartment, where the tricks
// used by the 'setimmediate' package are available.

/**
 * Return a promise that waits until the microtask queue is empty. When this
 * promise resolves, the holder can be assured that the environment no longer
 * has agency.
 *
 * @returns a Promise that can await the compartment becoming quiescent.
 */
export async function waitUntilQuiescent(): Promise<void> {
  // the delivery might cause some number of (native) Promises to be
  // created and resolved, so we use the IO queue to detect when the
  // Promise queue is empty. The IO queue (setImmediate and setTimeout) is
  // lower-priority than the Promise queue on browsers.
  const { promise: queueEmptyP, resolve } = makePromiseKit<void>();
  setImmediate(() => resolve());
  return queueEmptyP;
}
