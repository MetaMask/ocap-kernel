import { describe, it, expect } from 'vitest';

import { isRetryableNetworkError } from './isRetryableNetworkError.ts';
import { ChannelResetError } from '../errors/ChannelResetError.ts';

describe('isRetryableNetworkError', () => {
  describe('neutral error classes', () => {
    it('returns true for ChannelResetError', () => {
      expect(isRetryableNetworkError(new ChannelResetError())).toBe(true);
    });
  });

  describe('Node.js network error codes', () => {
    it.each([
      { code: 'ECONNRESET', description: 'connection reset by peer' },
      { code: 'ETIMEDOUT', description: 'operation timed out' },
      { code: 'EPIPE', description: 'broken pipe' },
      { code: 'ECONNREFUSED', description: 'connection refused' },
      { code: 'EHOSTUNREACH', description: 'no route to host' },
      { code: 'ENETUNREACH', description: 'network unreachable' },
      { code: 'ENOTFOUND', description: 'DNS lookup failed' },
    ])('returns true for $code ($description)', ({ code }) => {
      const error = new Error('Network error') as Error & { code: string };
      error.code = code;
      expect(isRetryableNetworkError(error)).toBe(true);
    });
  });

  describe('transport-specific errors are not classified here', () => {
    // These are mapped to neutral classes by the netlayer error mapper before
    // reaching the neutral engine, so the neutral classifier treats them as
    // non-retryable on their own.
    it.each([
      {
        name: 'MuxerClosedError',
        error: Object.assign(new Error('Muxer closed'), {
          name: 'MuxerClosedError',
        }),
      },
      {
        name: 'DialError',
        error: Object.assign(new Error('Connection failed'), {
          name: 'DialError',
        }),
      },
      {
        name: 'TransportError',
        error: Object.assign(new Error('Connection failed'), {
          name: 'TransportError',
        }),
      },
      {
        name: 'NO_RESERVATION message',
        error: new Error(
          'failed to connect via relay with status NO_RESERVATION',
        ),
      },
    ])('returns false for $name', ({ error }) => {
      expect(isRetryableNetworkError(error)).toBe(false);
    });
  });

  describe('default non-retryable behavior', () => {
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
    ])('returns false for $name (default behavior)', ({ error }) => {
      expect(isRetryableNetworkError(error)).toBe(false);
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
  ])('returns false for $name', ({ value }) => {
    expect(isRetryableNetworkError(value)).toBe(false);
  });
});
