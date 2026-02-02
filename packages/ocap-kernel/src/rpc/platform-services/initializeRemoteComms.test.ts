import { is } from '@metamask/superstruct';
import { describe, it, expect, vi } from 'vitest';

import type { InitializeRemoteComms } from './initializeRemoteComms.ts';
import {
  initializeRemoteCommsSpec,
  initializeRemoteCommsHandler,
} from './initializeRemoteComms.ts';
import type { RemoteCommsOptions } from '../../remotes/types.ts';

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
          relays: [
            '/dns4/relay1.example/tcp/443/wss/p2p/relay1',
            '/dns4/relay2.example/tcp/443/wss/p2p/relay2',
          ],
        };

        expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
      });

      it('should accept params with empty relays array', () => {
        const validParams = {
          keySeed: '0xabcdef1234567890',
          relays: [],
        };

        expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
      });

      it('should accept params with only keySeed', () => {
        const validParams = {
          keySeed: '0x1234567890abcdef',
        };

        expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
      });

      it('should accept params with maxRetryAttempts', () => {
        const validParams = {
          keySeed: '0x1234567890abcdef',
          maxRetryAttempts: 5,
        };

        expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
      });

      it('should accept params with maxQueue', () => {
        const validParams = {
          keySeed: '0x1234567890abcdef',
          maxQueue: 100,
        };

        expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
      });

      it('should accept params with incarnationId', () => {
        const validParams = {
          keySeed: '0x1234567890abcdef',
          incarnationId: 'test-incarnation-id',
        };

        expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
      });

      it('should reject params with missing keySeed', () => {
        const invalidParams = {
          relays: ['/dns4/relay.example/tcp/443/wss/p2p/relay'],
        };

        expect(is(invalidParams, initializeRemoteCommsSpec.params)).toBe(false);
      });

      it('should reject params with non-string keySeed', () => {
        const invalidParams = {
          keySeed: 123,
          relays: [],
        };

        expect(is(invalidParams, initializeRemoteCommsSpec.params)).toBe(false);
      });

      it('should reject params with non-array knownRelays', () => {
        const invalidParams = {
          keySeed: '0x1234567890abcdef',
          relays: 'not-an-array',
        };

        expect(is(invalidParams, initializeRemoteCommsSpec.params)).toBe(false);
      });

      it('should reject params with non-string elements in relays', () => {
        const invalidParams = {
          keySeed: '0x1234567890abcdef',
          relays: [
            '/dns4/relay1.example/tcp/443/wss/p2p/relay1',
            123, // non-string element
          ],
        };

        expect(is(invalidParams, initializeRemoteCommsSpec.params)).toBe(false);
      });

      it('should reject params with non-number maxRetryAttempts', () => {
        const invalidParams = {
          keySeed: '0x1234567890abcdef',
          maxRetryAttempts: 'not-a-number',
        };

        expect(is(invalidParams, initializeRemoteCommsSpec.params)).toBe(false);
      });

      it('should reject params with non-number maxQueue', () => {
        const invalidParams = {
          keySeed: '0x1234567890abcdef',
          maxQueue: 'not-a-number',
        };

        expect(is(invalidParams, initializeRemoteCommsSpec.params)).toBe(false);
      });

      it('should reject params with extra fields', () => {
        const invalidParams = {
          keySeed: '0x1234567890abcdef',
          relays: [],
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
          relays: [],
        };

        expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
      });

      it('should accept empty strings in relays', () => {
        const validParams = {
          keySeed: '0x1234567890abcdef',
          relays: ['', ''],
        };

        expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
      });

      it('should accept unicode characters', () => {
        const validParams = {
          keySeed: '🔑seed🔑',
          relays: ['🌐relay🌐', '🔗connection🔗'],
        };

        expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
      });

      it('should accept very long strings', () => {
        const longString = 'a'.repeat(10000);
        const validParams = {
          keySeed: longString,
          relays: [longString, longString],
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
          relays: manyRelays,
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
        relays: [
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
        {
          relays: [
            '/dns4/relay1.example/tcp/443/wss/p2p/relay1',
            '/dns4/relay2.example/tcp/443/wss/p2p/relay2',
          ],
        },
        undefined,
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
        relays: ['test-relay'],
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
        relays: ['failing-relay'],
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
        relays: [],
      };

      await initializeRemoteCommsHandler.implementation(hooks, params);

      expect(mockInitializeRemoteComms).toHaveBeenCalledWith(
        '0xemptyrelays',
        {
          relays: [],
        },
        undefined,
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
        relays: [''],
      };

      await initializeRemoteCommsHandler.implementation(hooks, params);

      expect(mockInitializeRemoteComms).toHaveBeenCalledWith(
        '',
        {
          relays: [''],
        },
        undefined,
      );
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
        relays: ['🌐unicode-relay🌐'],
      };

      await initializeRemoteCommsHandler.implementation(hooks, params);

      expect(mockInitializeRemoteComms).toHaveBeenCalledWith(
        '🔑unicode-seed🔑',
        { relays: ['🌐unicode-relay🌐'] },
        undefined,
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
        relays: ['async-relay'],
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
          relays: ['test-relay'],
        };

        await expect(
          initializeRemoteCommsHandler.implementation(hooks, params),
        ).rejects.toThrow(error);

        expect(mockInitializeRemoteComms).toHaveBeenCalledWith(
          keySeed,
          {
            relays: ['test-relay'],
          },
          undefined,
        );
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
        relays: manyRelays,
      };

      await initializeRemoteCommsHandler.implementation(hooks, params);

      expect(mockInitializeRemoteComms).toHaveBeenCalledWith(
        '0xmanyrelays',
        {
          relays: manyRelays,
        },
        undefined,
      );
    });

    it('should handle complex initialization scenarios', async () => {
      let initializationSteps = 0;
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async (keySeed: string, options: RemoteCommsOptions) => {
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

          if (!options.relays || options.relays.length === 0) {
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
        relays: ['/dns4/complex.relay/tcp/443/wss/p2p/complex'],
      };

      const result = await initializeRemoteCommsHandler.implementation(
        hooks,
        params,
      );

      expect(result).toBeNull();
      expect(initializationSteps).toBe(3);
    });

    it('should pass maxRetryAttempts to hook when provided', async () => {
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async () => null,
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const params = {
        keySeed: '0xtestseed',
        maxRetryAttempts: 5,
      };

      await initializeRemoteCommsHandler.implementation(hooks, params);

      expect(mockInitializeRemoteComms).toHaveBeenCalledWith(
        '0xtestseed',
        {
          maxRetryAttempts: 5,
        },
        undefined,
      );
    });

    it('should pass maxQueue to hook when provided', async () => {
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async () => null,
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const params = {
        keySeed: '0xtestseed',
        maxQueue: 100,
      };

      await initializeRemoteCommsHandler.implementation(hooks, params);

      expect(mockInitializeRemoteComms).toHaveBeenCalledWith(
        '0xtestseed',
        {
          maxQueue: 100,
        },
        undefined,
      );
    });

    it('should pass all options when all are provided', async () => {
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async () => null,
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const params = {
        keySeed: '0xtestseed',
        relays: ['/dns4/relay.example/tcp/443/wss/p2p/relay'],
        maxRetryAttempts: 5,
        maxQueue: 100,
      };

      await initializeRemoteCommsHandler.implementation(hooks, params);

      expect(mockInitializeRemoteComms).toHaveBeenCalledWith(
        '0xtestseed',
        {
          relays: ['/dns4/relay.example/tcp/443/wss/p2p/relay'],
          maxRetryAttempts: 5,
          maxQueue: 100,
        },
        undefined,
      );
    });

    it('should pass empty options when only keySeed is provided', async () => {
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async () => null,
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const params = {
        keySeed: '0xtestseed',
      };

      await initializeRemoteCommsHandler.implementation(hooks, params);

      expect(mockInitializeRemoteComms).toHaveBeenCalledWith(
        '0xtestseed',
        {},
        undefined,
      );
    });

    it('should not include undefined optional params in options', async () => {
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async (_keySeed: string, options: RemoteCommsOptions) => {
          // Verify that undefined params are not included
          expect(options).not.toHaveProperty('relays');
          expect(options).not.toHaveProperty('maxRetryAttempts');
          expect(options).not.toHaveProperty('maxQueue');
          return null;
        },
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const params = {
        keySeed: '0xtestseed',
      };

      await initializeRemoteCommsHandler.implementation(hooks, params);
    });

    it('should accept params with all optional fields', () => {
      const validParams = {
        keySeed: '0x1234567890abcdef',
        relays: ['/dns4/relay.example/tcp/443/wss/p2p/relay'],
        maxRetryAttempts: 5,
        maxQueue: 100,
      };

      expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
    });

    it('should accept params with maxRetryAttempts set to zero', () => {
      const validParams = {
        keySeed: '0x1234567890abcdef',
        maxRetryAttempts: 0,
      };

      expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
    });

    it('should accept params with maxQueue set to zero', () => {
      const validParams = {
        keySeed: '0x1234567890abcdef',
        maxQueue: 0,
      };

      expect(is(validParams, initializeRemoteCommsSpec.params)).toBe(true);
    });

    it('should pass maxRetryAttempts set to zero to hook', async () => {
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async () => null,
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const params = {
        keySeed: '0xtestseed',
        maxRetryAttempts: 0,
      };

      await initializeRemoteCommsHandler.implementation(hooks, params);

      expect(mockInitializeRemoteComms).toHaveBeenCalledWith(
        '0xtestseed',
        {
          maxRetryAttempts: 0,
        },
        undefined,
      );
    });

    it('should pass maxQueue set to zero to hook', async () => {
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async () => null,
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const params = {
        keySeed: '0xtestseed',
        maxQueue: 0,
      };

      await initializeRemoteCommsHandler.implementation(hooks, params);

      expect(mockInitializeRemoteComms).toHaveBeenCalledWith(
        '0xtestseed',
        {
          maxQueue: 0,
        },
        undefined,
      );
    });

    it('should pass incarnationId when provided', async () => {
      const mockInitializeRemoteComms: InitializeRemoteComms = vi.fn(
        async () => null,
      );

      const hooks = {
        initializeRemoteComms: mockInitializeRemoteComms,
      };

      const params = {
        keySeed: '0xtestseed',
        incarnationId: 'test-incarnation-id',
      };

      await initializeRemoteCommsHandler.implementation(hooks, params);

      expect(mockInitializeRemoteComms).toHaveBeenCalledWith(
        '0xtestseed',
        {},
        'test-incarnation-id',
      );
    });
  });
});
