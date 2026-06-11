import { describe, expect, it, vi } from 'vitest';

import { getOrInitSession, initFreshSession } from './init.ts';
import {
  makeFakeDeps,
  makeFakeStore,
  makeSessionState,
} from '../../test/handler-fakes.ts';

describe('initFreshSession', () => {
  it('launches the vat and creates the kernel session', async () => {
    const deps = makeFakeDeps({
      store: makeFakeStore({ allowLists: { '/tmp/settings.json': ['x'] } }),
    });

    const state = await initFreshSession('s1', deps);

    expect(state).toMatchObject({
      sessionId: 's1',
      kernelSessionId: 'kernel-test-session',
      rootKref: 'ko1',
      settingsSnapshot: ['x'],
    });
    expect(deps.ensureDaemon).toHaveBeenCalledOnce();
    expect(deps.rpc.launchPermissionVat).toHaveBeenCalledOnce();
    expect(deps.rpc.createKernelSession).toHaveBeenCalledOnce();
    expect(deps.store.states.get('s1')).toStrictEqual(state);
  });

  it('returns null when the daemon is unreachable', async () => {
    const deps = makeFakeDeps();
    (deps.rpc.pingDaemon as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const state = await initFreshSession('s1', deps);

    expect(state).toBeNull();
    expect(deps.rpc.launchPermissionVat).not.toHaveBeenCalled();
  });
});

describe('getOrInitSession', () => {
  it('returns existing state untouched when complete', async () => {
    const existing = makeSessionState({ sessionId: 's1' });
    const deps = makeFakeDeps({
      store: makeFakeStore({ states: { s1: existing } }),
    });

    const state = await getOrInitSession('s1', deps);

    expect(state).toStrictEqual(existing);
    expect(deps.rpc.launchPermissionVat).not.toHaveBeenCalled();
  });

  it('attaches a kernel session to legacy state missing one', async () => {
    const legacy = makeSessionState({ sessionId: 's1' }) as unknown as Record<
      string,
      unknown
    >;
    // Simulate older state files written before kernelSessionId became required.
    delete legacy.kernelSessionId;
    const deps = makeFakeDeps({
      store: makeFakeStore({
        states: { s1: legacy as ReturnType<typeof makeSessionState> },
      }),
    });

    const state = await getOrInitSession('s1', deps);

    expect(state?.kernelSessionId).toBe('kernel-test-session');
    expect(deps.rpc.launchPermissionVat).not.toHaveBeenCalled();
    expect(deps.rpc.createKernelSession).toHaveBeenCalledOnce();
  });

  it('boots a fresh session when none exists', async () => {
    const deps = makeFakeDeps();

    const state = await getOrInitSession('s1', deps);

    expect(state?.sessionId).toBe('s1');
    expect(deps.rpc.launchPermissionVat).toHaveBeenCalledOnce();
  });
});
