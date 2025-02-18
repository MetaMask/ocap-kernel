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
  log: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
} => {
  const { label, verbose } = args;
  return {
    label,
    log: console.log,
    debug: verbose ? console.debug : () => undefined,
    error: console.error,
  };
};
