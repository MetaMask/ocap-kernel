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
}): {
  label: string;
  log: (...content: unknown[]) => void;
  debug: (...content: unknown[]) => void;
  error: (...content: unknown[]) => void;
} => {
  const { label, verbose } = args;
  return {
    label,
    log: (...content: unknown[]) => console.log(label, ...content),
    debug: verbose
      ? ((...content: unknown[]) => console.debug(label, ...content))
      : () => undefined,
    error: (...content: unknown[]) => console.error(label, ...content),
  };
};
