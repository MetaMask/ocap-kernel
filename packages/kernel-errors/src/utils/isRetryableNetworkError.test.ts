import { MuxerClosedError } from '@libp2p/interface';
import { describe, it, expect } from 'vitest';

import { isRetryableNetworkError } from './isRetryableNetworkError.ts';

describe('isRetryableNetworkError', () => {
  describe('libp2p errors', () => {
    it('returns true for MuxerClosedError', () => {
      const error = new MuxerClosedError('Muxer closed');
      expect(isRetryableNetworkError(error)).toBe(true);
    });

    it.each([
      { name: 'DialError' },
      { name: 'TransportError' },
      { name: 'WebRTCDialError' },
      { name: 'SomeTransportFailure' },
      { name: 'CustomDialTimeout' },
    ])(
      'returns true for errors with name containing Dial or Transport: $name',
      ({ name }) => {
        const error = new Error('Connection failed');
        error.name = name;
        expect(isRetryableNetworkError(error)).toBe(true);
      },
    );
  });

  describe('Node.js network error codes', () => {
    it.each([
      { code: 'ECONNRESET', description: 'connection reset by peer' },
      { code: 'ETIMEDOUT', description: 'operation timed out' },
      { code: 'EPIPE', description: 'broken pipe' },
      { code: 'ECONNREFUSED', description: 'connection refused' },
      { code: 'EHOSTUNREACH', description: 'no route to host' },
      { code: 'ENETUNREACH', description: 'network unreachable' },
    ])('returns true for $code ($description)', ({ code }) => {
      const error = new Error('Network error') as Error & { code: string };
      error.code = code;
      expect(isRetryableNetworkError(error)).toBe(true);
    });
  });

  describe('default retryable behavior', () => {
    it.each([
      {
        name: 'generic Error',
        error: new Error('Generic error'),
      },
      {
        name: 'error with unrecognized code',
        error: Object.assign(new Error('Unknown error'), { code: 'EUNKNOWN' }),
      },
      {
        name: 'error with unrecognized name',
        error: Object.assign(new Error('Unknown error'), {
          name: 'UnknownError',
        }),
      },
    ])('returns true for $name (default behavior)', ({ error }) => {
      expect(isRetryableNetworkError(error)).toBe(true);
    });
  });

  it.each([
    { name: 'null', value: null },
    { name: 'undefined', value: undefined },
    { name: 'string', value: 'error string' },
    { name: 'number', value: 42 },
    { name: 'plain object', value: { message: 'error' } },
    {
      name: 'object with code but no name',
      value: { code: 'CUSTOM_CODE', message: 'error' },
    },
    {
      name: 'object with name but no code',
      value: { name: 'CustomError', message: 'error' },
    },
    {
      name: 'Error with empty name',
      value: Object.assign(new Error('test'), { name: '' }),
    },
  ])('returns true for $name', ({ value }) => {
    expect(isRetryableNetworkError(value)).toBe(true);
  });

  it.each([
    {
      name: 'name with Dial in the middle',
      errorName: 'WebRTCDialTimeout',
      matches: true,
    },
    {
      name: 'name with Transport at the end',
      errorName: 'WebSocketTransport',
      matches: true,
    },
    {
      name: 'lowercase dial/transport in name',
      errorName: 'dialtimeout',
      matches: false, // Case-sensitive check won't match, but default is true
    },
  ])('returns true for $name', ({ errorName }) => {
    const error = new Error('error');
    error.name = errorName;
    expect(isRetryableNetworkError(error)).toBe(true);
  });
});
