import { is } from '@metamask/superstruct';
import { describe, it, expect, vi } from 'vitest';

import type { SendRemoteMessage } from './sendRemoteMessage.ts';
import {
  sendRemoteMessageSpec,
  sendRemoteMessageHandler,
} from './sendRemoteMessage.ts';
import type { RemoteMessageBase } from '../../remotes/RemoteHandle.ts';

// Helper to create a valid RemoteMessageBase
const createDelivery = (params: unknown): RemoteMessageBase => ({
  method: 'deliver',
  params: params as [string, string, unknown],
});

describe('sendRemoteMessage', () => {
  describe('sendRemoteMessageSpec', () => {
    it('should have correct method name', () => {
      expect(sendRemoteMessageSpec.method).toBe('sendRemoteMessage');
    });

    it('should have correct result type', () => {
      // Test that result validator accepts null
      expect(is(null, sendRemoteMessageSpec.result)).toBe(true);
      expect(is('string', sendRemoteMessageSpec.result)).toBe(false);
      expect(is(123, sendRemoteMessageSpec.result)).toBe(false);
      expect(is(undefined, sendRemoteMessageSpec.result)).toBe(false);
    });

    describe('params validation', () => {
      it('should accept valid params', () => {
        const validParams = {
          to: 'peer-123',
          messageBase: createDelivery(['message', 'target', {}]),
        };

        expect(is(validParams, sendRemoteMessageSpec.params)).toBe(true);
      });

      it('should reject params with missing to field', () => {
        const invalidParams = {
          messageBase: createDelivery(['message', 'target', {}]),
        };

        expect(is(invalidParams, sendRemoteMessageSpec.params)).toBe(false);
      });

      it('should accept params with missing messageBase field (any() is permissive)', () => {
        // Note: any() accepts undefined, so a missing messageBase is valid
        const paramsWithMissing = {
          to: 'peer-123',
        };

        expect(is(paramsWithMissing, sendRemoteMessageSpec.params)).toBe(true);
      });

      it('should reject params with non-string to field', () => {
        const invalidParams = {
          to: 123,
          messageBase: createDelivery(['message', 'target', {}]),
        };

        expect(is(invalidParams, sendRemoteMessageSpec.params)).toBe(false);
      });

      it('should accept object messageBase field', () => {
        const validParams = {
          to: 'peer-123',
          messageBase: { method: 'deliver', params: [] },
        };

        expect(is(validParams, sendRemoteMessageSpec.params)).toBe(true);
      });

      it('should reject params with extra fields', () => {
        const invalidParams = {
          to: 'peer-123',
          messageBase: createDelivery(['message', 'target', {}]),
          extra: 'field',
        };

        expect(is(invalidParams, sendRemoteMessageSpec.params)).toBe(false);
      });

      it('should reject null params', () => {
        expect(is(null, sendRemoteMessageSpec.params)).toBe(false);
      });

      it('should reject undefined params', () => {
        expect(is(undefined, sendRemoteMessageSpec.params)).toBe(false);
      });

      it('should reject non-object params', () => {
        expect(is('string', sendRemoteMessageSpec.params)).toBe(false);
        expect(is(123, sendRemoteMessageSpec.params)).toBe(false);
        expect(is([], sendRemoteMessageSpec.params)).toBe(false);
      });

      it('should accept empty string to field', () => {
        const validParams = {
          to: '',
          messageBase: createDelivery(['message', 'target', {}]),
        };

        expect(is(validParams, sendRemoteMessageSpec.params)).toBe(true);
      });

      it('should accept unicode strings in to field', () => {
        const validParams = {
          to: '🌟peer-123🌟',
          messageBase: createDelivery(['message', 'target', {}]),
        };

        expect(is(validParams, sendRemoteMessageSpec.params)).toBe(true);
      });

      it('should accept very long to string', () => {
        const longString = 'a'.repeat(10000);
        const validParams = {
          to: longString,
          messageBase: createDelivery(['message', 'target', {}]),
        };

        expect(is(validParams, sendRemoteMessageSpec.params)).toBe(true);
      });
    });
  });

  describe('sendRemoteMessageHandler', () => {
    it('should have correct method name', () => {
      expect(sendRemoteMessageHandler.method).toBe('sendRemoteMessage');
    });

    it('should have correct hooks configuration', () => {
      expect(sendRemoteMessageHandler.hooks).toStrictEqual({
        sendRemoteMessage: true,
      });
    });

    it('should call the sendRemoteMessage hook with correct parameters', async () => {
      const mockSendRemoteMessage: SendRemoteMessage = vi.fn(async () => null);

      const hooks = {
        sendRemoteMessage: mockSendRemoteMessage,
      };

      const messageBase = createDelivery(['message', 'target', {}]);
      const params = {
        to: 'peer-123',
        messageBase,
      };

      const result = await sendRemoteMessageHandler.implementation(
        hooks,
        params,
      );

      expect(mockSendRemoteMessage).toHaveBeenCalledTimes(1);
      expect(mockSendRemoteMessage).toHaveBeenCalledWith(
        'peer-123',
        messageBase,
      );
      expect(result).toBeNull();
    });

    it('should return null from the hook', async () => {
      const mockSendRemoteMessage: SendRemoteMessage = vi.fn(async () => null);

      const hooks = {
        sendRemoteMessage: mockSendRemoteMessage,
      };

      const params = {
        to: 'test-peer',
        messageBase: createDelivery(['message', 'target', {}]),
      };

      const result = await sendRemoteMessageHandler.implementation(
        hooks,
        params,
      );

      expect(result).toBeNull();
    });

    it('should propagate errors from the hook', async () => {
      const mockSendRemoteMessage: SendRemoteMessage = vi.fn(async () => {
        throw new Error('Send message failed');
      });

      const hooks = {
        sendRemoteMessage: mockSendRemoteMessage,
      };

      const params = {
        to: 'failing-peer',
        messageBase: createDelivery(['message', 'target', {}]),
      };

      await expect(
        sendRemoteMessageHandler.implementation(hooks, params),
      ).rejects.toThrow('Send message failed');
    });

    it('should handle empty string to parameter', async () => {
      const mockSendRemoteMessage: SendRemoteMessage = vi.fn(async () => null);

      const hooks = {
        sendRemoteMessage: mockSendRemoteMessage,
      };

      const messageBase = createDelivery(['message', 'target', {}]);
      const params = {
        to: '',
        messageBase,
      };

      await sendRemoteMessageHandler.implementation(hooks, params);

      expect(mockSendRemoteMessage).toHaveBeenCalledWith('', messageBase);
    });

    it('should handle unicode characters in to parameter', async () => {
      const mockSendRemoteMessage: SendRemoteMessage = vi.fn(async () => null);

      const hooks = {
        sendRemoteMessage: mockSendRemoteMessage,
      };

      const messageBase = createDelivery(['message', 'target', {}]);
      const params = {
        to: '🌟peer-123🌟',
        messageBase,
      };

      await sendRemoteMessageHandler.implementation(hooks, params);

      expect(mockSendRemoteMessage).toHaveBeenCalledWith(
        '🌟peer-123🌟',
        messageBase,
      );
    });

    it('should handle complex messageBase content', async () => {
      const mockSendRemoteMessage: SendRemoteMessage = vi.fn(async () => null);

      const hooks = {
        sendRemoteMessage: mockSendRemoteMessage,
      };

      const messageBase: RemoteMessageBase = {
        method: 'deliver',
        params: [
          'message',
          'ko123',
          {
            methargs: { body: '{"method":"foo","args":[1,2,3]}', slots: [] },
            result: 'kp456',
          },
        ],
      };

      const params = {
        to: 'json-peer',
        messageBase,
      };

      await sendRemoteMessageHandler.implementation(hooks, params);

      expect(mockSendRemoteMessage).toHaveBeenCalledWith(
        'json-peer',
        messageBase,
      );
    });

    it('should handle async hook that returns a Promise', async () => {
      const mockSendRemoteMessage: SendRemoteMessage = vi.fn(async () => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 1));
        return null;
      });

      const hooks = {
        sendRemoteMessage: mockSendRemoteMessage,
      };

      const params = {
        to: 'async-peer',
        messageBase: createDelivery(['message', 'target', {}]),
      };

      const result = await sendRemoteMessageHandler.implementation(
        hooks,
        params,
      );

      expect(result).toBeNull();
    });

    it.each([
      { error: new Error('Network timeout'), to: 'network-peer' },
      { error: new TypeError('Invalid peer'), to: 'invalid-peer' },
      { error: new Error('Connection refused'), to: 'refused-peer' },
      { error: new Error('PEER_NOT_FOUND'), to: 'missing-peer' },
    ])(
      'should handle send error: $error.message for peer $to',
      async ({ error, to }) => {
        const mockSendRemoteMessage: SendRemoteMessage = vi.fn(async () => {
          throw error;
        });

        const hooks = {
          sendRemoteMessage: mockSendRemoteMessage,
        };

        const messageBase = createDelivery(['message', 'target', {}]);
        const params = {
          to,
          messageBase,
        };

        await expect(
          sendRemoteMessageHandler.implementation(hooks, params),
        ).rejects.toThrow(error);

        expect(mockSendRemoteMessage).toHaveBeenCalledWith(to, messageBase);
      },
    );

    it('should handle redeemURL request message', async () => {
      const mockSendRemoteMessage: SendRemoteMessage = vi.fn(async () => null);

      const hooks = {
        sendRemoteMessage: mockSendRemoteMessage,
      };

      const messageBase: RemoteMessageBase = {
        method: 'redeemURL',
        params: ['ocap:abc123@peer', 'kp456'],
      };
      const params = {
        to: 'redeem-peer',
        messageBase,
      };

      await sendRemoteMessageHandler.implementation(hooks, params);

      expect(mockSendRemoteMessage).toHaveBeenCalledWith(
        'redeem-peer',
        messageBase,
      );
    });

    it('should handle redeemURLReply message', async () => {
      const mockSendRemoteMessage: SendRemoteMessage = vi.fn(async () => null);

      const hooks = {
        sendRemoteMessage: mockSendRemoteMessage,
      };

      const messageBase: RemoteMessageBase = {
        method: 'redeemURLReply',
        params: [true, 'kp456', 'ko789'],
      };
      const params = {
        to: 'reply-peer',
        messageBase,
      };

      await sendRemoteMessageHandler.implementation(hooks, params);

      expect(mockSendRemoteMessage).toHaveBeenCalledWith(
        'reply-peer',
        messageBase,
      );
    });
  });
});
