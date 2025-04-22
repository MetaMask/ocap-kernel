import { Logger } from './logger.ts';
import { consoleTransport } from './transports.ts';

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
    : new Logger({ tags: [label], transports: [consoleTransport] });
};
