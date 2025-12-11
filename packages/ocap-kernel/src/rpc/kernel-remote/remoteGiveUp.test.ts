import { is } from '@metamask/superstruct';
import { describe, it, expect, vi } from 'vitest';

import type { HandleRemoteGiveUp } from './remoteGiveUp.ts';
import { remoteGiveUpSpec, remoteGiveUpHandler } from './remoteGiveUp.ts';

describe('remoteGiveUp', () => {
  describe('remoteGiveUpSpec', () => {
    it('should have correct method name', () => {
      expect(remoteGiveUpSpec.method).toBe('remoteGiveUp');
    });

    it('should have correct result type', () => {
      expect(is(null, remoteGiveUpSpec.result)).toBe(true);
      expect(is('not-null', remoteGiveUpSpec.result)).toBe(false);
      expect(is(123, remoteGiveUpSpec.result)).toBe(false);
      expect(is(undefined, remoteGiveUpSpec.result)).toBe(false);
    });

    it('should validate params correctly', () => {
      const validParams = {
        peerId: 'peer-123',
      };
      expect(is(validParams, remoteGiveUpSpec.params)).toBe(true);
      const invalidParams = {
        peerId: 123,
      };
      expect(is(invalidParams, remoteGiveUpSpec.params)).toBe(false);
    });
  });

  describe('remoteGiveUpHandler', () => {
    it('should have correct result type', () => {
      expect(remoteGiveUpHandler.method).toBe('remoteGiveUp');
      expect(remoteGiveUpHandler.params).toBeDefined();
      expect(remoteGiveUpHandler.result).toBeDefined();
      expect(remoteGiveUpHandler.hooks).toStrictEqual({
        remoteGiveUp: true,
      });
    });

    it('should call the remoteGiveUp hook with correct parameters', async () => {
      const mockRemoteGiveUp: HandleRemoteGiveUp = vi.fn(
        async (_peerId: string) => null,
      );
      const hooks = {
        remoteGiveUp: mockRemoteGiveUp,
      };
      const params = {
        peerId: 'peer-123',
      };
      const result = await remoteGiveUpHandler.implementation(hooks, params);
      expect(mockRemoteGiveUp).toHaveBeenCalledTimes(1);
      expect(mockRemoteGiveUp).toHaveBeenCalledWith('peer-123');
      expect(result).toBeNull();
    });

    it('should return null after calling the hook', async () => {
      const mockRemoteGiveUp: HandleRemoteGiveUp = vi.fn(
        async (_peerId: string) => null,
      );
      const hooks = {
        remoteGiveUp: mockRemoteGiveUp,
      };
      const params = {
        peerId: 'test-peer',
      };
      const result = await remoteGiveUpHandler.implementation(hooks, params);
      expect(result).toBeNull();
    });

    it('should propagate errors from the hook', async () => {
      const mockRemoteGiveUp: HandleRemoteGiveUp = vi.fn(async () => {
        throw new Error('Remote give up failed');
      });
      const hooks = {
        remoteGiveUp: mockRemoteGiveUp,
      };
      const params = {
        peerId: 'test-peer',
      };
      await expect(
        remoteGiveUpHandler.implementation(hooks, params),
      ).rejects.toThrow('Remote give up failed');
    });

    it('should handle empty string parameters', async () => {
      const mockRemoteGiveUp: HandleRemoteGiveUp = vi.fn(async () => null);
      const hooks = {
        remoteGiveUp: mockRemoteGiveUp,
      };
      const params = {
        peerId: '',
      };
      const result = await remoteGiveUpHandler.implementation(hooks, params);
      expect(mockRemoteGiveUp).toHaveBeenCalledWith('');
      expect(result).toBeNull();
    });

    it('should handle async hook that returns a Promise', async () => {
      const mockRemoteGiveUp: HandleRemoteGiveUp = vi.fn(
        async (_peerId: string) => {
          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, 1));
          return null;
        },
      );
      const hooks = {
        remoteGiveUp: mockRemoteGiveUp,
      };
      const params = {
        peerId: 'async-peer',
      };
      const result = await remoteGiveUpHandler.implementation(hooks, params);
      expect(result).toBeNull();
      expect(mockRemoteGiveUp).toHaveBeenCalledWith('async-peer');
    });
  });
});
