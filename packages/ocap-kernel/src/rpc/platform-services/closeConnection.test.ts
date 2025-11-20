import { is } from '@metamask/superstruct';
import { describe, it, expect, vi } from 'vitest';

import type { CloseConnection } from './closeConnection.ts';
import {
  closeConnectionSpec,
  closeConnectionHandler,
} from './closeConnection.ts';

describe('closeConnection', () => {
  describe('closeConnectionSpec', () => {
    it('has correct method name', () => {
      expect(closeConnectionSpec.method).toBe('closeConnection');
    });

    it('has correct result type', () => {
      // Test that result validator accepts null
      expect(is(null, closeConnectionSpec.result)).toBe(true);
      expect(is('string', closeConnectionSpec.result)).toBe(false);
      expect(is(123, closeConnectionSpec.result)).toBe(false);
      expect(is(undefined, closeConnectionSpec.result)).toBe(false);
    });

    describe('params validation', () => {
      it('accepts valid params', () => {
        const validParams = {
          peerId: 'peer-123',
        };

        expect(is(validParams, closeConnectionSpec.params)).toBe(true);
      });

      it('rejects params with missing peerId field', () => {
        const invalidParams = {};

        expect(is(invalidParams, closeConnectionSpec.params)).toBe(false);
      });

      it('rejects params with non-string peerId field', () => {
        const invalidParams = {
          peerId: 123,
        };

        expect(is(invalidParams, closeConnectionSpec.params)).toBe(false);
      });

      it('rejects params with extra fields', () => {
        const invalidParams = {
          peerId: 'peer-123',
          extra: 'field',
        };

        expect(is(invalidParams, closeConnectionSpec.params)).toBe(false);
      });

      it('rejects null params', () => {
        expect(is(null, closeConnectionSpec.params)).toBe(false);
      });

      it('rejects undefined params', () => {
        expect(is(undefined, closeConnectionSpec.params)).toBe(false);
      });

      it('rejects non-object params', () => {
        expect(is('string', closeConnectionSpec.params)).toBe(false);
        expect(is(123, closeConnectionSpec.params)).toBe(false);
        expect(is([], closeConnectionSpec.params)).toBe(false);
      });

      it('accepts empty string peerId', () => {
        const validParams = {
          peerId: '',
        };

        expect(is(validParams, closeConnectionSpec.params)).toBe(true);
      });

      it('accepts unicode strings', () => {
        const validParams = {
          peerId: '🌟peer-123🌟',
        };

        expect(is(validParams, closeConnectionSpec.params)).toBe(true);
      });

      it('accepts very long strings', () => {
        const longString = 'a'.repeat(10000);
        const validParams = {
          peerId: longString,
        };

        expect(is(validParams, closeConnectionSpec.params)).toBe(true);
      });
    });
  });

  describe('closeConnectionHandler', () => {
    it('has correct method name', () => {
      expect(closeConnectionHandler.method).toBe('closeConnection');
    });

    it('has correct hooks configuration', () => {
      expect(closeConnectionHandler.hooks).toStrictEqual({
        closeConnection: true,
      });
    });

    it('calls the closeConnection hook with correct parameters', async () => {
      const mockCloseConnection: CloseConnection = vi.fn(async () => null);

      const hooks = {
        closeConnection: mockCloseConnection,
      };

      const params = {
        peerId: 'peer-123',
      };

      const result = await closeConnectionHandler.implementation(hooks, params);

      expect(mockCloseConnection).toHaveBeenCalledTimes(1);
      expect(mockCloseConnection).toHaveBeenCalledWith('peer-123');
      expect(result).toBeNull();
    });

    it('returns null from the hook', async () => {
      const mockCloseConnection: CloseConnection = vi.fn(async () => null);

      const hooks = {
        closeConnection: mockCloseConnection,
      };

      const params = {
        peerId: 'test-peer',
      };

      const result = await closeConnectionHandler.implementation(hooks, params);

      expect(result).toBeNull();
    });

    it('propagates errors from the hook', async () => {
      const mockCloseConnection: CloseConnection = vi.fn(async () => {
        throw new Error('Close connection failed');
      });

      const hooks = {
        closeConnection: mockCloseConnection,
      };

      const params = {
        peerId: 'failing-peer',
      };

      await expect(
        closeConnectionHandler.implementation(hooks, params),
      ).rejects.toThrow('Close connection failed');
    });

    it('handles empty string peerId', async () => {
      const mockCloseConnection: CloseConnection = vi.fn(async () => null);

      const hooks = {
        closeConnection: mockCloseConnection,
      };

      const params = {
        peerId: '',
      };

      await closeConnectionHandler.implementation(hooks, params);

      expect(mockCloseConnection).toHaveBeenCalledWith('');
    });

    it('handles unicode characters in peerId', async () => {
      const mockCloseConnection: CloseConnection = vi.fn(async () => null);

      const hooks = {
        closeConnection: mockCloseConnection,
      };

      const params = {
        peerId: '🌟peer-123🌟',
      };

      await closeConnectionHandler.implementation(hooks, params);

      expect(mockCloseConnection).toHaveBeenCalledWith('🌟peer-123🌟');
    });

    it('handles async hook that returns a Promise', async () => {
      const mockCloseConnection: CloseConnection = vi.fn(async () => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 1));
        return null;
      });

      const hooks = {
        closeConnection: mockCloseConnection,
      };

      const params = {
        peerId: 'async-peer',
      };

      const result = await closeConnectionHandler.implementation(hooks, params);

      expect(result).toBeNull();
    });

    it.each([
      { error: new Error('Connection not found'), peerId: 'missing-peer' },
      { error: new TypeError('Invalid peer ID'), peerId: 'invalid-peer' },
      { error: new Error('Connection already closed'), peerId: 'closed-peer' },
      {
        error: new Error('Network error during close'),
        peerId: 'network-error-peer',
      },
    ])(
      'handles close error: $error.message for peer $peerId',
      async ({ error, peerId }) => {
        const mockCloseConnection: CloseConnection = vi.fn(async () => {
          throw error;
        });

        const hooks = {
          closeConnection: mockCloseConnection,
        };

        const params = {
          peerId,
        };

        await expect(
          closeConnectionHandler.implementation(hooks, params),
        ).rejects.toThrow(error);

        expect(mockCloseConnection).toHaveBeenCalledWith(peerId);
      },
    );
  });
});
