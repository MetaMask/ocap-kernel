/**
 * Wrap a promise with a timeout rejection.
 *
 * @param promise - The promise to wrap with a timeout.
 * @param timeout - How many ms to wait before rejecting.
 * @returns A wrapped promise which rejects after timeout miliseconds.
 */
export async function withTimeout<Return>(
  promise: Promise<Return>,
  timeout: number,
): Promise<Return> {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`promise timed out after ${timeout}ms`, {
              cause: promise,
            }),
          ),
        timeout,
      ),
    ),
  ]) as Promise<Return>;
}
