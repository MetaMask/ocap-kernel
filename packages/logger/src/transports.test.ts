import type { DuplexStream } from '@metamask/streams';
import { describe, expect, it, vi } from 'vitest';

import { logLevels } from './constants.ts';
import { consoleTransport, makeStreamTransport } from './transports.ts';
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
    } as unknown as DuplexStream<LogEntry>;
    const streamTransport = makeStreamTransport(mockStream);
    streamTransport(logEntry);
    expect(mockStream.write).toHaveBeenCalledWith(logEntry);
  });
});
