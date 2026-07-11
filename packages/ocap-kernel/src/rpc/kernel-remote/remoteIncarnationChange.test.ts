import { is } from '@metamask/superstruct';
import { describe, it, expect, vi } from 'vitest';

import type { HandleRemoteIncarnationChange } from './remoteIncarnationChange.ts';
import {
  remoteIncarnationChangeSpec,
  remoteIncarnationChangeHandler,
} from './remoteIncarnationChange.ts';

describe('remoteIncarnationChange', () => {
  describe('remoteIncarnationChangeSpec', () => {
    it('has the correct method name', () => {
      expect(remoteIncarnationChangeSpec.method).toBe(
        'remoteIncarnationChange',
      );
    });

    it('accepts a boolean result and rejects non-booleans', () => {
      expect(is(true, remoteIncarnationChangeSpec.result)).toBe(true);
      expect(is(false, remoteIncarnationChangeSpec.result)).toBe(true);
      expect(is('true', remoteIncarnationChangeSpec.result)).toBe(false);
      expect(is(undefined, remoteIncarnationChangeSpec.result)).toBe(false);
    });

    it('validates params', () => {
      expect(
        is(
          { peerId: 'peer-123', observedIncarnation: 'inc-1' },
          remoteIncarnationChangeSpec.params,
        ),
      ).toBe(true);
      expect(
        is(
          { peerId: 123, observedIncarnation: 'inc-1' },
          remoteIncarnationChangeSpec.params,
        ),
      ).toBe(false);
      expect(is({ peerId: 'p' }, remoteIncarnationChangeSpec.params)).toBe(
        false,
      );
    });
  });

  describe('remoteIncarnationChangeHandler', () => {
    it('declares its hook', () => {
      expect(remoteIncarnationChangeHandler.hooks).toStrictEqual({
        remoteIncarnationChange: true,
      });
    });

    it('forwards params to the hook and returns its boolean result', async () => {
      const hook: HandleRemoteIncarnationChange = vi.fn(async () => true);
      const result = await remoteIncarnationChangeHandler.implementation(
        { remoteIncarnationChange: hook },
        { peerId: 'peer-123', observedIncarnation: 'inc-2' },
      );
      expect(hook).toHaveBeenCalledWith('peer-123', 'inc-2');
      expect(result).toBe(true);
    });

    it('propagates a false result from the hook', async () => {
      const hook: HandleRemoteIncarnationChange = vi.fn(async () => false);
      const result = await remoteIncarnationChangeHandler.implementation(
        { remoteIncarnationChange: hook },
        { peerId: 'peer-123', observedIncarnation: 'inc-2' },
      );
      expect(result).toBe(false);
    });

    it('propagates errors from the hook', async () => {
      const hook: HandleRemoteIncarnationChange = vi.fn(async () => {
        throw new Error('incarnation check failed');
      });
      await expect(
        remoteIncarnationChangeHandler.implementation(
          { remoteIncarnationChange: hook },
          { peerId: 'peer-123', observedIncarnation: 'inc-2' },
        ),
      ).rejects.toThrow('incarnation check failed');
    });
  });
});
