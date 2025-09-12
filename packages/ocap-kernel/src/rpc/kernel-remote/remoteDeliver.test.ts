import { is } from '@metamask/superstruct';
import { describe, it, expect, vi } from 'vitest';

import type { HandleRemoteDeliver } from './remoteDeliver.ts';
import { remoteDeliverSpec, remoteDeliverHandler } from './remoteDeliver.ts';

describe('remoteDeliver', () => {
  describe('remoteDeliverSpec', () => {
    it('should have correct method name', () => {
      expect(remoteDeliverSpec.method).toBe('remoteDeliver');
    });

    it('should have correct result type', () => {
      // Test that result validator accepts strings
      expect(is('test-result', remoteDeliverSpec.result)).toBe(true);
      expect(is(123, remoteDeliverSpec.result)).toBe(false);
      expect(is(null, remoteDeliverSpec.result)).toBe(false);
      expect(is(undefined, remoteDeliverSpec.result)).toBe(false);
    });

    it('should validate params correctly', () => {
      const validParams = {
        from: 'peer-123',
        message: 'hello world',
      };

      expect(is(validParams, remoteDeliverSpec.params)).toBe(true);

      const invalidParams = {
        from: 123,
        message: 'hello world',
      };

      expect(is(invalidParams, remoteDeliverSpec.params)).toBe(false);
    });
  });

  describe('remoteDeliverHandler', () => {
    it('should have correct method name', () => {
      expect(remoteDeliverHandler.method).toBe('remoteDeliver');
    });

    it('should have correct hooks configuration', () => {
      expect(remoteDeliverHandler.hooks).toStrictEqual({
        remoteDeliver: true,
      });
    });

    it('should call the remoteDeliver hook with correct parameters', async () => {
      const mockRemoteDeliver: HandleRemoteDeliver = vi.fn(
        async (from: string, message: string) =>
          `processed: ${from} - ${message}`,
      );

      const hooks = {
        remoteDeliver: mockRemoteDeliver,
      };

      const params = {
        from: 'peer-123',
        message: 'hello world',
      };

      const result = await remoteDeliverHandler.implementation(hooks, params);

      expect(mockRemoteDeliver).toHaveBeenCalledTimes(1);
      expect(mockRemoteDeliver).toHaveBeenCalledWith('peer-123', 'hello world');
      expect(result).toBe('processed: peer-123 - hello world');
    });

    it('should return the result from the hook', async () => {
      const mockRemoteDeliver: HandleRemoteDeliver = vi.fn(
        async () => 'custom-response',
      );

      const hooks = {
        remoteDeliver: mockRemoteDeliver,
      };

      const params = {
        from: 'test-peer',
        message: 'test-message',
      };

      const result = await remoteDeliverHandler.implementation(hooks, params);

      expect(result).toBe('custom-response');
    });

    it('should propagate errors from the hook', async () => {
      const mockRemoteDeliver: HandleRemoteDeliver = vi.fn(async () => {
        throw new Error('Remote delivery failed');
      });

      const hooks = {
        remoteDeliver: mockRemoteDeliver,
      };

      const params = {
        from: 'test-peer',
        message: 'test-message',
      };

      await expect(
        remoteDeliverHandler.implementation(hooks, params),
      ).rejects.toThrow('Remote delivery failed');
    });

    it('should handle empty string parameters', async () => {
      const mockRemoteDeliver: HandleRemoteDeliver = vi.fn(
        async (from: string, message: string) => `empty: ${from} - ${message}`,
      );

      const hooks = {
        remoteDeliver: mockRemoteDeliver,
      };

      const params = {
        from: '',
        message: '',
      };

      const result = await remoteDeliverHandler.implementation(hooks, params);

      expect(mockRemoteDeliver).toHaveBeenCalledWith('', '');
      expect(result).toBe('empty:  - ');
    });

    it('should handle unicode characters in parameters', async () => {
      const mockRemoteDeliver: HandleRemoteDeliver = vi.fn(
        async (from: string, message: string) =>
          `unicode: ${from} - ${message}`,
      );

      const hooks = {
        remoteDeliver: mockRemoteDeliver,
      };

      const params = {
        from: '🌟peer-123🌟',
        message: 'hello 世界 🌍',
      };

      const result = await remoteDeliverHandler.implementation(hooks, params);

      expect(mockRemoteDeliver).toHaveBeenCalledWith(
        '🌟peer-123🌟',
        'hello 世界 🌍',
      );
      expect(result).toBe('unicode: 🌟peer-123🌟 - hello 世界 🌍');
    });

    it('should handle async hook that returns a Promise', async () => {
      const mockRemoteDeliver: HandleRemoteDeliver = vi.fn(
        async (from: string, message: string) => {
          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, 1));
          return `async-result: ${from} - ${message}`;
        },
      );

      const hooks = {
        remoteDeliver: mockRemoteDeliver,
      };

      const params = {
        from: 'async-peer',
        message: 'async-message',
      };

      const result = await remoteDeliverHandler.implementation(hooks, params);

      expect(result).toBe('async-result: async-peer - async-message');
    });
  });
});
