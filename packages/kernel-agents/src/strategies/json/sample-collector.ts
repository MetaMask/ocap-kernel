import { SampleGenerationError } from '@metamask/kernel-errors';
import type { Logger } from '@metamask/logger';
import { parse, MalformedJSON, PartialJSON } from 'partial-json';

import type { SampleCollector } from '../../types.ts';

/**
 * A sample collector for a streaming JSON object response.
 *
 * Uses `partial-json` for a three-way check on each chunk:
 * - **Complete** — `parse(buffer, 0)` returns the parsed object.
 * - **Incomplete** — throws `PartialJSON`, meaning the buffer is valid so far.
 * - **Malformed** — throws `MalformedJSON`, meaning the buffer is irrecoverable.
 *
 * @param args - The arguments to make the sample collector.
 * @param args.prefix - The prefix to prepend to the response
 * @param args.maxChunkCount - The maximum number of chunks to parse
 * @param args.logger - The logger to use for the sample collector
 * @returns A function that collects a delta of a streaming response,
 *   returning the result value if collecting is complete or null otherwise.
 */
export const makeSampleCollector = <Result = unknown>({
  prefix = '',
  maxChunkCount = 200,
  logger,
}: {
  prefix?: string;
  maxChunkCount?: number;
  logger?: Logger;
}): SampleCollector<Result> => {
  let response = prefix;
  let chunkCount = 0;
  return (delta: string) => {
    chunkCount += 1;
    response += delta;
    logger?.info('toParse:', response);

    try {
      const result = parse(response, 0);
      logger?.info('parsed:', result);
      return result;
    } catch (error) {
      if (error instanceof PartialJSON) {
        // Buffer is incomplete but structurally valid.
      } else if (error instanceof MalformedJSON) {
        throw new SampleGenerationError(response, error);
      } else {
        throw error;
      }
    }

    if (maxChunkCount && chunkCount > maxChunkCount) {
      throw new SampleGenerationError(
        response,
        new Error('Max chunk count reached'),
      );
    }
    return null;
  };
};
