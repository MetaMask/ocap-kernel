import { DEFAULT_WRITE_TIMEOUT_MS } from './constants.ts';
import type { Channel } from '../types.ts';

/**
 * Write a message to a channel stream with a timeout.
 *
 * @param channel - The channel to write to.
 * @param message - The message bytes to write.
 * @param timeoutMs - Timeout in milliseconds (default: 10 seconds).
 * @returns Promise that resolves when the write completes or rejects on timeout.
 * @throws Error if the write times out or fails.
 */
export async function writeWithTimeout(
  channel: Channel,
  message: Uint8Array,
  timeoutMs = DEFAULT_WRITE_TIMEOUT_MS,
): Promise<void> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  let abortHandler: (() => void) | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    abortHandler = () => {
      reject(Error(`Message send timed out after ${timeoutMs}ms`));
    };
    timeoutSignal.addEventListener('abort', abortHandler);
  });

  try {
    return await Promise.race([
      channel.msgStream.write(message),
      timeoutPromise,
    ]);
  } finally {
    // Clean up event listener to prevent unhandled rejection if operation
    // completes before timeout
    if (abortHandler) {
      timeoutSignal.removeEventListener('abort', abortHandler);
    }
  }
}
