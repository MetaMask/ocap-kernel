import type { Logger } from '@metamask/logger';

import type { SampleCollector } from './types.ts';

export { ifDefined } from '@metamask/kernel-utils';

/**
 * Await a promise, and call the abort callback when done or on error.
 *
 * @param abort - The function to call to abort the operation.
 * @param func - The function to call to perform the operation.
 * @returns The result of the operation.
 */
export const withAbort = async <Result>(
  abort: () => Promise<void>,
  func: () => Promise<Result>,
): Promise<Result> => {
  try {
    return await func();
  } finally {
    await abort();
  }
};

/**
 * Gather a streaming response from a stream of chunks.
 *
 * @param args - The arguments to gather the streaming response.
 * @param args.stream - The stream to gather from.
 * @param args.parse - The incremental parser to use to parse the response.
 * @param args.logger - The logger to use for the gather.
 * @returns The parsed response.
 */
export const gatherStreamingResponse = async <Result>({
  stream,
  parse,
  logger,
}: {
  stream: AsyncIterable<{ response: string }>;
  parse: SampleCollector<Result>;
  logger?: Logger;
}): Promise<Result> => {
  for await (const chunk of stream) {
    const delta = (chunk as { response: string }).response;
    logger?.info('delta:', delta);
    const parsed = parse(delta);
    if (parsed !== null) {
      logger?.info('parsed:', parsed);
      return parsed;
    }
  }
  throw new Error('Stream ended without a parse event');
};

/**
 * Retry a function up to a given number of times.
 *
 * @param func - The function to retry.
 * @param maxRetries - The maximum number of times to retry.
 * @param isRetryable - A function that determines if an error should be retried. Defaults to always retrying.
 * @returns The result of the function.
 * @throws An error if the function fails after all retries.
 * @throws An error if the function throws an error that is not retryable.
 */
export const withRetries = async <Action, Observation>(
  func: () => Promise<[Action, Observation | null]>,
  maxRetries: number = 0,
  isRetryable: (error: unknown) => boolean = () => true,
): Promise<[Action, Observation | null]> => {
  if (maxRetries < 1) {
    return await func();
  }
  const errors: unknown[] = [];
  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      return await func();
    } catch (error) {
      if (!isRetryable(error)) {
        throw error;
      }
      errors.push(error);
    }
  }
  throw new Error(
    [
      `Exceeded retry budget of ${maxRetries}.`,
      ...errors.map((error, index) => {
        const message = error instanceof Error ? error.message : String(error);
        return `  ${index + 1}: ${message}`;
      }),
    ].join('\n'),
    { cause: errors },
  );
};
