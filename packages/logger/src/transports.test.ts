import type { JsonRpcMessage } from '@metamask/kernel-utils';
import type { DuplexStream } from '@metamask/streams';
import { describe, expect, it, vi } from 'vitest';

import { logLevels } from './constants.ts';
import {
  consoleTransport,
  makeArrayTransport,
  makeStreamTransport,
} from './transports.ts';
import type { LogEntry, LogLevel } from './types.ts';

const makeLogEntry = (level: LogLevel): LogEntry => ({
  level,
  message: 'test-message',
  tags: ['test-tag'],
});

describe('consoleTransport', () => {
  it.each(logLevels)(
    'logs to the appropriate console alias: %s',
    (level: LogLevel) => {
      const logEntry = makeLogEntry(level);
      const consoleMethodSpy = vi.spyOn(console, level);
      consoleTransport(logEntry);
      expect(consoleMethodSpy).toHaveBeenCalledWith(
        logEntry.tags,
        logEntry.message,
      );
    },
  );
});

describe('makeStreamTransport', () => {
  it('writes to the stream', () => {
    const logEntry = makeLogEntry('info');
    const mockStream = {
      write: vi.fn().mockResolvedValue(undefined),
    } as unknown as DuplexStream<JsonRpcMessage>;
    const streamTransport = makeStreamTransport(mockStream);
    streamTransport(logEntry);
    expect(mockStream.write).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'log',
        params: expect.any(Array),
        jsonrpc: '2.0',
      }),
    );
  });
});

describe('makeArrayTransport', () => {
  it('writes to the array', () => {
    const target: LogEntry[] = [];
    const arrayTransport = makeArrayTransport(target);
    const logEntry = makeLogEntry('info');
    arrayTransport(logEntry);
    expect(target).toStrictEqual([logEntry]);
  });
});
