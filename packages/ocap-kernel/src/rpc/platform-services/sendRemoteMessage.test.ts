import { is } from '@metamask/superstruct';
import { describe, it, expect, vi } from 'vitest';

import type { SendRemoteMessage } from './sendRemoteMessage.ts';
import {
  sendRemoteMessageSpec,
  sendRemoteMessageHandler,
} from './sendRemoteMessage.ts';

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
          message: 'hello world',
          hints: [],
        };

        expect(is(validParams, sendRemoteMessageSpec.params)).toBe(true);
      });

      it('should reject params with missing to field', () => {
        const invalidParams = {
          message: 'hello world',
        };

        expect(is(invalidParams, sendRemoteMessageSpec.params)).toBe(false);
      });

      it('should reject params with missing message field', () => {
        const invalidParams = {
          to: 'peer-123',
        };

        expect(is(invalidParams, sendRemoteMessageSpec.params)).toBe(false);
      });

      it('should reject params with non-string to field', () => {
        const invalidParams = {
          to: 123,
          message: 'hello world',
        };

        expect(is(invalidParams, sendRemoteMessageSpec.params)).toBe(false);
      });

      it('should reject params with non-string message field', () => {
        const invalidParams = {
          to: 'peer-123',
          message: 123,
        };

        expect(is(invalidParams, sendRemoteMessageSpec.params)).toBe(false);
      });

      it('should reject params with extra fields', () => {
        const invalidParams = {
          to: 'peer-123',
          message: 'hello world',
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
    });

    describe('edge cases', () => {
      it('should accept empty strings', () => {
        const validParams = {
          to: '',
          message: '',
          hints: [],
        };

        expect(is(validParams, sendRemoteMessageSpec.params)).toBe(true);
      });

      it('should accept unicode strings', () => {
        const validParams = {
          to: '🌟peer-123🌟',
          message: 'hello 世界 🌍',
          hints: [],
        };

        expect(is(validParams, sendRemoteMessageSpec.params)).toBe(true);
      });

      it('should accept very long strings', () => {
        const longString = 'a'.repeat(10000);
        const validParams = {
          to: longString,
          message: longString,
          hints: [],
        };

        expect(is(validParams, sendRemoteMessageSpec.params)).toBe(true);
      });

      it('should accept JSON-like message content', () => {
        const validParams = {
          to: 'peer-json',
          message: JSON.stringify({
            type: 'test',
            data: { nested: { value: 42 } },
            array: [1, 2, 3],
          }),
          hints: [],
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

      const params = {
        to: 'peer-123',
        message: 'hello world',
        hints: [],
      };

      const result = await sendRemoteMessageHandler.implementation(
        hooks,
        params,
      );

      expect(mockSendRemoteMessage).toHaveBeenCalledTimes(1);
      expect(mockSendRemoteMessage).toHaveBeenCalledWith(
        'peer-123',
        'hello world',
        [],
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
        message: 'test-message',
        hints: [],
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
        message: 'failing-message',
        hints: [],
      };

      await expect(
        sendRemoteMessageHandler.implementation(hooks, params),
      ).rejects.toThrow('Send message failed');
    });

    it('should handle empty string parameters', async () => {
      const mockSendRemoteMessage: SendRemoteMessage = vi.fn(async () => null);

      const hooks = {
        sendRemoteMessage: mockSendRemoteMessage,
      };

      const params = {
        to: '',
        message: '',
        hints: [],
      };

      await sendRemoteMessageHandler.implementation(hooks, params);

      expect(mockSendRemoteMessage).toHaveBeenCalledWith('', '', []);
    });

    it('should handle unicode characters in parameters', async () => {
      const mockSendRemoteMessage: SendRemoteMessage = vi.fn(async () => null);

      const hooks = {
        sendRemoteMessage: mockSendRemoteMessage,
      };

      const params = {
        to: '🌟peer-123🌟',
        message: 'hello 世界 🌍',
        hints: [],
      };

      await sendRemoteMessageHandler.implementation(hooks, params);

      expect(mockSendRemoteMessage).toHaveBeenCalledWith(
        '🌟peer-123🌟',
        'hello 世界 🌍',
        [],
      );
    });

    it('should handle JSON message content', async () => {
      const mockSendRemoteMessage: SendRemoteMessage = vi.fn(async () => null);

      const hooks = {
        sendRemoteMessage: mockSendRemoteMessage,
      };

      const jsonMessage = JSON.stringify({
        type: 'complex-message',
        payload: { data: 'test', count: 42 },
        timestamp: Date.now(),
      });

      const params = {
        to: 'json-peer',
        message: jsonMessage,
        hints: [],
      };

      await sendRemoteMessageHandler.implementation(hooks, params);

      expect(mockSendRemoteMessage).toHaveBeenCalledWith(
        'json-peer',
        jsonMessage,
        [],
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
        message: 'async-message',
        hints: [],
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

        const params = {
          to,
          message: 'test-message',
          hints: [],
        };

        await expect(
          sendRemoteMessageHandler.implementation(hooks, params),
        ).rejects.toThrow(error);

        expect(mockSendRemoteMessage).toHaveBeenCalledWith(
          to,
          'test-message',
          [],
        );
      },
    );

    it('should handle very large messages', async () => {
      const mockSendRemoteMessage: SendRemoteMessage = vi.fn(async () => null);

      const hooks = {
        sendRemoteMessage: mockSendRemoteMessage,
      };

      const largeMessage = 'x'.repeat(100000); // 100KB message
      const params = {
        to: 'large-message-peer',
        message: largeMessage,
        hints: [],
      };

      await sendRemoteMessageHandler.implementation(hooks, params);

      expect(mockSendRemoteMessage).toHaveBeenCalledWith(
        'large-message-peer',
        largeMessage,
        [],
      );
    });
  });
});
