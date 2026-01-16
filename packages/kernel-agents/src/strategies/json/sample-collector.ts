import { SampleGenerationError } from '@metamask/kernel-errors/bundleable';
import type { Logger } from '@metamask/logger';

import type { SampleCollector } from '../../types.ts';

/**
 * A quick and dirty sample collector for a streaming response.
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
  let leftBracketCount = prefix.split('{').length - 1;
  let rightBracketCount = prefix.split('}').length - 1;
  return (delta: string) => {
    chunkCount += 1;
    const subchunks = delta.split('}');
    const lastSubchunk = subchunks.pop() as string;
    for (const subchunk of subchunks) {
      rightBracketCount += 1;
      leftBracketCount += subchunk.split('{').length - 1;
      response += `${subchunk}}`;
      logger?.info('toParse:', response);
      try {
        const result = JSON.parse(response);
        logger?.info('parsed:', result);
        return result;
      } catch (cause) {
        // XXX There are other ways to detect an irrecoverable state.
        // This is the simplest.
        if (leftBracketCount === rightBracketCount) {
          throw new SampleGenerationError(
            response,
            cause instanceof Error
              ? cause
              : new Error('Invalid JSON', { cause }),
          );
        }
      }
    }
    leftBracketCount += lastSubchunk.split('{').length - 1;
    response += lastSubchunk;
    if (maxChunkCount && chunkCount > maxChunkCount) {
      throw new SampleGenerationError(
        response,
        new Error('Max chunk count reached'),
      );
    }
    return null;
  };
};
