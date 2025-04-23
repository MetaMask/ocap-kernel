import type { logLevels } from './constants.ts';

/**
 * The log level for the logger.
 */
export type LogLevel = (typeof logLevels)[number];

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
