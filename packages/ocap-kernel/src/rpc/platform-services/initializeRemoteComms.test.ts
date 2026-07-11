import { is } from '@metamask/superstruct';
import { describe, it, expect, vi } from 'vitest';

import type { InitializeRemoteComms } from './initializeRemoteComms.ts';
import {
  initializeRemoteCommsSpec,
  initializeRemoteCommsHandler,
} from './initializeRemoteComms.ts';

const specifier = {
  netlayer: 'libp2p',
  config: { knownRelays: ['/dns4/relay.example/tcp/443/wss/p2p/relay'] },
};

describe('initializeRemoteComms', () => {
  describe('initializeRemoteCommsSpec', () => {
    it('has the correct method name', () => {
      expect(initializeRemoteCommsSpec.method).toBe('initializeRemoteComms');
    });

    it('accepts null result and rejects non-null', () => {
      expect(is(null, initializeRemoteCommsSpec.result)).toBe(true);
      expect(is('string', initializeRemoteCommsSpec.result)).toBe(false);
      expect(is(undefined, initializeRemoteCommsSpec.result)).toBe(false);
    });

    describe('params validation', () => {
      it('accepts a keySeed + specifier', () => {
        expect(
          is(
            { keySeed: '0x1234', specifier },
            initializeRemoteCommsSpec.params,
          ),
        ).toBe(true);
      });

      it('accepts a specifier with an empty config object', () => {
        expect(
          is(
            {
              keySeed: '0x1234',
              specifier: { netlayer: 'libp2p', config: {} },
            },
            initializeRemoteCommsSpec.params,
          ),
        ).toBe(true);
      });

      it('accepts an optional incarnationId', () => {
        expect(
          is(
            { keySeed: '0x1234', specifier, incarnationId: 'inc-1' },
            initializeRemoteCommsSpec.params,
          ),
        ).toBe(true);
      });

      it.each([
        { name: 'missing keySeed', value: { specifier } },
        { name: 'missing specifier', value: { keySeed: '0x1234' } },
        {
          name: 'non-string netlayer',
          value: { keySeed: '0x1234', specifier: { netlayer: 1, config: {} } },
        },
        {
          name: 'non-Json config (function)',
          value: {
            keySeed: '0x1234',
            specifier: { netlayer: 'libp2p', config: () => undefined },
          },
        },
        {
          name: 'extra field',
          value: { keySeed: '0x1234', specifier, extra: 'nope' },
        },
        { name: 'null', value: null },
        { name: 'non-object', value: 'string' },
      ])('rejects params with $name', ({ value }) => {
        expect(is(value, initializeRemoteCommsSpec.params)).toBe(false);
      });
    });
  });

  describe('initializeRemoteCommsHandler', () => {
    it('declares its hook', () => {
      expect(initializeRemoteCommsHandler.hooks).toStrictEqual({
        initializeRemoteComms: true,
      });
    });

    it('forwards keySeed, specifier, and incarnationId positionally (no hooks in params)', async () => {
      const hook: InitializeRemoteComms = vi.fn(async () => null);
      const result = await initializeRemoteCommsHandler.implementation(
        { initializeRemoteComms: hook },
        { keySeed: '0x1234', specifier, incarnationId: 'inc-1' },
      );
      expect(hook).toHaveBeenCalledWith('0x1234', specifier, 'inc-1');
      expect(result).toBeNull();
    });

    it('passes undefined incarnationId when omitted', async () => {
      const hook: InitializeRemoteComms = vi.fn(async () => null);
      await initializeRemoteCommsHandler.implementation(
        { initializeRemoteComms: hook },
        { keySeed: '0x1234', specifier },
      );
      expect(hook).toHaveBeenCalledWith('0x1234', specifier, undefined);
    });

    it('propagates errors from the hook', async () => {
      const hook: InitializeRemoteComms = vi.fn(async () => {
        throw new Error('Initialization failed');
      });
      await expect(
        initializeRemoteCommsHandler.implementation(
          { initializeRemoteComms: hook },
          { keySeed: '0x1234', specifier },
        ),
      ).rejects.toThrow('Initialization failed');
    });
  });
});
