import type { DuplexStream } from '@ocap/streams';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { consoleTransport, makeStreamTransport } from './transports.ts';
import type { LogAlias, LogEntry, LogLevel, Transport } from './types.ts';

const makeLogEntry = (level: LogLevel): LogEntry => ({
  level,
  message: 'test-message',
  tags: ['test-tag'],
});

const logAliases = ['log', 'info', 'debug', 'warn', 'error'] as const;

describe('consoleTransport', () => {
  it.each(logAliases)(
    'logs to the appropriate console alias: %s',
    (level: LogAlias) => {
      const logEntry = makeLogEntry(level);
      const consoleMethodSpy = vi.spyOn(console, level);
      consoleTransport(logEntry);
      expect(consoleMethodSpy).toHaveBeenCalledWith(
        logEntry.tags,
        logEntry.message,
      );
    },
  );

  it('does not log silent messages', () => {
    const consoleMethodSpies = logAliases.map((alias) =>
      vi.spyOn(console, alias),
    );
    consoleTransport(makeLogEntry('silent'));
    consoleMethodSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
});

describe('makeStreamTransport', () => {
  let mockStream: DuplexStream<LogEntry>;
  let streamTransport: Transport;

  beforeEach(() => {
    mockStream = {
      write: vi.fn().mockResolvedValue(undefined),
    } as unknown as DuplexStream<LogEntry>;
    streamTransport = makeStreamTransport(mockStream);
  });

  it('writes to the stream', () => {
    const logEntry = makeLogEntry('info');
    streamTransport(logEntry);
    expect(mockStream.write).toHaveBeenCalledWith(logEntry);
  });

  it('does not write silent messages', () => {
    const logEntry = makeLogEntry('silent');
    streamTransport(logEntry);
    expect(mockStream.write).not.toHaveBeenCalled();
  });
});
