import { describe, it, expect, afterEach, vi } from 'vitest';

import {
  createCommsQueryString,
  parseCommsQueryString,
  getCommsParamsFromCurrentLocation,
} from './comms-query-string.ts';

const config = {
  knownRelays: ['/ip4/127.0.0.1/tcp/9001/ws/p2p/relay'],
};

describe('comms-query-string', () => {
  describe('createCommsQueryString', () => {
    it('encodes the netlayer and its JSON config', () => {
      const params = createCommsQueryString({ netlayer: 'libp2p', config });
      expect(params.get('netlayer')).toBe('libp2p');
      expect(params.get('netlayer-config')).toBe(JSON.stringify(config));
    });

    it('encodes kernel-level numeric options', () => {
      const params = createCommsQueryString({
        netlayer: 'libp2p',
        config: {},
        maxQueue: 200,
        ackTimeoutMs: 5000,
        maxUrlRelayHints: 3,
        maxKnownRelays: 20,
      });
      expect(params.get('maxQueue')).toBe('200');
      expect(params.get('ackTimeoutMs')).toBe('5000');
      expect(params.get('maxUrlRelayHints')).toBe('3');
      expect(params.get('maxKnownRelays')).toBe('20');
    });

    it('throws on an invalid numeric option', () => {
      expect(() =>
        createCommsQueryString({
          netlayer: 'libp2p',
          config: {},
          maxQueue: -1,
        }),
      ).toThrow('maxQueue must be a non-negative integer');
    });
  });

  describe('parseCommsQueryString', () => {
    it('parses a specifier from netlayer + netlayer-config', () => {
      const qs = createCommsQueryString({ netlayer: 'libp2p', config });
      const parsed = parseCommsQueryString(qs.toString());
      expect(parsed.specifier).toStrictEqual({ netlayer: 'libp2p', config });
    });

    it('round-trips a full set of params', () => {
      const qs = createCommsQueryString({
        netlayer: 'libp2p',
        config,
        maxQueue: 200,
        ackTimeoutMs: 5000,
        maxUrlRelayHints: 3,
        maxKnownRelays: 20,
      });
      const parsed = parseCommsQueryString(`?${qs.toString()}`);
      expect(parsed).toStrictEqual({
        specifier: { netlayer: 'libp2p', config },
        maxQueue: 200,
        ackTimeoutMs: 5000,
        maxUrlRelayHints: 3,
        maxKnownRelays: 20,
      });
    });

    it('omits the specifier when no netlayer param is present', () => {
      expect(parseCommsQueryString('')).toStrictEqual({});
    });

    it('throws on invalid netlayer-config JSON', () => {
      expect(() =>
        parseCommsQueryString('netlayer=libp2p&netlayer-config=not-json'),
      ).toThrow('netlayer-config contains invalid JSON');
    });

    it('throws on an invalid numeric value', () => {
      expect(() =>
        parseCommsQueryString(
          'netlayer=libp2p&netlayer-config=%7B%7D&maxQueue=-5',
        ),
      ).toThrow('maxQueue must be a non-negative integer');
    });
  });

  describe('getCommsParamsFromCurrentLocation', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns an empty object when there is no location', () => {
      vi.stubGlobal('location', undefined);
      expect(getCommsParamsFromCurrentLocation()).toStrictEqual({});
    });

    it('parses the specifier from the current location', () => {
      const qs = createCommsQueryString({ netlayer: 'libp2p', config });
      vi.stubGlobal('location', { search: `?${qs.toString()}` });
      expect(getCommsParamsFromCurrentLocation()).toStrictEqual({
        specifier: { netlayer: 'libp2p', config },
      });
    });
  });
});
