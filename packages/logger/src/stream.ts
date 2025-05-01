import { isJsonRpcCall, stringify } from '@metamask/kernel-utils';
import type { JsonRpcCall, JsonRpcMessage } from '@metamask/kernel-utils';
import { split } from '@metamask/streams';
import type { DuplexStream } from '@metamask/streams';
import { isJsonRpcRequest } from '@metamask/utils';
import type { JsonRpcRequest } from '@metamask/utils';

import type { LogEntry, LogLevel } from './types.ts';

type SerializedLogEntry = [
  /* level   */ LogLevel,
  /* tags    */ string[],
  /* message */ string | null,
  /* data    */ string[] | null,
];

export type LogMessage = JsonRpcCall & {
  method: 'log';
  params: SerializedLogEntry;
};

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

export const isLogMessage = (message: JsonRpcMessage): message is LogMessage =>
  isJsonRpcCall(message) && message.method === 'log';

export const isLoggerMessage = (
  message: JsonRpcMessage,
): message is JsonRpcRequest & { method: 'log' } =>
  isJsonRpcRequest(message) && message.method === 'log';

export const isKernelMessage = (
  message: JsonRpcMessage,
): message is JsonRpcRequest => !isLoggerMessage(message);

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
