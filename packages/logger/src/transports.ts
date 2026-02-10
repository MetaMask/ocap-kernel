import type { JsonRpcMessage } from '@metamask/kernel-utils';
import type { DuplexStream } from '@metamask/streams';

import { logLevels } from './constants.ts';
import { lser } from './stream.ts';
import type { Transport, LogArgs, LogLevel, LogMethod } from './types.ts';

/**
 * The console transport for the logger.
 *
 * @param level - The logging level for this instance.
 * @returns A transport function that writes to the console.
 */
export function makeConsoleTransport(level: LogLevel = 'debug'): Transport {
  const baseLevelIdx = logLevels[level];
  const logFn = (method: LogLevel): LogMethod => {
    if (baseLevelIdx <= logLevels[method]) {
      return (...args: unknown[]) => {
        // Ultimately, a console somewhere is an acceptable terminal for logging
        // eslint-disable-next-line no-console
        console[method](...args);
      };
    }
    // eslint-disable-next-line no-empty-function
    return harden(() => {}) as LogMethod;
  };
  const filteredConsole = {
    debug: logFn('debug'),
    info: logFn('info'),
    log: logFn('log'),
    warn: logFn('warn'),
    error: logFn('error'),
  };
  const consoleTransport: Transport = (entry) => {
    const args = [
      ...(entry.tags.length > 0 ? [entry.tags] : []),
      ...(entry.message ? [entry.message] : []),
      ...(entry.data ?? []),
    ] as LogArgs;
    filteredConsole[entry.level](...args);
  };
  return consoleTransport;
}

/**
 * A console transport that omits tags from output. Useful for CLI tools
 * where the tag prefix (e.g. `['cli']`) is noise in terminal output.
 *
 * @param level - The logging level for this instance.
 * @returns A transport function that writes to the console without tags.
 */
export function makeTaglessConsoleTransport(
  level: LogLevel = 'debug',
): Transport {
  const baseLevelIdx = logLevels[level];
  const logFn = (method: LogLevel): LogMethod => {
    if (baseLevelIdx <= logLevels[method]) {
      return (...args: unknown[]) => {
        // eslint-disable-next-line no-console
        console[method](...args);
      };
    }
    // eslint-disable-next-line no-empty-function
    return harden(() => {}) as LogMethod;
  };
  const filteredConsole = {
    debug: logFn('debug'),
    info: logFn('info'),
    log: logFn('log'),
    warn: logFn('warn'),
    error: logFn('error'),
  };
  return (entry) => {
    const args = [
      ...(entry.message ? [entry.message] : []),
      ...(entry.data ?? []),
    ] as LogArgs;
    filteredConsole[entry.level](...args);
  };
}

/**
 * The stream transport for the logger. Expects the stream is listening for
 * log entries.
 *
 * @param stream - The stream to write the log entry to.
 * @returns A transport function that writes to the stream.
 */
export const makeStreamTransport = (
  stream: DuplexStream<JsonRpcMessage>,
): Transport => {
  return (entry) => {
    stream
      .write({
        method: 'notify',
        params: ['logger', lser(entry)],
        jsonrpc: '2.0',
      })
      // This is a last resort, but it's better than nothing
      // eslint-disable-next-line no-console
      .catch(console.debug);
  };
};

export const makeArrayTransport = (
  target: Parameters<Transport>[0][],
): Transport => {
  return (entry) => {
    target.push(entry);
  };
};
