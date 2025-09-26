import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  createRelayQueryString,
  parseRelayQueryString,
  createWorkerUrlWithRelays,
  getRelaysFromCurrentLocation,
} from './relay-query-string.ts';

// Mock the logger module
vi.mock('@metamask/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

describe('relay-query-string', () => {
  describe('createRelayQueryString', () => {
    it.each([
      {
        name: 'multiple relay addresses',
        relays: [
          '/ip4/127.0.0.1/tcp/9001/ws/p2p/12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc',
          '/ip4/192.168.1.1/tcp/9002/ws/p2p/12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB5uc',
        ],
      },
      {
        name: 'single relay address',
        relays: [
          '/ip4/127.0.0.1/tcp/9001/ws/p2p/12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc',
        ],
      },
      {
        name: 'empty relay array',
        relays: [],
      },
    ])('should create encoded query string for $name', ({ relays }) => {
      const result = createRelayQueryString(relays);
      expect(result).toContain('relays=');
      expect(decodeURIComponent(result.split('=')[1] ?? '')).toStrictEqual(
        JSON.stringify(relays),
      );
    });
  });

  describe('parseRelayQueryString', () => {
    it.each([
      {
        name: 'valid query string',
        queryString: `?relays=${encodeURIComponent(
          JSON.stringify([
            '/ip4/127.0.0.1/tcp/9001/ws/p2p/12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc',
          ]),
        )}`,
        expected: [
          '/ip4/127.0.0.1/tcp/9001/ws/p2p/12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc',
        ],
      },
      {
        name: 'query string with multiple parameters',
        queryString: `?foo=bar&relays=${encodeURIComponent(
          JSON.stringify(['/ip4/127.0.0.1/tcp/9001/ws']),
        )}&baz=qux`,
        expected: ['/ip4/127.0.0.1/tcp/9001/ws'],
      },
      {
        name: 'missing relays parameter',
        queryString: '?foo=bar',
        expected: [],
      },
      {
        name: 'invalid JSON',
        queryString: '?relays=invalid-json',
        expected: [],
      },
      {
        name: 'malformed query string',
        queryString: 'malformed',
        expected: [],
      },
      {
        name: 'empty relays array',
        queryString: `?relays=${encodeURIComponent('[]')}`,
        expected: [],
      },
    ])('should handle $name', ({ queryString, expected }) => {
      const result = parseRelayQueryString(queryString);
      expect(result).toStrictEqual(expected);
    });
  });

  describe('createWorkerUrlWithRelays', () => {
    it.each([
      {
        name: 'standard worker path',
        workerPath: 'kernel-worker.js',
        relays: [
          '/ip4/127.0.0.1/tcp/9001/ws/p2p/12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc',
        ],
        expectedPrefix: 'kernel-worker.js?relays=',
      },
      {
        name: 'worker path with existing query parameters',
        workerPath: 'worker.js?debug=true',
        relays: ['/ip4/127.0.0.1/tcp/9001/ws'],
        expectedPrefix: 'worker.js?debug=true&relays=',
      },
      {
        name: 'empty relays array',
        workerPath: 'worker.js',
        relays: [],
        expectedPrefix: 'worker.js?relays=',
      },
      {
        name: 'worker path with multiple existing query parameters',
        workerPath: 'worker.js?debug=true&verbose=1',
        relays: ['/ip4/127.0.0.1/tcp/9001/ws'],
        expectedPrefix: 'worker.js?debug=true&verbose=1&relays=',
      },
      {
        name: 'worker path ending with question mark',
        workerPath: 'worker.js?',
        relays: ['/ip4/127.0.0.1/tcp/9001/ws'],
        expectedPrefix: 'worker.js?&relays=',
      },
    ])('should handle $name', ({ workerPath, relays, expectedPrefix }) => {
      const result = createWorkerUrlWithRelays(workerPath, relays);
      expect(result).toContain(expectedPrefix);

      // Verify the relays are properly encoded
      const queryPart = result.split('relays=')[1] ?? '';
      const decodedRelays = JSON.parse(decodeURIComponent(queryPart));
      expect(decodedRelays).toStrictEqual(relays);
    });
  });

  describe('getRelaysFromCurrentLocation', () => {
    const originalLocation = globalThis.location;

    beforeEach(() => {
      // Mock globalThis.location
      Object.defineProperty(globalThis, 'location', {
        value: { search: '' },
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      // Restore original location
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

    it('should get relays from current location', () => {
      const relays = [
        '/ip4/127.0.0.1/tcp/9001/ws/p2p/12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc',
      ];
      globalThis.location.search = `?relays=${encodeURIComponent(
        JSON.stringify(relays),
      )}`;
      const result = getRelaysFromCurrentLocation();
      expect(result).toStrictEqual(relays);
    });

    it('should return empty array when location is undefined', () => {
      // @ts-expect-error - testing undefined location
      delete globalThis.location;
      const result = getRelaysFromCurrentLocation();
      expect(result).toStrictEqual([]);
    });
  });
});
