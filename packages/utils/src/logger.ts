/**
 * Aliases for logging messages to a terminal
 */
const consoleMethods = ['log', 'debug', 'info', 'warn', 'error'] as const;

export type Logger = Console & { tags?: string[] };

export type LogLevel = (typeof consoleMethods)[number] | 'silent';

export const DEFAULT_LEVEL: LogLevel = 'info';

export type LoggerContext = {
  level?: LogLevel;
  tags?: string[];
};

export type Transport = (context: LoggerContext, ...args: unknown[]) => void;

const consoleTransport: Transport = (context, ...args) => {
  const method = {
    log: console.log,
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
    silent: () => undefined,
  }[context.level ?? DEFAULT_LEVEL];
  method(...[...(context.tags ?? []), ...args]);
};

/**
 * Make a proxy console which prepends the given label to its outputs.
 *
 * @param label - The label with which to prefix console outputs.
 * @param baseConsole - The base console to log to.
 * @param transports - A list of methods which deliver the logs to storage, terminal, etc.
 * @returns A console prefixed with the given label.
 */
export const makeLogger = <Label extends string>(
  label: Label,
  baseConsole: Logger = console,
  transports: Transport[] = [],
): Logger => {
  const dispatch = (context: LoggerContext, ...args: unknown[]): void => {
    const errors = [consoleTransport, ...transports]
      .map((transport) => {
        try {
          transport(context, ...args);
          return undefined;
        } catch (error) {
          return error;
        }
      })
      .filter(Boolean);
    if (errors.length > 0) {
      console.error('logging dispatch failed:', ...errors);
    }
  };

  const isLogLevel = (method: string): method is LogLevel => {
    return ['silent', ...consoleMethods].includes(method as LogLevel);
  };

  const tags = [...(baseConsole.tags ?? []), label];

  return new Proxy(
    { ...baseConsole },
    {
      get(_target, prop: string, _receiver) {
        if (prop === 'dispatch') {
          return dispatch;
        }
        if (prop === 'tags') {
          return tags;
        }
        if (isLogLevel(prop)) {
          return (...args: unknown[]) =>
            dispatch({ tags, level: prop }, ...args);
        }
        return baseConsole[prop as keyof typeof baseConsole];
      },
    },
  );
};

/**
 * Creates a test logger with stable method references that tests can easily spy on.
 * All logger methods are implemented as no-ops but have stable references for spying.
 *
 * @returns A Logger instance with stable method references
 */
export const makeMockLogger = (): Logger => {
  const logger: Record<string, unknown> = {};

  // Create stable method references for all console methods
  consoleMethods.forEach((method) => {
    logger[method] = (..._args: unknown[]): void => {
      // No-op implementation
    };
  });

  return logger as unknown as Logger;
};
