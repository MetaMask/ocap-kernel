import { is } from '@metamask/superstruct';
import { describe, it, expect, vi } from 'vitest';

import type { ResetAllBackoffsImpl } from './resetAllBackoffs.ts';
import {
  resetAllBackoffsSpec,
  resetAllBackoffsHandler,
} from './resetAllBackoffs.ts';

describe('resetAllBackoffs', () => {
  describe('resetAllBackoffsSpec', () => {
    it('has correct method name', () => {
      expect(resetAllBackoffsSpec.method).toBe('resetAllBackoffs');
    });

    it('has correct result type', () => {
      expect(is(null, resetAllBackoffsSpec.result)).toBe(true);
      expect(is('string', resetAllBackoffsSpec.result)).toBe(false);
      expect(is(123, resetAllBackoffsSpec.result)).toBe(false);
      expect(is(undefined, resetAllBackoffsSpec.result)).toBe(false);
    });

    describe('params validation', () => {
      it('accepts empty array params', () => {
        expect(is([], resetAllBackoffsSpec.params)).toBe(true);
      });

      it('rejects non-empty array params', () => {
        expect(is(['extra'], resetAllBackoffsSpec.params)).toBe(false);
      });

      it.each([
        { name: 'object', value: {} },
        { name: 'string', value: 'string' },
        { name: 'number', value: 123 },
        { name: 'null', value: null },
        { name: 'undefined', value: undefined },
      ])('rejects non-array params: $name', ({ value }) => {
        expect(is(value, resetAllBackoffsSpec.params)).toBe(false);
      });
    });
  });

  describe('resetAllBackoffsHandler', () => {
    it('has correct method name', () => {
      expect(resetAllBackoffsHandler.method).toBe('resetAllBackoffs');
    });

    it('has correct hooks configuration', () => {
      expect(resetAllBackoffsHandler.hooks).toStrictEqual({
        resetAllBackoffs: true,
      });
    });

    it('calls the resetAllBackoffs hook and returns null', async () => {
      const mockResetAllBackoffs: ResetAllBackoffsImpl = vi.fn(
        async () => null,
      );
      const hooks = { resetAllBackoffs: mockResetAllBackoffs };

      const result = await resetAllBackoffsHandler.implementation(hooks, []);

      expect(mockResetAllBackoffs).toHaveBeenCalledOnce();
      expect(result).toBeNull();
    });

    it('propagates errors from the hook', async () => {
      const mockResetAllBackoffs: ResetAllBackoffsImpl = vi.fn(async () => {
        throw new Error('Reset failed');
      });
      const hooks = { resetAllBackoffs: mockResetAllBackoffs };

      await expect(
        resetAllBackoffsHandler.implementation(hooks, []),
      ).rejects.toThrow('Reset failed');
    });
  });
});
