import { describe, it, expect, vi } from 'vitest';

import { makeLoopbackHub } from './hub.ts';

describe('makeLoopbackHub', () => {
  it('delivers a message to the target and returns its reply', async () => {
    const hub = makeLoopbackHub();
    const receive = vi.fn(
      async (from: string, message: string) => `ack:${from}:${message}`,
    );
    hub.register('z-b', receive, 'inc-b');

    const reply = await hub.deliver('z-a', 'z-b', 'hello');

    expect(receive).toHaveBeenCalledWith('z-a', 'hello');
    expect(reply).toBe('ack:z-a:hello');
  });

  it('exposes a registered peer incarnation and undefined otherwise', () => {
    const hub = makeLoopbackHub();
    hub.register('z-b', vi.fn().mockResolvedValue(null), 'inc-b');
    expect(hub.getIncarnation('z-b')).toBe('inc-b');
    expect(hub.getIncarnation('z-missing')).toBeUndefined();
  });

  it('throws when delivering to an unregistered peer', async () => {
    const hub = makeLoopbackHub();
    await expect(hub.deliver('z-a', 'z-b', 'hello')).rejects.toThrow(
      'Cannot deliver to unregistered peer: z-b',
    );
  });

  it('stops delivering after unregister', async () => {
    const hub = makeLoopbackHub();
    hub.register('z-b', vi.fn().mockResolvedValue(null), 'inc-b');
    hub.unregister('z-b');
    expect(hub.getIncarnation('z-b')).toBeUndefined();
    await expect(hub.deliver('z-a', 'z-b', 'hi')).rejects.toThrow(
      'unregistered peer',
    );
  });
});
