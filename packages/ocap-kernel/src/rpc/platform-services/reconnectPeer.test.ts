import { is } from '@metamask/superstruct';
import { describe, it, expect, vi } from 'vitest';

import type { ReconnectPeer } from './reconnectPeer.ts';
import { reconnectPeerSpec, reconnectPeerHandler } from './reconnectPeer.ts';

describe('reconnectPeer', () => {
  describe('reconnectPeerSpec', () => {
    it('has correct method name', () => {
      expect(reconnectPeerSpec.method).toBe('reconnectPeer');
    });

    it('has correct result type', () => {
      // Test that result validator accepts null
      expect(is(null, reconnectPeerSpec.result)).toBe(true);
      expect(is('string', reconnectPeerSpec.result)).toBe(false);
      expect(is(123, reconnectPeerSpec.result)).toBe(false);
      expect(is(undefined, reconnectPeerSpec.result)).toBe(false);
    });

    describe('params validation', () => {
      it('accepts valid params with hints', () => {
        const validParams = {
          peerId: 'peer-123',
          hints: ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
        };

        expect(is(validParams, reconnectPeerSpec.params)).toBe(true);
      });

      it('accepts valid params with empty hints array', () => {
        const validParams = {
          peerId: 'peer-123',
          hints: [],
        };

        expect(is(validParams, reconnectPeerSpec.params)).toBe(true);
      });

      it('rejects params with missing peerId field', () => {
        const invalidParams = {
          hints: [],
        };

        expect(is(invalidParams, reconnectPeerSpec.params)).toBe(false);
      });

      it('rejects params with missing hints field', () => {
        const invalidParams = {
          peerId: 'peer-123',
        };

        expect(is(invalidParams, reconnectPeerSpec.params)).toBe(false);
      });

      it('rejects params with non-string peerId field', () => {
        const invalidParams = {
          peerId: 123,
          hints: [],
        };

        expect(is(invalidParams, reconnectPeerSpec.params)).toBe(false);
      });

      it('rejects params with non-array hints field', () => {
        const invalidParams = {
          peerId: 'peer-123',
          hints: 'not-an-array',
        };

        expect(is(invalidParams, reconnectPeerSpec.params)).toBe(false);
      });

      it('rejects params with non-string array elements in hints', () => {
        const invalidParams = {
          peerId: 'peer-123',
          hints: [123, 'valid-string'],
        };

        expect(is(invalidParams, reconnectPeerSpec.params)).toBe(false);
      });

      it('rejects params with extra fields', () => {
        const invalidParams = {
          peerId: 'peer-123',
          hints: [],
          extra: 'field',
        };

        expect(is(invalidParams, reconnectPeerSpec.params)).toBe(false);
      });

      it('rejects null params', () => {
        expect(is(null, reconnectPeerSpec.params)).toBe(false);
      });

      it('rejects undefined params', () => {
        expect(is(undefined, reconnectPeerSpec.params)).toBe(false);
      });

      it('rejects non-object params', () => {
        expect(is('string', reconnectPeerSpec.params)).toBe(false);
        expect(is(123, reconnectPeerSpec.params)).toBe(false);
        expect(is([], reconnectPeerSpec.params)).toBe(false);
      });

      it('accepts empty string peerId', () => {
        const validParams = {
          peerId: '',
          hints: [],
        };

        expect(is(validParams, reconnectPeerSpec.params)).toBe(true);
      });

      it('accepts unicode strings', () => {
        const validParams = {
          peerId: '🌟peer-123🌟',
          hints: ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
        };

        expect(is(validParams, reconnectPeerSpec.params)).toBe(true);
      });

      it('accepts multiple hints', () => {
        const validParams = {
          peerId: 'peer-123',
          hints: [
            '/dns4/relay1.example/tcp/443/wss/p2p/relayPeer1',
            '/dns4/relay2.example/tcp/443/wss/p2p/relayPeer2',
          ],
        };

        expect(is(validParams, reconnectPeerSpec.params)).toBe(true);
      });

      it('accepts empty hints array', () => {
        const validParams = {
          peerId: 'peer-123',
          hints: [],
        };

        expect(is(validParams, reconnectPeerSpec.params)).toBe(true);
      });
    });
  });

  describe('reconnectPeerHandler', () => {
    it('has correct method name', () => {
      expect(reconnectPeerHandler.method).toBe('reconnectPeer');
    });

    it('has correct hooks configuration', () => {
      expect(reconnectPeerHandler.hooks).toStrictEqual({
        reconnectPeer: true,
      });
    });

    it('calls the reconnectPeer hook with correct parameters', async () => {
      const mockReconnectPeer: ReconnectPeer = vi.fn(async () => null);

      const hooks = {
        reconnectPeer: mockReconnectPeer,
      };

      const params = {
        peerId: 'peer-123',
        hints: ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
      };

      const result = await reconnectPeerHandler.implementation(hooks, params);

      expect(mockReconnectPeer).toHaveBeenCalledTimes(1);
      expect(mockReconnectPeer).toHaveBeenCalledWith('peer-123', [
        '/dns4/relay.example/tcp/443/wss/p2p/relayPeer',
      ]);
      expect(result).toBeNull();
    });

    it('calls the reconnectPeer hook with empty hints array', async () => {
      const mockReconnectPeer: ReconnectPeer = vi.fn(async () => null);

      const hooks = {
        reconnectPeer: mockReconnectPeer,
      };

      const params = {
        peerId: 'peer-456',
        hints: [],
      };

      const result = await reconnectPeerHandler.implementation(hooks, params);

      expect(mockReconnectPeer).toHaveBeenCalledTimes(1);
      expect(mockReconnectPeer).toHaveBeenCalledWith('peer-456', []);
      expect(result).toBeNull();
    });

    it('returns null from the hook', async () => {
      const mockReconnectPeer: ReconnectPeer = vi.fn(async () => null);

      const hooks = {
        reconnectPeer: mockReconnectPeer,
      };

      const params = {
        peerId: 'test-peer',
        hints: [],
      };

      const result = await reconnectPeerHandler.implementation(hooks, params);

      expect(result).toBeNull();
    });

    it('propagates errors from the hook', async () => {
      const mockReconnectPeer: ReconnectPeer = vi.fn(async () => {
        throw new Error('Reconnect peer failed');
      });

      const hooks = {
        reconnectPeer: mockReconnectPeer,
      };

      const params = {
        peerId: 'failing-peer',
        hints: [],
      };

      await expect(
        reconnectPeerHandler.implementation(hooks, params),
      ).rejects.toThrow('Reconnect peer failed');
    });

    it('handles empty string peerId', async () => {
      const mockReconnectPeer: ReconnectPeer = vi.fn(async () => null);

      const hooks = {
        reconnectPeer: mockReconnectPeer,
      };

      const params = {
        peerId: '',
        hints: [],
      };

      await reconnectPeerHandler.implementation(hooks, params);

      expect(mockReconnectPeer).toHaveBeenCalledWith('', []);
    });

    it('handles unicode characters in peerId', async () => {
      const mockReconnectPeer: ReconnectPeer = vi.fn(async () => null);

      const hooks = {
        reconnectPeer: mockReconnectPeer,
      };

      const params = {
        peerId: '🌟peer-123🌟',
        hints: [],
      };

      await reconnectPeerHandler.implementation(hooks, params);

      expect(mockReconnectPeer).toHaveBeenCalledWith('🌟peer-123🌟', []);
    });

    it('handles multiple hints', async () => {
      const mockReconnectPeer: ReconnectPeer = vi.fn(async () => null);

      const hooks = {
        reconnectPeer: mockReconnectPeer,
      };

      const hints = [
        '/dns4/relay1.example/tcp/443/wss/p2p/relayPeer1',
        '/dns4/relay2.example/tcp/443/wss/p2p/relayPeer2',
      ];

      const params = {
        peerId: 'peer-123',
        hints,
      };

      await reconnectPeerHandler.implementation(hooks, params);

      expect(mockReconnectPeer).toHaveBeenCalledWith('peer-123', hints);
    });

    it('handles async hook that returns a Promise', async () => {
      const mockReconnectPeer: ReconnectPeer = vi.fn(async () => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 1));
        return null;
      });

      const hooks = {
        reconnectPeer: mockReconnectPeer,
      };

      const params = {
        peerId: 'async-peer',
        hints: [],
      };

      const result = await reconnectPeerHandler.implementation(hooks, params);

      expect(result).toBeNull();
    });

    it.each([
      {
        error: new Error('Peer not found'),
        peerId: 'missing-peer',
        hints: [],
      },
      {
        error: new TypeError('Invalid peer ID'),
        peerId: 'invalid-peer',
        hints: ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
      },
      {
        error: new Error('Connection already established'),
        peerId: 'connected-peer',
        hints: [],
      },
      {
        error: new Error('Network error during reconnect'),
        peerId: 'network-error-peer',
        hints: ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
      },
    ])(
      'handles reconnect error: $error.message for peer $peerId',
      async ({ error, peerId, hints }) => {
        const mockReconnectPeer: ReconnectPeer = vi.fn(async () => {
          throw error;
        });

        const hooks = {
          reconnectPeer: mockReconnectPeer,
        };

        const params = {
          peerId,
          hints,
        };

        await expect(
          reconnectPeerHandler.implementation(hooks, params),
        ).rejects.toThrow(error);

        expect(mockReconnectPeer).toHaveBeenCalledWith(peerId, hints);
      },
    );
  });
});
