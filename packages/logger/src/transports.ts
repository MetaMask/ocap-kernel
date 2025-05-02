import type { DuplexStream } from '@metamask/streams';

import type { Transport, LogEntry } from './types.ts';

/**
 * The console transport for the logger.
 *
 * @param entry - The log entry to transport.
 */
export const consoleTransport: Transport = (entry) => {
  const args = [
    ...(entry.tags.length > 0 ? [entry.tags] : []),
    ...(entry.message ? [entry.message] : []),
    ...(entry.data ?? []),
  ];
  console[entry.level](...args);
};

/**
 * The stream transport for the logger. Expects the stream is listening for
 * log entries.
 *
 * @param stream - The stream to write the log entry to.
 * @returns A transport function that writes to the stream.
 */
export const makeStreamTransport = (
  stream: DuplexStream<LogEntry>,
): Transport => {
  return (entry) => {
    stream.write(entry).catch(console.debug);
  };
};
