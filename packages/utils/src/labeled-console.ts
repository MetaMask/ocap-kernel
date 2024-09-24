/**
 * An interface for logging messages to a terminal
 */
const consolePrototype = {
  log: console.log,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
} as const;

type ConsolePrototype = typeof consolePrototype;

type LabeledConsole<Label extends string> = {
  label: Label;
} & ConsolePrototype;

type LabeledConsoleKey = keyof Omit<LabeledConsole<string>, 'label'>;

/**
 * Make a proxy console which prepends the given label to its outputs.
 *
 * @param label - The label with which to prefix console outputs.
 * @param baseConsole - The base console to log to.
 * @returns A console prefixed with the given label.
 */
export const makeLabeledConsole = <Label extends string>(
  label: Label,
  baseConsole: ConsolePrototype = console,
): LabeledConsole<Label> => {
  /**
   * Prepends the label to the beginning of the args of the baseConsole method.
   *
   * @param methodName - The method to prefix.
   * @returns The modified method.
   */
  const prefixed = (
    methodName: keyof Omit<LabeledConsole<string>, 'label'>,
  ): [LabeledConsoleKey, LabeledConsole<Label>[typeof methodName]] => {
    const method = baseConsole[methodName];
    return [
      methodName,
      (message?, ...optionalParams) =>
        method(
          label,
          ...(message ? [message, ...optionalParams] : optionalParams),
        ),
    ];
  };

  const keys = Object.keys(consolePrototype) as LabeledConsoleKey[];
  return {
    label,
    ...(Object.fromEntries(keys.map(prefixed)) as ConsolePrototype),
  };
};
