import { describe, it, expect } from 'vitest';

import { isLogMessage, lser, lunser } from './stream.ts';

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

describe('isLogMessage', () => {
  const validParams = ['info', ['test'], 'test', ['test']];
  const unserializableParams = [() => undefined];
  it.each`
    description                | value                                                              | expectation
    ${'valid params'}          | ${{ method: 'log', params: validParams, jsonrpc: '2.0' }}          | ${true}
    ${'unserializable params'} | ${{ method: 'log', params: unserializableParams, jsonrpc: '2.0' }} | ${false}
    ${'invalid method'}        | ${{ method: 'ping', params: null, jsonrpc: '2.0' }}                | ${false}
  `('returns $expectation for $description', ({ value, expectation }) => {
    expect(isLogMessage(value)).toBe(expectation);
  });
});
