export type Loggerish = {
  label: string;
  log: (...content: unknown[]) => void;
  debug: (...content: unknown[]) => void;
  error: (...content: unknown[]) => void;
};

/**
 * Temporary replacement for `@ocap/utils` logger pending @metamask/superstruct
 *
 * @param args - A bag of options.
 * @param args.label - An unused label for the logger.
 * @param args.verbose - Whether to log or squelch debug messages.
 * @returns A Loggerish object with log, debug and error methods.
 */
export const makeLogger = (args: {
  label: string;
  verbose?: boolean;
}): Loggerish => {
  const { label, verbose } = args;
  return {
    label,
    log: (...content: unknown[]) => console.log(label, ...content),
    debug: verbose
      ? (...content: unknown[]) => console.debug(label, ...content)
      : () => undefined,
    error: (...content: unknown[]) => console.error(label, ...content),
  };
};

export type StreamLogger<Content = unknown> = (
  stream: AsyncIterable<Content>,
) => Promise<string>;

/**
 * Make a stream consumer which logs intermediate progress to the writer
 * and promises the accumulated content upon stream completion.
 *
 * @param writer - Where to write the intermediate content.
 * @returns A promise for the accumulated content from the stream.
 */
export const makeStreamLogger = <Content = unknown>(
  writer: (content: unknown) => void,
): StreamLogger<Content> => {
  const streamLogger = async (
    stream: AsyncIterable<Content>,
  ): Promise<string> => {
    let accumulatedContent: string = '';
    for await (const content of stream) {
      accumulatedContent += content;
      writer(content);
    }
    return accumulatedContent;
  };
  return streamLogger;
};
