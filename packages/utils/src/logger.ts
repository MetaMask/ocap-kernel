/**
 * The log level for the logger.
 */
export type LogLevel = 'debug' | 'info' | 'log' | 'warn' | 'error' | 'silent';

/**
 * The log entry for the logger.
 */
export type LogEntry = {
  level: LogLevel;
  tags: string[];
  message?: string | undefined;
  data?: unknown[];
};

/**
 * The transport for the logger.
 */
export type Transport = (entry: LogEntry) => void;

/**
 * The console transport for the logger.
 *
 * @param entry - The log entry to transport.
 */
export const consoleTransport: Transport = (entry) => {
  if (entry.level === 'silent') {
    return;
  }
  const args = [
    ...(entry.tags.length > 0 ? [entry.tags] : []),
    ...(entry.message ? [entry.message] : []),
    ...(entry.data ?? []),
  ];
  console[entry.level](...args);
};

/**
 * The options for the logger.
 */
export type LoggerOptions = {
  transports?: Transport[];
  level?: LogLevel;
  tags?: string[];
};

/**
 * The default options for the logger.
 */
export const DEFAULT_OPTIONS: Required<LoggerOptions> = {
  transports: [],
  level: 'info',
  tags: [],
};

/**
 * A slow (O(n^2)) way to uniquify an array.
 *
 * @param array - The array to filter.
 * @returns The array, without duplicate values.
 */
const unique = <Element>(array: Element[]): Element[] => {
  return array.filter(
    (element, index, self) => self.indexOf(element) === index,
  );
};

/**
 * Merges multiple logger options into a single options object.
 *
 * @param options - The options to merge.
 * @returns The merged options.
 */
export const mergeOptions = (
  ...options: LoggerOptions[]
): Required<LoggerOptions> =>
  options.reduce<Required<LoggerOptions>>(
    (acc, option) =>
      ({
        transports: unique([...acc.transports, ...(option.transports ?? [])]),
        level: option.level ?? acc.level,
        tags: unique([...acc.tags, ...(option.tags ?? [])]),
      }) as Required<LoggerOptions>,
    DEFAULT_OPTIONS,
  );

type LogArgs = [string, ...unknown[]] | [];

/**
 * The logger class.
 */
export class Logger {
  readonly #options: LoggerOptions;

  constructor(options: LoggerOptions = {}) {
    this.#options = options;
  }

  subLogger(options: LoggerOptions = {}): Logger {
    return new Logger(mergeOptions(this.#options, options));
  }

  #dispatch(options: LoggerOptions, args: LogArgs): void {
    const { transports, level, tags } = mergeOptions(this.#options, options);
    const [message, ...data] = args;
    const entry: LogEntry = harden({ level, tags, message, data });
    [consoleTransport, ...transports].forEach((transport) => transport(entry));
  }

  debug(...args: LogArgs): void {
    this.#dispatch({ ...this.#options, level: 'debug' }, args);
  }

  info(...args: LogArgs): void {
    this.#dispatch({ ...this.#options, level: 'info' }, args);
  }

  log(...args: LogArgs): void {
    this.#dispatch({ ...this.#options, level: 'log' }, args);
  }

  warn(...args: LogArgs): void {
    this.#dispatch({ ...this.#options, level: 'warn' }, args);
  }

  error(...args: LogArgs): void {
    this.#dispatch({ ...this.#options, level: 'error' }, args);
  }
}

/**
 * The logger factory function.
 *
 * @deprecated Use `Logger` constructor or `Logger.subLogger` instead.
 *
 * @param label - The label for the logger.
 * @param parentLogger - The parent logger.
 * @returns The logger.
 */
export const makeLogger = (label: string, parentLogger?: Logger): Logger => {
  return parentLogger
    ? parentLogger.subLogger({ tags: [label] })
    : new Logger({ tags: [label] });
};
