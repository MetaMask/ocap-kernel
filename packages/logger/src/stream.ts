import { stringify } from '@metamask/kernel-utils';
import type { JsonRpcCall, JsonRpcMessage } from '@metamask/kernel-utils';
import { split } from '@metamask/streams';
import type { DuplexStream } from '@metamask/streams';
import { isJsonRpcNotification } from '@metamask/utils';

import type { LogEntry, LogLevel } from './types.ts';

export type SerializedLogEntry = [
  /* level   */ LogLevel,
  /* tags    */ string[],
  /* message */ string | null,
  /* data    */ string[] | null,
];

export type LogMessage = JsonRpcCall & {
  method: 'notify';
  params: ['logger', ...SerializedLogEntry];
};

/**
 * Serializes a log entry.
 *
 * @param entry - The log entry to serialize.
 * @param entry.level - The log level.
 * @param entry.tags - The log tags.
 * @param entry.message - The log message.
 * @param entry.data - The log data.
 * @returns The serialized log entry.
 */
export const lser = ({
  level,
  tags,
  message,
  data,
}: LogEntry): SerializedLogEntry => [
  level,
  tags,
  message ?? null,
  data?.map(stringify) ?? null,
];
harden(lser);

/**
 * Deserializes a log entry.
 *
 * @param params - The serialized log entry to deserialize.
 * @returns The deserialized log entry.
 */
export const lunser = (params: SerializedLogEntry): LogEntry => {
  const [level, tags, message, data] = params;
  const entry: LogEntry = { level, tags };
  if (message !== null) {
    entry.message = message;
  }
  if (data !== null) {
    entry.data = data.map((datum) => JSON.parse(datum));
  }
  return entry;
};
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
  (message as { params: { length: number } }).params.length > 0 &&
  (message as { params: unknown[] }).params[0] === 'logger';
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
