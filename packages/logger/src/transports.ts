import type { JsonRpcMessage } from '@metamask/kernel-utils';
import type { DuplexStream } from '@metamask/streams';

import { lser } from './stream.ts';
import type { Transport } from './types.ts';

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
  // Ultimately, a console somewhere is an acceptable terminal for logging
  // eslint-disable-next-line no-console
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
