import { delay } from './misc.ts';

export type RetryBackoffOptions = Readonly<{
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  onRetry?: (
    details: Readonly<{ attempt: number; delayMs: number; error: unknown }>,
  ) => void;
  shouldRetry?: (error: unknown) => boolean;
}>;

const DEFAULT_RETRY_OPTIONS: Required<
  Omit<RetryBackoffOptions, 'onRetry' | 'shouldRetry'>
> & {
  onRetry?: RetryBackoffOptions['onRetry'];
  shouldRetry?: RetryBackoffOptions['shouldRetry'];
} = {
  maxAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  jitter: true,
  onRetry: undefined,
  shouldRetry: undefined,
};

/**
 * Compute the backoff delay for the given parameters.
 *
 * @param baseDelayMs - The base delay in milliseconds.
 * @param maxDelayMs - The maximum delay in milliseconds.
 * @param attemptIndex - The attempt index.
 * @param jitter - Whether to add jitter to the delay.
 * @returns The computed backoff delay.
 */
function computeBackoffDelay(
  baseDelayMs: number,
  maxDelayMs: number,
  attemptIndex: number,
  jitter: boolean,
): number {
  const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** attemptIndex);
  if (!jitter || cap <= baseDelayMs) {
    return baseDelayMs;
  }
  return Math.floor(baseDelayMs + Math.random() * (cap - baseDelayMs));
}

/**
 * Retry an async operation with exponential backoff and optional jitter.
 *
 * Attempts the operation up to `maxAttempts` times. Between attempts, waits
 * for an exponentially increasing delay starting at `baseDelayMs` and capped
 * at `maxDelayMs`. When `jitter` is true, a random value in
 * [baseDelayMs, currentCap] is used to spread retries.
 *
 * The `onRetry` callback, if provided, is called after a failed attempt and
 * before the delay for the next attempt. It is passed the next attempt number
 * (1-based), the computed delay in milliseconds, and the error that caused the
 * retry.
 *
 * The `shouldRetry` predicate, if provided, determines whether a specific
 * error should trigger a retry.
 *
 * @param operation - The operation to retry.
 * @param options - Backoff and behavior options.
 * @returns The successful result of the operation.
 * @throws The last encountered error if all attempts fail.
 */
export async function retryWithBackoff<OperationResult>(
  operation: () => Promise<OperationResult>,
  options: RetryBackoffOptions = {},
): Promise<OperationResult> {
  const { maxAttempts, baseDelayMs, maxDelayMs, jitter, onRetry, shouldRetry } =
    { ...DEFAULT_RETRY_OPTIONS, ...options };

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const willRetry =
        attempt < maxAttempts && (shouldRetry ? shouldRetry(error) : true);
      if (!willRetry) {
        break;
      }

      const delayMs = computeBackoffDelay(
        baseDelayMs,
        maxDelayMs,
        attempt - 1,
        Boolean(jitter),
      );
      if (onRetry) {
        onRetry({ attempt: attempt + 1, delayMs, error });
      }
      await delay(delayMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Retry operation failed');
}
