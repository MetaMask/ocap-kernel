import type { IncrementalParser } from './json/parser';

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
