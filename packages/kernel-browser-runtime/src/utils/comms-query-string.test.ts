import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  createCommsQueryString,
  parseCommsQueryString,
  getCommsParamsFromCurrentLocation,
} from './comms-query-string.ts';

// Mock the logger module
vi.mock('@metamask/logger', () => ({
  Logger: vi.fn().mockImplementation(function () {
    return {
      error: vi.fn(),
      warn: vi.fn(),
    };
  }),
}));

describe('comms-query-string', () => {
  describe('createCommsQueryString', () => {
    it('returns URLSearchParams with relays only', () => {
      const relays = ['/ip4/127.0.0.1/tcp/9001/ws'];
      const result = createCommsQueryString({ relays });
      expect(result.get('relays')).toBe(JSON.stringify(relays));
    });

    it('returns URLSearchParams with allowedWsHosts only', () => {
      const allowedWsHosts = ['localhost', 'relay.example.com'];
      const result = createCommsQueryString({ allowedWsHosts });
      expect(result.get('allowedWsHosts')).toBe(JSON.stringify(allowedWsHosts));
    });

    it('returns URLSearchParams with both params', () => {
      const relays = ['/ip4/127.0.0.1/tcp/9001/ws'];
      const allowedWsHosts = ['localhost'];
      const result = createCommsQueryString({ relays, allowedWsHosts });
      expect(result.has('relays')).toBe(true);
      expect(result.has('allowedWsHosts')).toBe(true);
    });

    it('returns empty URLSearchParams for empty arrays', () => {
      expect(
        createCommsQueryString({ relays: [], allowedWsHosts: [] }).toString(),
      ).toBe('');
      expect(createCommsQueryString({}).toString()).toBe('');
    });

    it('returns URLSearchParams with number options and directListenAddresses', () => {
      const result = createCommsQueryString({
        relays: ['/ip4/127.0.0.1/tcp/9001/ws'],
        maxRetryAttempts: 3,
        maxQueue: 100,
        directListenAddresses: ['/ip4/0.0.0.0/udp/0/quic-v1'],
      });
      expect(result.get('relays')).toBe(
        JSON.stringify(['/ip4/127.0.0.1/tcp/9001/ws']),
      );
      expect(result.get('maxRetryAttempts')).toBe('3');
      expect(result.get('maxQueue')).toBe('100');
      expect(result.get('directListenAddresses')).toBe(
        JSON.stringify(['/ip4/0.0.0.0/udp/0/quic-v1']),
      );
    });

    it('round-trips full options via createCommsQueryString and parseCommsQueryString', () => {
      const options = {
        relays: ['/dns4/relay.example.com/tcp/443/wss/p2p/QmRelay'],
        allowedWsHosts: ['relay.example.com'],
        maxRetryAttempts: 5,
        maxQueue: 200,
      };
      const params = createCommsQueryString(options);
      expect(parseCommsQueryString(`?${params.toString()}`)).toStrictEqual(
        options,
      );
    });

    it('throws on invalid array param types', () => {
      expect(() =>
        createCommsQueryString({
          relays: 'not-an-array' as unknown as string[],
        }),
      ).toThrow(TypeError);
      expect(() =>
        createCommsQueryString({
          relays: [1, 2] as unknown as string[],
        }),
      ).toThrow(TypeError);
    });

    it('throws on invalid number param types', () => {
      expect(() => createCommsQueryString({ maxRetryAttempts: -1 })).toThrow(
        TypeError,
      );
      expect(() => createCommsQueryString({ maxQueue: 1.5 })).toThrow(
        TypeError,
      );
      expect(() =>
        createCommsQueryString({
          maxRetryAttempts: 'five' as unknown as number,
        }),
      ).toThrow(TypeError);
    });
  });

  describe('parseCommsQueryString', () => {
    it('returns both relays and allowedWsHosts', () => {
      const queryString = `?relays=${encodeURIComponent(JSON.stringify(['/ip4/127.0.0.1/tcp/9001/ws']))}&allowedWsHosts=${encodeURIComponent(JSON.stringify(['localhost']))}`;
      expect(parseCommsQueryString(queryString)).toStrictEqual({
        relays: ['/ip4/127.0.0.1/tcp/9001/ws'],
        allowedWsHosts: ['localhost'],
      });
    });

    it('returns empty object when no comms params present', () => {
      expect(parseCommsQueryString('?foo=bar')).toStrictEqual({});
    });

    it('parses directListenAddresses and number options', () => {
      const queryString = `?directListenAddresses=${encodeURIComponent(JSON.stringify(['/ip4/0.0.0.0/udp/0/quic-v1']))}&maxRetryAttempts=5&maxQueue=100`;
      expect(parseCommsQueryString(queryString)).toStrictEqual({
        directListenAddresses: ['/ip4/0.0.0.0/udp/0/quic-v1'],
        maxRetryAttempts: 5,
        maxQueue: 100,
      });
    });

    it('parses query string without leading ?', () => {
      const queryString = `relays=${encodeURIComponent(JSON.stringify(['/ip4/127.0.0.1/tcp/9001/ws']))}`;
      expect(parseCommsQueryString(queryString)).toStrictEqual({
        relays: ['/ip4/127.0.0.1/tcp/9001/ws'],
      });
    });

    it('ignores array params with non-string-array JSON values', () => {
      expect(
        parseCommsQueryString(
          `?relays=${encodeURIComponent(JSON.stringify({ not: 'an array' }))}`,
        ),
      ).toStrictEqual({});
      expect(
        parseCommsQueryString(
          `?relays=${encodeURIComponent(JSON.stringify([1, 2]))}`,
        ),
      ).toStrictEqual({});
    });

    it('ignores array params with invalid JSON', () => {
      expect(parseCommsQueryString('?relays=not-json')).toStrictEqual({});
    });

    it('ignores invalid number values', () => {
      expect(parseCommsQueryString('?maxRetryAttempts=-1')).toStrictEqual({});
      expect(parseCommsQueryString('?maxRetryAttempts=1.5')).toStrictEqual({});
      expect(parseCommsQueryString('?maxRetryAttempts=10')).toStrictEqual({
        maxRetryAttempts: 10,
      });
    });
  });

  describe('getCommsParamsFromCurrentLocation', () => {
    const originalLocation = globalThis.location;

    beforeEach(() => {
      Object.defineProperty(globalThis, 'location', {
        value: { search: '' },
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      if (originalLocation) {
        Object.defineProperty(globalThis, 'location', {
          value: originalLocation,
          writable: true,
          configurable: true,
        });
      } else {
        // @ts-expect-error - deleting global property
        delete globalThis.location;
      }
    });

    it('returns relays and allowedWsHosts from location', () => {
      const relays = ['/ip4/127.0.0.1/tcp/9001/ws'];
      const allowedWsHosts = ['localhost'];
      globalThis.location.search = `?relays=${encodeURIComponent(JSON.stringify(relays))}&allowedWsHosts=${encodeURIComponent(JSON.stringify(allowedWsHosts))}`;
      expect(getCommsParamsFromCurrentLocation()).toStrictEqual({
        relays,
        allowedWsHosts,
      });
    });

    it('returns empty object when location is undefined', () => {
      // @ts-expect-error - testing undefined location
      delete globalThis.location;
      expect(getCommsParamsFromCurrentLocation()).toStrictEqual({});
    });

    it('returns all parsed options including numbers and directListenAddresses', () => {
      globalThis.location.search = `?relays=${encodeURIComponent(JSON.stringify(['/ip4/127.0.0.1/tcp/9001/ws']))}&maxQueue=50&stalePeerTimeoutMs=3600000`;
      expect(getCommsParamsFromCurrentLocation()).toStrictEqual({
        relays: ['/ip4/127.0.0.1/tcp/9001/ws'],
        maxQueue: 50,
        stalePeerTimeoutMs: 3600000,
      });
    });
  });
});
