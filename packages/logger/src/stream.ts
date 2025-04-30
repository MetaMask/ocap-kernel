import { isJsonRpcCall, stringify } from '@metamask/kernel-utils';
import type { JsonRpcCall, JsonRpcMessage } from '@metamask/kernel-utils';

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
