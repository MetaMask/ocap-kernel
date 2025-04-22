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
 * The options for the logger.
 */
export type LoggerOptions = {
  transports?: Transport[];
  level?: LogLevel;
  tags?: string[];
};

export type LogArgs = [string, ...unknown[]] | [];

export type LogMethod = (...args: LogArgs) => void;

export type LogAlias = 'debug' | 'info' | 'log' | 'warn' | 'error';
