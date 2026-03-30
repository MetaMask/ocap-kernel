/**
 * Stop an operation with a timeout to prevent hangs during cleanup.
 *
 * @param stopFn - The stop function to call.
 * @param timeoutMs - The timeout in milliseconds.
 * @param label - A label for logging.
 */
export async function stopWithTimeout(
  stopFn: () => Promise<unknown>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  try {
    await Promise.race([
      stopFn(),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs),
      ),
    ]);
  } catch {
    // Ignore timeout errors during cleanup
  }
}
