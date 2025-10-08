import type { Logger } from '@metamask/logger';

export type MakeIncrementalParserArgs = {
  prefix?: string;
  maxChunkCount?: number;
  logger?: Logger;
};
export type IncrementalParser<Result = unknown> = (
  delta: string,
) => Result | null;
/**
 * A quick and dirty 'incremental' parser for a streaming response.
 *
 * @param args - The arguments to make the incremental parser.
 * @param args.prefix - The prefix to prepend to the response
 * @param args.maxChunkCount - The maximum number of chunks to parse
 * @param args.logger - The logger to use for the incremental parser
 * @returns An async function that parses a delta of a streaming response,
 *   returning the result value if parsing is complete or null otherwise.
 */
export const makeIncrementalParser = <Result = unknown>({
  prefix = '',
  maxChunkCount = 200,
  logger,
}: MakeIncrementalParserArgs): IncrementalParser<Result> => {
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
        return JSON.parse(response);
      } catch (error) {
        // XXX There are other ways to detect an irrecoverable state.
        // This is the simplest.
        if (leftBracketCount === rightBracketCount) {
          throw error;
        }
      }
    }
    leftBracketCount += lastSubchunk.split('{').length - 1;
    response += lastSubchunk;
    if (maxChunkCount && chunkCount > maxChunkCount) {
      throw new Error(`Max chunk count reached with response:\n${response}`);
    }
    return null;
  };
};

/**
 * Gather a streaming response from an stream of chunks.
 *
 * @param args - The arguments to gather the streaming response.
 * @param args.stream - The stream to gather from.
 * @param args.parse - The incremental parser to use to parse the response.
 * @returns The parsed response.
 */
export const gatherStreamingResponse = async <Result>({
  stream,
  parse,
}: {
  stream: AsyncIterable<{ response: string }>;
  parse: IncrementalParser<Result>;
}): Promise<Result> => {
  for await (const chunk of stream) {
    const delta = (chunk as { response: string }).response;
    const parsed = parse(delta);
    if (parsed !== null) {
      return parsed;
    }
  }
  throw new Error('stream ended without a parse event');
};
