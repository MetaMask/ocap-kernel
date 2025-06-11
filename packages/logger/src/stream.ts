import type { JsonRpcCall, JsonRpcMessage } from '@metamask/kernel-utils';
import { split } from '@metamask/streams';
import type { DuplexStream } from '@metamask/streams';
import { isJsonRpcNotification } from '@metamask/utils';

import { TOKEN_UNDEFINED } from './constants.ts';
import type { LogEntry } from './types.ts';

export type LogMessage = JsonRpcCall & {
  method: 'notify';
  params: ['logger', string];
};

/**
 * Serializes a log entry.
 *
 * @param entry - The log entry to serialize.
 * @returns The serialized log entry.
 */
export const lser = (entry: LogEntry): string =>
  JSON.stringify(entry, (_key, value) =>
    value === undefined ? TOKEN_UNDEFINED : value,
  );
harden(lser);

/**
 * Deserializes a log entry.
 *
 * @param serializedEntry - The serialized log entry to deserialize.
 * @returns The deserialized log entry.
 */
export const lunser = (serializedEntry: string): LogEntry =>
  JSON.parse(serializedEntry, (_key, value) =>
    value === TOKEN_UNDEFINED ? undefined : value,
  ) as LogEntry;
harden(lunser);

/**
 * Checks if a message is a logger message.
 *
 * @param message - The message to check.
 * @returns Whether the message is a logger message.
 */
export const isLoggerMessage = (
  message: JsonRpcMessage,
): message is LogMessage =>
  isJsonRpcNotification(message) &&
  Array.isArray(message.params) &&
  message.params.length > 0 &&
  message.params[0] === 'logger' &&
  typeof message.params[1] === 'string';
harden(isLoggerMessage);

/**
 * Checks if a message is a kernel message. A kernel message is any message
 * which is not a logger message.
 *
 * @param message - The message to check.
 * @returns Whether the message is a kernel message.
 */
export const isKernelMessage = (
  message: JsonRpcMessage,
): message is JsonRpcMessage => !isLoggerMessage(message);
harden(isKernelMessage);

/**
 * Splits a stream into a kernel stream and a logger stream.
 *
 * @param stream - The stream to split.
 * @returns An object containing the kernel stream and the logger stream.
 */
export const splitLoggerStream = <Write>(
  stream: DuplexStream<JsonRpcMessage, Write>,
): {
  kernelStream: DuplexStream<JsonRpcMessage, Write>;
  loggerStream: DuplexStream<JsonRpcMessage, Write>;
} => {
  const [kernelStream, loggerStream] = split(
    stream,
    isKernelMessage,
    isLoggerMessage,
  ) as [
    DuplexStream<JsonRpcMessage, Write>,
    DuplexStream<JsonRpcMessage, Write>,
  ];
  return { kernelStream, loggerStream };
};
harden(splitLoggerStream);
