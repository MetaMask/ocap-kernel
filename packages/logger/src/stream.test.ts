import type { JsonRpcMessage } from '@metamask/kernel-utils';
import type { DuplexStream } from '@metamask/streams';
import { vi, describe, it, expect } from 'vitest';

import {
  isKernelMessage,
  isLogMessage,
  isLoggerMessage,
  lser,
  lunser,
  splitLoggerStream,
} from './stream.ts';

const mocks = vi.hoisted(() => ({
  split: vi.fn((a) => [a, a]),
}));

vi.mock('@ocap/streams', () => ({
  split: mocks.split,
}));

describe('serialization', () => {
  it.each`
    description | logEntry
    ${'with message and data'} | ${{
  level: 'info',
  tags: ['test'],
  message: 'test',
  data: ['test'],
}}
    ${'with message but no data'} | ${{
  level: 'info',
  tags: ['test'],
  message: 'test',
}}
    ${'with no message or data'} | ${{
  level: 'info',
  tags: ['test'],
}}
  `('round-trips a log entry $description', ({ logEntry }) => {
    const serialized = lser(logEntry);
    const deserialized = lunser(serialized);
    expect(deserialized).toStrictEqual(logEntry);
  });
});

const validParams = ['info', ['test']];
const unserializableParams = [() => undefined];

describe('isLogMessage', () => {
  it.each`
    description                | value                                                              | expectation
    ${'valid params'}          | ${{ method: 'log', params: validParams, jsonrpc: '2.0' }}          | ${true}
    ${'unserializable params'} | ${{ method: 'log', params: unserializableParams, jsonrpc: '2.0' }} | ${false}
    ${'invalid method'}        | ${{ method: 'ping', params: null, jsonrpc: '2.0' }}                | ${false}
  `('returns $expectation for $description', ({ value, expectation }) => {
    expect(isLogMessage(value)).toBe(expectation);
  });
});

describe('isKernelMessage', () => {
  it.each`
    description        | value                                                               | expectation
    ${'kernel method'} | ${{ method: 'ping', params: null, id: null, jsonrpc: '2.0' }}       | ${true}
    ${'logger method'} | ${{ method: 'log', params: validParams, id: null, jsonrpc: '2.0' }} | ${false}
  `('returns $expectation for $description', ({ value, expectation }) => {
    expect(isKernelMessage(value)).toBe(expectation);
  });
});

describe('isLoggerMessage', () => {
  it.each`
    description                | value                                                                        | expectation
    ${'valid params'}          | ${{ method: 'log', params: validParams, id: null, jsonrpc: '2.0' }}          | ${true}
    ${'unserializable params'} | ${{ method: 'log', params: unserializableParams, id: null, jsonrpc: '2.0' }} | ${false}
    ${'invalid method'}        | ${{ method: 'ping', params: null, id: null, jsonrpc: '2.0' }}                | ${false}
  `('returns $expectation for $description', ({ value, expectation }) => {
    expect(isLoggerMessage(value)).toBe(expectation);
  });
});

describe('splitLoggerStream', () => {
  it('splits a stream into a kernel stream and a logger stream', () => {
    const stream = {
      [Symbol.iterator]: vi.fn(() => stream),
      next: vi.fn(() => ({ done: true, value: undefined })),
    } as unknown as DuplexStream<JsonRpcMessage, JsonRpcMessage>;
    const { kernelStream, loggerStream } = splitLoggerStream(stream);
    expect(mocks.split).toHaveBeenCalledWith(
      stream,
      expect.any(Function),
      expect.any(Function),
    );
    expect(kernelStream).toStrictEqual(stream);
    expect(loggerStream).toStrictEqual(stream);
  });
});
