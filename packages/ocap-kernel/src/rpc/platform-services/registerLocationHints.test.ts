import { is } from '@metamask/superstruct';
import { describe, it, expect, vi } from 'vitest';

import type { RegisterLocationHints } from './registerLocationHints.ts';
import {
  registerLocationHintsSpec,
  registerLocationHintsHandler,
} from './registerLocationHints.ts';

describe('registerLocationHints', () => {
  describe('registerLocationHintsSpec', () => {
    it('has correct method name', () => {
      expect(registerLocationHintsSpec.method).toBe('registerLocationHints');
    });

    it('has correct result type', () => {
      // Test that result validator accepts null
      expect(is(null, registerLocationHintsSpec.result)).toBe(true);
      expect(is('string', registerLocationHintsSpec.result)).toBe(false);
      expect(is(123, registerLocationHintsSpec.result)).toBe(false);
      expect(is(undefined, registerLocationHintsSpec.result)).toBe(false);
    });

    describe('params validation', () => {
      it('accepts valid params', () => {
        const validParams = {
          peerId: 'peer-123',
          hints: ['hint-1', 'hint-2'],
        };

        expect(is(validParams, registerLocationHintsSpec.params)).toBe(true);
      });

      it('rejects params with missing peerId field', () => {
        const invalidParams = {
          hints: ['hint-1', 'hint-2'],
        };

        expect(is(invalidParams, registerLocationHintsSpec.params)).toBe(false);
      });

      it('rejects params with missing hints field', () => {
        const invalidParams = {
          peerId: 'peer-123',
        };

        expect(is(invalidParams, registerLocationHintsSpec.params)).toBe(false);
      });

      it('rejects params with non-string peerId field', () => {
        const invalidParams = {
          peerId: 123,
          hints: ['hint-1', 'hint-2'],
        };

        expect(is(invalidParams, registerLocationHintsSpec.params)).toBe(false);
      });

      it('rejects params with non-array hints field', () => {
        const invalidParams = {
          peerId: 'peer-123',
          hints: 'not-an-array',
        };

        expect(is(invalidParams, registerLocationHintsSpec.params)).toBe(false);
      });

      it('rejects params with non-string array elements in hints', () => {
        const invalidParams = {
          peerId: 'peer-123',
          hints: [123, 'valid-string'],
        };

        expect(is(invalidParams, registerLocationHintsSpec.params)).toBe(false);
      });

      it('rejects params with extra fields', () => {
        const invalidParams = {
          peerId: 'peer-123',
          hints: ['hint-1', 'hint-2'],
          extra: 'field',
        };

        expect(is(invalidParams, registerLocationHintsSpec.params)).toBe(false);
      });

      it('rejects null params', () => {
        expect(is(null, registerLocationHintsSpec.params)).toBe(false);
      });

      it('rejects undefined params', () => {
        expect(is(undefined, registerLocationHintsSpec.params)).toBe(false);
      });

      it('rejects non-object params', () => {
        expect(is('string', registerLocationHintsSpec.params)).toBe(false);
        expect(is(123, registerLocationHintsSpec.params)).toBe(false);
        expect(is([], registerLocationHintsSpec.params)).toBe(false);
      });

      it('accepts empty string peerId', () => {
        const validParams = {
          peerId: '',
          hints: ['hint-1', 'hint-2'],
        };

        expect(is(validParams, registerLocationHintsSpec.params)).toBe(true);
      });

      it('accepts unicode strings', () => {
        const validParams = {
          peerId: '🌟peer-123🌟',
          hints: ['hint-1', 'hint-2'],
        };

        expect(is(validParams, registerLocationHintsSpec.params)).toBe(true);
      });

      it('accepts very long strings', () => {
        const longString = 'a'.repeat(10000);
        const validParams = {
          peerId: longString,
          hints: ['hint-1', 'hint-2'],
        };

        expect(is(validParams, registerLocationHintsSpec.params)).toBe(true);
      });
    });
  });

  describe('registerLocationHintsHandler', () => {
    it('has correct method name', () => {
      expect(registerLocationHintsHandler.method).toBe('registerLocationHints');
    });

    it('has correct hooks configuration', () => {
      expect(registerLocationHintsHandler.hooks).toStrictEqual({
        registerLocationHints: true,
      });
    });

    it('calls the registerLocationHints hook with correct parameters', async () => {
      const mockRegisterLocationHints: RegisterLocationHints = vi.fn(
        async () => null,
      );

      const hooks = {
        registerLocationHints: mockRegisterLocationHints,
      };

      const params = {
        peerId: 'peer-123',
        hints: ['hint-1', 'hint-2'],
      };

      const result = await registerLocationHintsHandler.implementation(
        hooks,
        params,
      );

      expect(mockRegisterLocationHints).toHaveBeenCalledTimes(1);
      expect(mockRegisterLocationHints).toHaveBeenCalledWith('peer-123', [
        'hint-1',
        'hint-2',
      ]);
      expect(result).toBeNull();
    });

    it('returns null from the hook', async () => {
      const mockRegisterLocationHints: RegisterLocationHints = vi.fn(
        async () => null,
      );

      const hooks = {
        registerLocationHints: mockRegisterLocationHints,
      };

      const params = {
        peerId: 'test-peer',
        hints: ['hint-1', 'hint-2'],
      };

      const result = await registerLocationHintsHandler.implementation(
        hooks,
        params,
      );

      expect(result).toBeNull();
    });

    it('propagates errors from the hook', async () => {
      const mockRegisterLocationHints: RegisterLocationHints = vi.fn(
        async () => {
          throw new Error('Register location hints failed');
        },
      );

      const hooks = {
        registerLocationHints: mockRegisterLocationHints,
      };

      const params = {
        peerId: 'failing-peer',
        hints: ['hint-1', 'hint-2'],
      };

      await expect(
        registerLocationHintsHandler.implementation(hooks, params),
      ).rejects.toThrow('Register location hints failed');
    });

    it('handles empty string peerId', async () => {
      const mockRegisterLocationHints: RegisterLocationHints = vi.fn(
        async () => null,
      );

      const hooks = {
        registerLocationHints: mockRegisterLocationHints,
      };

      const params = {
        peerId: '',
        hints: ['hint-1', 'hint-2'],
      };

      await registerLocationHintsHandler.implementation(hooks, params);

      expect(mockRegisterLocationHints).toHaveBeenCalledWith('', [
        'hint-1',
        'hint-2',
      ]);
    });

    it('handles unicode characters in peerId', async () => {
      const mockRegisterLocationHints: RegisterLocationHints = vi.fn(
        async () => null,
      );

      const hooks = {
        registerLocationHints: mockRegisterLocationHints,
      };

      const params = {
        peerId: '🌟peer-123🌟',
        hints: ['hint-1', 'hint-2'],
      };

      await registerLocationHintsHandler.implementation(hooks, params);

      expect(mockRegisterLocationHints).toHaveBeenCalledWith('🌟peer-123🌟', [
        'hint-1',
        'hint-2',
      ]);
    });

    it('handles async hook that returns a Promise', async () => {
      const mockRegisterLocationHints: RegisterLocationHints = vi.fn(
        async () => {
          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, 1));
          return null;
        },
      );

      const hooks = {
        registerLocationHints: mockRegisterLocationHints,
      };

      const params = {
        peerId: 'async-peer',
        hints: ['hint-1', 'hint-2'],
      };

      const result = await registerLocationHintsHandler.implementation(
        hooks,
        params,
      );

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
        const mockRegisterLocationHints: RegisterLocationHints = vi.fn(
          async () => {
            throw error;
          },
        );

        const hooks = {
          registerLocationHints: mockRegisterLocationHints,
        };

        const params = {
          peerId,
          hints: ['hint-1', 'hint-2'],
        };

        await expect(
          registerLocationHintsHandler.implementation(hooks, params),
        ).rejects.toThrow(error);

        expect(mockRegisterLocationHints).toHaveBeenCalledWith(peerId, [
          'hint-1',
          'hint-2',
        ]);
      },
    );
  });
});
