import { is } from '@metamask/superstruct';
import { describe, it, expect, vi } from 'vitest';

import {
  stopRemoteCommsSpec,
  stopRemoteCommsHandler,
} from './stopRemoteComms.ts';
import type { StopRemoteComms } from '../../types.ts';

describe('stopRemoteComms', () => {
  describe('stopRemoteCommsSpec', () => {
    it('has correct method name', () => {
      expect(stopRemoteCommsSpec.method).toBe('stopRemoteComms');
    });

    it('has correct result type', () => {
      // Test that result validator accepts null
      expect(is(null, stopRemoteCommsSpec.result)).toBe(true);
      expect(is('string', stopRemoteCommsSpec.result)).toBe(false);
      expect(is(123, stopRemoteCommsSpec.result)).toBe(false);
      expect(is(undefined, stopRemoteCommsSpec.result)).toBe(false);
    });

    describe('params validation', () => {
      it('accepts empty array params', () => {
        const validParams: never[] = [];
        expect(is(validParams, stopRemoteCommsSpec.params)).toBe(true);
      });

      it('rejects non-empty array params', () => {
        const invalidParams = ['extra', 'params'];
        expect(is(invalidParams, stopRemoteCommsSpec.params)).toBe(false);
      });

      it.each([
        { name: 'object', value: {} },
        { name: 'string', value: 'string' },
        { name: 'number', value: 123 },
        { name: 'null', value: null },
        { name: 'undefined', value: undefined },
      ])('rejects non-array params: $name', ({ value }) => {
        expect(is(value, stopRemoteCommsSpec.params)).toBe(false);
      });

      it.each([
        { name: 'null', value: [null] },
        { name: 'undefined', value: [undefined] },
        { name: 'number', value: [0] },
        { name: 'string', value: [''] },
        { name: 'object', value: [{}] },
        { name: 'array', value: [[]] },
        { name: 'boolean true', value: [true] },
        { name: 'boolean false', value: [false] },
      ])('rejects array with any content: $name', ({ value }) => {
        expect(is(value, stopRemoteCommsSpec.params)).toBe(false);
      });
    });
  });

  describe('stopRemoteCommsHandler', () => {
    it('has correct method name', () => {
      expect(stopRemoteCommsHandler.method).toBe('stopRemoteComms');
    });

    it('has correct hooks configuration', () => {
      expect(stopRemoteCommsHandler.hooks).toStrictEqual({
        stopRemoteComms: true,
      });
    });

    it('calls the stopRemoteComms hook with no parameters', async () => {
      const mockStopRemoteComms: StopRemoteComms = vi.fn(async () => undefined);

      const hooks = {
        stopRemoteComms: mockStopRemoteComms,
      };

      const params: never[] = [];

      const result = await stopRemoteCommsHandler.implementation(hooks, params);

      expect(mockStopRemoteComms).toHaveBeenCalledTimes(1);
      expect(mockStopRemoteComms).toHaveBeenCalledWith();
      expect(result).toBeNull();
    });

    it('returns null from the hook', async () => {
      const mockStopRemoteComms: StopRemoteComms = vi.fn(async () => undefined);

      const hooks = {
        stopRemoteComms: mockStopRemoteComms,
      };

      const params: never[] = [];

      const result = await stopRemoteCommsHandler.implementation(hooks, params);

      expect(result).toBeNull();
    });

    it('propagates errors from the hook', async () => {
      const mockStopRemoteComms: StopRemoteComms = vi.fn(async () => {
        throw new Error('Stop remote comms failed');
      });

      const hooks = {
        stopRemoteComms: mockStopRemoteComms,
      };

      const params: never[] = [];

      await expect(
        stopRemoteCommsHandler.implementation(hooks, params),
      ).rejects.toThrow('Stop remote comms failed');
    });

    it('handles async hook that returns a Promise', async () => {
      const mockStopRemoteComms: StopRemoteComms = vi.fn(async () => {
        // Simulate async cleanup work
        await new Promise((resolve) => setTimeout(resolve, 1));
        return undefined;
      });

      const hooks = {
        stopRemoteComms: mockStopRemoteComms,
      };

      const params: never[] = [];

      const result = await stopRemoteCommsHandler.implementation(hooks, params);

      expect(result).toBeNull();
    });

    it.each([
      { error: new Error('Network shutdown error') },
      { error: new TypeError('Type error during shutdown') },
      { error: new Error('Connection already closed') },
      { error: new Error('Cleanup timeout') },
    ])('handles shutdown error: $error.message', async ({ error }) => {
      const mockStopRemoteComms: StopRemoteComms = vi.fn(async () => {
        throw error;
      });

      const hooks = {
        stopRemoteComms: mockStopRemoteComms,
      };

      const params: never[] = [];

      await expect(
        stopRemoteCommsHandler.implementation(hooks, params),
      ).rejects.toThrow(error);

      expect(mockStopRemoteComms).toHaveBeenCalledWith();
    });

    it('does not pass params to the hook function', async () => {
      const mockStopRemoteComms: StopRemoteComms = vi.fn(async () => undefined);

      const hooks = {
        stopRemoteComms: mockStopRemoteComms,
      };

      // Even though we pass params to implementation, the hook should not receive them
      const params: never[] = [];

      await stopRemoteCommsHandler.implementation(hooks, params);

      // Verify the hook was called with no arguments
      expect(mockStopRemoteComms).toHaveBeenCalledWith();
    });

    it('handles hook that performs network cleanup', async () => {
      let cleanupPerformed = false;
      const mockStopRemoteComms: StopRemoteComms = vi.fn(async () => {
        // Simulate stopping libp2p, clearing connections, etc.
        await new Promise((resolve) => setTimeout(resolve, 5));
        cleanupPerformed = true;
        return undefined;
      });

      const hooks = {
        stopRemoteComms: mockStopRemoteComms,
      };

      const params: never[] = [];

      const result = await stopRemoteCommsHandler.implementation(hooks, params);

      expect(result).toBeNull();
      expect(cleanupPerformed).toBe(true);
    });
  });
});
