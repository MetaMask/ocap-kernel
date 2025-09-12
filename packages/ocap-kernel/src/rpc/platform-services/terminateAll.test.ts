import { is } from '@metamask/superstruct';
import { describe, it, expect, vi } from 'vitest';

import type { TerminateAll } from './terminateAll.ts';
import { terminateAllSpec, terminateAllHandler } from './terminateAll.ts';

describe('terminateAll', () => {
  describe('terminateAllSpec', () => {
    it('should have correct method name', () => {
      expect(terminateAllSpec.method).toBe('terminateAll');
    });

    it('should have correct result type', () => {
      // Test that result validator accepts null
      expect(is(null, terminateAllSpec.result)).toBe(true);
      expect(is('string', terminateAllSpec.result)).toBe(false);
      expect(is(123, terminateAllSpec.result)).toBe(false);
      expect(is(undefined, terminateAllSpec.result)).toBe(false);
    });

    describe('params validation', () => {
      it('should accept empty array params', () => {
        const validParams: never[] = [];

        expect(is(validParams, terminateAllSpec.params)).toBe(true);
      });

      it('should reject non-empty array params', () => {
        const invalidParams = ['extra', 'params'];

        expect(is(invalidParams, terminateAllSpec.params)).toBe(false);
      });

      it('should reject non-array params', () => {
        expect(is({}, terminateAllSpec.params)).toBe(false);
        expect(is('string', terminateAllSpec.params)).toBe(false);
        expect(is(123, terminateAllSpec.params)).toBe(false);
        expect(is(null, terminateAllSpec.params)).toBe(false);
        expect(is(undefined, terminateAllSpec.params)).toBe(false);
      });

      it('should reject array with any content', () => {
        const invalidScenarios = [
          [null],
          [undefined],
          [0],
          [''],
          [{}],
          [[]],
          [true],
          [false],
        ];

        for (const scenario of invalidScenarios) {
          expect(is(scenario, terminateAllSpec.params)).toBe(false);
        }
      });
    });
  });

  describe('terminateAllHandler', () => {
    it('should have correct method name', () => {
      expect(terminateAllHandler.method).toBe('terminateAll');
    });

    it('should have correct hooks configuration', () => {
      expect(terminateAllHandler.hooks).toStrictEqual({
        terminateAll: true,
      });
    });

    it('should call the terminateAll hook with no parameters', async () => {
      const mockTerminateAll: TerminateAll = vi.fn(async () => null);

      const hooks = {
        terminateAll: mockTerminateAll,
      };

      const params: never[] = [];

      const result = await terminateAllHandler.implementation(hooks, params);

      expect(mockTerminateAll).toHaveBeenCalledTimes(1);
      expect(mockTerminateAll).toHaveBeenCalledWith();
      expect(result).toBeNull();
    });

    it('should return null from the hook', async () => {
      const mockTerminateAll: TerminateAll = vi.fn(async () => null);

      const hooks = {
        terminateAll: mockTerminateAll,
      };

      const params: never[] = [];

      const result = await terminateAllHandler.implementation(hooks, params);

      expect(result).toBeNull();
    });

    it('should propagate errors from the hook', async () => {
      const mockTerminateAll: TerminateAll = vi.fn(async () => {
        throw new Error('Terminate all failed');
      });

      const hooks = {
        terminateAll: mockTerminateAll,
      };

      const params: never[] = [];

      await expect(
        terminateAllHandler.implementation(hooks, params),
      ).rejects.toThrow('Terminate all failed');
    });

    it('should handle async hook that returns a Promise', async () => {
      const mockTerminateAll: TerminateAll = vi.fn(async () => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 1));
        return null;
      });

      const hooks = {
        terminateAll: mockTerminateAll,
      };

      const params: never[] = [];

      const result = await terminateAllHandler.implementation(hooks, params);

      expect(result).toBeNull();
    });

    it.each([
      new Error('Network error'),
      new TypeError('Type error'),
      new Error('String error'),
      new Error('Object error'),
      new Error('Number error'),
      new Error('Null error'),
      new Error('Undefined error'),
    ])('should handle termination error: $message', async (error) => {
      const mockTerminateAll: TerminateAll = vi.fn(async () => {
        throw error;
      });

      const hooks = {
        terminateAll: mockTerminateAll,
      };

      const params: never[] = [];

      await expect(
        terminateAllHandler.implementation(hooks, params),
      ).rejects.toThrow(error);

      expect(mockTerminateAll).toHaveBeenCalledWith();
    });

    it('should not pass params to the hook function', async () => {
      const mockTerminateAll: TerminateAll = vi.fn(async () => null);

      const hooks = {
        terminateAll: mockTerminateAll,
      };

      // Even though we pass params to implementation, the hook should not receive them
      const params: never[] = [];

      await terminateAllHandler.implementation(hooks, params);

      // Verify the hook was called with no arguments
      expect(mockTerminateAll).toHaveBeenCalledWith();
    });

    it('should handle hook that performs complex cleanup', async () => {
      let cleanupPerformed = false;
      const mockTerminateAll: TerminateAll = vi.fn(async () => {
        // Simulate complex cleanup operations
        await new Promise((resolve) => setTimeout(resolve, 5));
        cleanupPerformed = true;
        return null;
      });

      const hooks = {
        terminateAll: mockTerminateAll,
      };

      const params: never[] = [];

      const result = await terminateAllHandler.implementation(hooks, params);

      expect(result).toBeNull();
      expect(cleanupPerformed).toBe(true);
    });
  });
});
