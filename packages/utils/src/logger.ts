/**
 * A Logger is a logging facility that supports multiple transports and tags.
 * The transports are the actual logging functions, and the tags are used to
 * identify the source of the log message independent of its location in the
 * code.
 *
 * @example
 * ```ts
 * const logger = new Logger('my-logger');
 * logger.info('Hello, world!');
 * >>> [my-logger] Hello, world!
 * ```
 *
 * Sub-loggers can be created by calling the `subLogger` method. They inherit
 * the tags and transports of their parent logger, and can add additional tags
 * to their own messages.
 *
 *
 * @example
 * ```ts
 * const subLogger = logger.subLogger({ tags: ['sub'] });
 * subLogger.info('Hello, world!');
 * >>> [my-logger, sub] Hello, world!
 * ```
 *
 * The transports can be configured to ignore certain log levels, or to write
 * different tags to different destinations, and so on. The default transports
 * write to the console, but other transports can be added by passing a custom
 * transport function to the constructor. The transports must be synchronous,
 * but they can initiate asynchronous operations if needed.
 *
 * @example
 * ```ts
 * const logger = new Logger('my-logger', {
 *   transports: [
 *     (entry) => {
 *       if (entry.tags.includes('vat')) {
 *         fs.writeFile('vat.log', `${entry.message}\n`, { flag: 'a' }).catch(
 *           (error) => {
 *             console.error('Error writing to vat.log:', error);
 *           },
 *         );
 *       }
 *     },
 *   ],
 * });
 * ```
 */

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

type LogMethod = (...args: LogArgs) => void;

type LogAlias = 'debug' | 'info' | 'log' | 'warn' | 'error';

/**
 * The logger class.
 */
export class Logger {
  readonly #options: LoggerOptions;

  log: LogMethod;

  debug: LogMethod;

  info: LogMethod;

  warn: LogMethod;

  error: LogMethod;

  /**
   * The constructor for the logger. Sub-loggers can be created by calling the
   * `subLogger` method. Sub-loggers inherit the transports and tags of their
   * parent logger.
   *
   * @param options - The options for the logger.
   * @param options.transports - The transports, which deliver the log messages
   *   to the appropriate destination.
   * @param options.level - The log level for the logger, used as a default
   *   argument for the transports.
   * @param options.tags - The tags for the logger, which are accumulated by
   *   sub-loggers and passed to the transports.
   */
  constructor(options: LoggerOptions = {}) {
    this.#options = options;

    // Create aliases for the log methods, allowing them to be used in a
    // manner similar to the console object.
    const bind = (alias: LogAlias): LogMethod =>
      this.#dispatch.bind(this, {
        ...this.#options,
        level: alias as LogLevel,
      }) as LogMethod;
    this.log = bind('log');
    this.debug = bind('debug');
    this.info = bind('info');
    this.warn = bind('warn');
    this.error = bind('error');
  }

  subLogger(options: LoggerOptions = {}): Logger {
    return new Logger(mergeOptions(this.#options, options));
  }

  #dispatch(options: LoggerOptions, ...args: LogArgs): void {
    const { transports, level, tags } = mergeOptions(this.#options, options);
    const [message, ...data] = args;
    const entry: LogEntry = harden({ level, tags, message, data });
    [consoleTransport, ...transports].forEach((transport) => transport(entry));
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
