import { is } from '@metamask/superstruct';
import { describe, it, expect, vi } from 'vitest';

import type { InitializeRemoteComms } from './initializeRemoteComms.ts';
import {
  initializeRemoteCommsSpec,
  initializeRemoteCommsHandler,
} from './initializeRemoteComms.ts';

describe('initializeRemoteComms', () => {
  describe('initializeRemoteCommsSpec', () => {
    it('should have correct method name', () => {
      expect(initializeRemoteCommsSpec.method).toBe('initializeRemoteComms');
    });

    it('should have correct result type', () => {
      // Test that result validator accepts null
      expect(is(null, initializeRemoteCommsSpec.result)).toBe(true);
      expect(is('string', initializeRemoteCommsSpec.result)).toBe(false);
      expect(is(123, initializeRemoteCommsSpec.result)).toBe(false);
      expect(is(undefined, initializeRemoteCommsSpec.result)).toBe(false);
    });

    describe('params validation', () => {
      it('should accept valid params', () => {
        const validParams = {
          keySeed: '0x1234567890abcdef',
          knownRelays: [
            '/dns4/relay1.example/tcp/443/wss/p2p/relay1',
            '/dns4/relay2.example/tcp/443/wss/p2p/relay2',
          ],
        };

        expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
      });

      it('should accept params with empty knownRelays array', () => {
        const validParams = {
          keySeed: '0xabcdef1234567890',
          knownRelays: [],
        };

        expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
      });

      it('should reject params with missing keySeed', () => {
        const invalidParams = {
          knownRelays: ['/dns4/relay.example/tcp/443/wss/p2p/relay'],
        };

        expect(is(invalidParams, initializeRemoteCommsSpec.params)).toBe(false);
      });

      it('should reject params with missing knownRelays', () => {
        const invalidParams = {
          keySeed: '0x1234567890abcdef',
        };

        expect(is(invalidParams, initializeRemoteCommsSpec.params)).toBe(false);
      });

      it('should reject params with non-string keySeed', () => {
        const invalidParams = {
          keySeed: 123,
          knownRelays: [],
        };

        expect(is(invalidParams, initializeRemoteCommsSpec.params)).toBe(false);
      });

      it('should reject params with non-array knownRelays', () => {
        const invalidParams = {
          keySeed: '0x1234567890abcdef',
          knownRelays: 'not-an-array',
        };

        expect(is(invalidParams, initializeRemoteCommsSpec.params)).toBe(false);
      });

      it('should reject params with non-string elements in knownRelays', () => {
        const invalidParams = {
          keySeed: '0x1234567890abcdef',
          knownRelays: [
            '/dns4/relay1.example/tcp/443/wss/p2p/relay1',
            123, // non-string element
          ],
        };

        expect(is(invalidParams, initializeRemoteCommsSpec.params)).toBe(false);
      });

      it('should reject params with extra fields', () => {
        const invalidParams = {
          keySeed: '0x1234567890abcdef',
          knownRelays: [],
          extra: 'field',
        };

        expect(is(invalidParams, initializeRemoteCommsSpec.params)).toBe(false);
      });

      it('should reject null params', () => {
        expect(is(null, initializeRemoteCommsSpec.params)).toBe(false);
      });

      it('should reject undefined params', () => {
        expect(is(undefined, initializeRemoteCommsSpec.params)).toBe(false);
      });

      it('should reject non-object params', () => {
        expect(is('string', initializeRemoteCommsSpec.params)).toBe(false);
        expect(is(123, initializeRemoteCommsSpec.params)).toBe(false);
        expect(is([], initializeRemoteCommsSpec.params)).toBe(false);
      });

      it('should accept empty string keySeed', () => {
        const validParams = {
          keySeed: '',
          knownRelays: [],
        };

        expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
      });

      it('should accept empty strings in knownRelays', () => {
        const validParams = {
          keySeed: '0x1234567890abcdef',
          knownRelays: ['', ''],
        };

        expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
      });

      it('should accept unicode characters', () => {
        const validParams = {
          keySeed: '🔑seed🔑',
          knownRelays: ['🌐relay🌐', '🔗connection🔗'],
        };

        expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
      });

      it('should accept very long strings', () => {
        const longString = 'a'.repeat(10000);
        const validParams = {
          keySeed: longString,
          knownRelays: [longString, longString],
        };

        expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
      });

      it('should accept many relay addresses', () => {
        const manyRelays = Array.from(
          { length: 100 },
          (_, i) => `/dns4/relay${i}.example/tcp/443/wss/p2p/relay${i}`,
        );

        const validParams = {
          keySeed: '0x1234567890abcdef',
          knownRelays: manyRelays,
        };

        expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
      });
    });
  });

  describe('initializeRemoteCommsHandler', () => {
    it('should have correct method name', () => {
      expect(initializeRemoteCommsHandler.method).toBe('initializeRemoteComms');
    });

    it('should have correct hooks configuration', () => {
      expect(initializeRemoteCommsHandler.hooks).toStrictEqual({
        initializeRemoteComms: true,
      });
    });

    it('should call the initializeRemoteComms hook with correct parameters', async () => {
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async () => null,
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const params = {
        keySeed: '0x1234567890abcdef',
        knownRelays: [
          '/dns4/relay1.example/tcp/443/wss/p2p/relay1',
          '/dns4/relay2.example/tcp/443/wss/p2p/relay2',
        ],
      };

      const result = await initializeRemoteCommsHandler.implementation(
        hooks,
        params,
      );

      expect(mockInitializeRemoteComms).toHaveBeenCalledTimes(1);
      expect(mockInitializeRemoteComms).toHaveBeenCalledWith(
        '0x1234567890abcdef',
        [
          '/dns4/relay1.example/tcp/443/wss/p2p/relay1',
          '/dns4/relay2.example/tcp/443/wss/p2p/relay2',
        ],
      );
      expect(result).toBeNull();
    });

    it('should return null from the hook', async () => {
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async () => null,
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const params = {
        keySeed: 'test-seed',
        knownRelays: ['test-relay'],
      };

      const result = await initializeRemoteCommsHandler.implementation(
        hooks,
        params,
      );

      expect(result).toBeNull();
    });

    it('should propagate errors from the hook', async () => {
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async () => {
          throw new Error('Initialization failed');
        },
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const params = {
        keySeed: 'failing-seed',
        knownRelays: ['failing-relay'],
      };

      await expect(
        initializeRemoteCommsHandler.implementation(hooks, params),
      ).rejects.toThrow('Initialization failed');
    });

    it('should handle empty knownRelays array', async () => {
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async () => null,
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const params = {
        keySeed: '0xemptyrelays',
        knownRelays: [],
      };

      await initializeRemoteCommsHandler.implementation(hooks, params);

      expect(mockInitializeRemoteComms).toHaveBeenCalledWith(
        '0xemptyrelays',
        [],
      );
    });

    it('should handle empty string parameters', async () => {
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async () => null,
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const params = {
        keySeed: '',
        knownRelays: [''],
      };

      await initializeRemoteCommsHandler.implementation(hooks, params);

      expect(mockInitializeRemoteComms).toHaveBeenCalledWith('', ['']);
    });

    it('should handle unicode characters in parameters', async () => {
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async () => null,
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const params = {
        keySeed: '🔑unicode-seed🔑',
        knownRelays: ['🌐unicode-relay🌐'],
      };

      await initializeRemoteCommsHandler.implementation(hooks, params);

      expect(mockInitializeRemoteComms).toHaveBeenCalledWith(
        '🔑unicode-seed🔑',
        ['🌐unicode-relay🌐'],
      );
    });

    it('should handle async hook that returns a Promise', async () => {
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async () => {
          // Simulate async initialization work
          await new Promise((resolve) => setTimeout(resolve, 1));
          return null;
        },
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const params = {
        keySeed: 'async-seed',
        knownRelays: ['async-relay'],
      };

      const result = await initializeRemoteCommsHandler.implementation(
        hooks,
        params,
      );

      expect(result).toBeNull();
    });

    it.each([
      { error: new Error('Network setup failed'), keySeed: 'network-seed' },
      { error: new TypeError('Invalid key format'), keySeed: 'invalid-seed' },
      { error: new Error('Relay connection timeout'), keySeed: 'timeout-seed' },
      { error: new Error('INIT_FAILED'), keySeed: 'object-error-seed' },
    ])(
      'should handle initialization error: $error.message with seed $keySeed',
      async ({ error, keySeed }) => {
        const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
          async () => {
            throw error;
          },
        );

        const hooks = {
          initializeRemoteComms: mockInitializeRemoteComms,
        };

        const params = {
          keySeed,
          knownRelays: ['test-relay'],
        };

        await expect(
          initializeRemoteCommsHandler.implementation(hooks, params),
        ).rejects.toThrow(error);

        expect(mockInitializeRemoteComms).toHaveBeenCalledWith(keySeed, [
          'test-relay',
        ]);
      },
    );

    it('should handle many relay addresses', async () => {
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async () => null,
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const manyRelays = Array.from(
        { length: 50 },
        (_, i) => `/dns4/relay${i}.example/tcp/443/wss/p2p/relay${i}`,
      );

      const params = {
        keySeed: '0xmanyrelays',
        knownRelays: manyRelays,
      };

      await initializeRemoteCommsHandler.implementation(hooks, params);

      expect(mockInitializeRemoteComms).toHaveBeenCalledWith(
        '0xmanyrelays',
        manyRelays,
      );
    });

    it('should handle complex initialization scenarios', async () => {
      let initializationSteps = 0;
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async (keySeed: string, knownRelays: string[]) => {
          // Simulate complex initialization
          initializationSteps += 1; // Step 1: Parse key seed
          await new Promise((resolve) => setTimeout(resolve, 1));

          initializationSteps += 1; // Step 2: Connect to relays
          await new Promise((resolve) => setTimeout(resolve, 1));

          initializationSteps += 1; // Step 3: Setup network

          // Validate inputs during initialization
          if (keySeed.length === 0) {
            throw new Error('Invalid key seed');
          }

          if (knownRelays.length === 0) {
            throw new Error('No relays provided');
          }

          return null;
        },
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const params = {
        keySeed: '0xcomplexinitialization',
        knownRelays: ['/dns4/complex.relay/tcp/443/wss/p2p/complex'],
      };

      const result = await initializeRemoteCommsHandler.implementation(
        hooks,
        params,
      );

      expect(result).toBeNull();
      expect(initializationSteps).toBe(3);
    });
  });
});
