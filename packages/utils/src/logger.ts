/**
 * Aliases for logging messages to a terminal
 */
const consoleMethods = ['log', 'debug', 'info', 'warn', 'error'] as const;

export type Logger<Label extends string = string> = {
  label: Label;
} & Console;

type LoggerMethod = keyof Console & (typeof consoleMethods)[number];

/**
 * Make a proxy console which prepends the given label to its outputs.
 *
 * @param label - The label with which to prefix console outputs.
 * @param baseConsole - The base console to log to.
 * @returns A console prefixed with the given label.
 */
export const makeLogger = <Label extends string>(
  label: Label,
  baseConsole: Console = console,
): Logger<Label> => {
  /**
   * Prepends the label to the beginning of the args of the baseConsole method.
   *
   * @param methodName - The method to prefix.
   * @returns The modified method.
   */
  const prefixed = (
    methodName: LoggerMethod,
  ): [LoggerMethod, Console[typeof methodName]] => {
    const method: Console[typeof methodName] = baseConsole[methodName];
    return [
      methodName,
      ((message?: unknown, ...optionalParams: unknown[]) =>
        method(
          label,
          ...(message ? [message, ...optionalParams] : optionalParams),
        )) as Console[typeof methodName],
    ];
  };

  return {
    label,
    ...Object.fromEntries(consoleMethods.map(prefixed)),
  } as Logger<Label>;
};
