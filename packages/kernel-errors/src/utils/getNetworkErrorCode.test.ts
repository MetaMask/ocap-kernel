import { describe, it, expect } from 'vitest';

import { getNetworkErrorCode } from './getNetworkErrorCode.ts';

describe('getNetworkErrorCode', () => {
  describe('Node.js network error codes', () => {
    it.each([
      { code: 'ECONNRESET' },
      { code: 'ETIMEDOUT' },
      { code: 'EPIPE' },
      { code: 'ECONNREFUSED' },
      { code: 'EHOSTUNREACH' },
      { code: 'ENETUNREACH' },
      { code: 'ENOTFOUND' },
    ])('returns $code from error with code property', ({ code }) => {
      const error = new Error('Network error') as Error & { code: string };
      error.code = code;
      expect(getNetworkErrorCode(error)).toBe(code);
    });
  });

  describe('libp2p and other named errors', () => {
    it.each([
      { name: 'DialError' },
      { name: 'TransportError' },
      { name: 'MuxerClosedError' },
      { name: 'WebRTCDialError' },
    ])('returns $name from error with name property', ({ name }) => {
      const error = new Error('Connection failed');
      error.name = name;
      expect(getNetworkErrorCode(error)).toBe(name);
    });

    it('prefers code over name when both are present', () => {
      const error = Object.assign(new Error('Network error'), {
        code: 'ECONNREFUSED',
        name: 'DialError',
      });
      expect(getNetworkErrorCode(error)).toBe('ECONNREFUSED');
    });
  });

  describe('relay reservation errors', () => {
    it('returns name for Error with NO_RESERVATION in message (name takes precedence)', () => {
      const error = new Error(
        'failed to connect via relay with status NO_RESERVATION',
      );
      // name ('Error') takes precedence over message parsing
      expect(getNetworkErrorCode(error)).toBe('Error');
    });

    it('returns NO_RESERVATION when error has empty name', () => {
      const error = Object.assign(
        new Error('failed to connect via relay with status NO_RESERVATION'),
        { name: '' },
      );
      expect(getNetworkErrorCode(error)).toBe('NO_RESERVATION');
    });

    it('returns name when both name and NO_RESERVATION message are present', () => {
      const error = Object.assign(
        new Error('failed to connect via relay with status NO_RESERVATION'),
        { name: 'InvalidMessageError' },
      );
      // name takes precedence over message parsing
      expect(getNetworkErrorCode(error)).toBe('InvalidMessageError');
    });
  });

  describe('unknown errors', () => {
    it.each([
      { name: 'null', value: null },
      { name: 'undefined', value: undefined },
      { name: 'string', value: 'error string' },
      { name: 'number', value: 42 },
      { name: 'plain object', value: { message: 'error' } },
      { name: 'empty error name and code', value: { name: '', code: '' } },
    ])('returns UNKNOWN for $name', ({ value }) => {
      expect(getNetworkErrorCode(value)).toBe('UNKNOWN');
    });

    it('returns UNKNOWN for generic Error with no code', () => {
      const error = new Error('Generic error');
      // Generic Error has name 'Error', so it returns 'Error'
      expect(getNetworkErrorCode(error)).toBe('Error');
    });
  });
});
