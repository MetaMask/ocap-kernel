import type { JsonRpcMessage } from '@metamask/kernel-utils';
import type { DuplexStream } from '@metamask/streams';
import { describe, expect, it, vi } from 'vitest';

import { logLevels } from './constants.ts';
import {
  makeConsoleTransport,
  makeTaglessConsoleTransport,
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
  it.each(Object.keys(logLevels))(
    'logs to the appropriate console alias: %s',
    (levelString: string) => {
      const consoleTransport = makeConsoleTransport();
      const level = levelString as LogLevel;
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

describe('taglessConsoleTransport', () => {
  it.each(Object.keys(logLevels))(
    'logs without tags for level: %s',
    (levelString: string) => {
      const transport = makeTaglessConsoleTransport();
      const level = levelString as LogLevel;
      const logEntry = makeLogEntry(level);
      const consoleMethodSpy = vi.spyOn(console, level);
      transport(logEntry);
      expect(consoleMethodSpy).toHaveBeenCalledWith(logEntry.message);
    },
  );

  it('omits tags from output', () => {
    const transport = makeTaglessConsoleTransport();
    const entry: LogEntry = {
      level: 'info',
      message: 'hello',
      tags: ['cli', 'daemon'],
      data: ['extra'],
    };
    const spy = vi.spyOn(console, 'info');
    transport(entry);
    expect(spy).toHaveBeenCalledWith('hello', 'extra');
  });
});

describe('makeStreamTransport', () => {
  it('writes to the stream', () => {
    const logLevel = 'info';
    const logEntry = makeLogEntry(logLevel);
    const mockStream = {
      write: vi.fn().mockResolvedValue(undefined),
    } as unknown as DuplexStream<JsonRpcMessage>;
    const streamTransport = makeStreamTransport(mockStream);
    streamTransport(logEntry);
    expect(mockStream.write).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'notify',
        params: [
          'logger',
          '{"level":"info","message":"test-message","tags":["test-tag"]}',
        ],
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
