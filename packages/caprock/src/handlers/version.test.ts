import { describe, expect, it } from 'vitest';

import { checkHookVersionTransition, compareSemver } from './version.ts';
import { makeFakeDeps, makeSessionState } from '../../test/handler-fakes.ts';

describe('compareSemver', () => {
  it.each([
    ['0.1.0', '0.1.0', 0],
    ['0.1.0', '0.1.1', -1],
    ['0.1.1', '0.1.0', 1],
    ['0.2.0', '0.10.0', -1],
    ['1.0.0', '0.99.99', 1],
    ['0.1', '0.1.0', 0],
  ] as const)('compares %s vs %s → %i', (left, right, expected) => {
    expect(compareSemver(left, right)).toBe(expected);
  });
});

describe('checkHookVersionTransition', () => {
  it('is a no-op when hookVersionHistory is undefined (legacy session)', async () => {
    const deps = makeFakeDeps({ hookVersion: '0.2.0' });
    const state = makeSessionState({ hookVersionHistory: undefined });
    const result = await checkHookVersionTransition('s1', state, deps);
    expect(result).toBe(state);
    expect(deps.store.saveSessionState).not.toHaveBeenCalled();
    expect(deps.store.appendEvent).not.toHaveBeenCalled();
  });

  it('is a no-op when the recorded version matches', async () => {
    const deps = makeFakeDeps({ hookVersion: '0.1.0' });
    const state = makeSessionState({
      hookVersionHistory: [
        { version: '0.1.0', recordedAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
    const result = await checkHookVersionTransition('s1', state, deps);
    expect(result.hookVersionHistory).toHaveLength(1);
    expect(deps.store.saveSessionState).not.toHaveBeenCalled();
    expect(deps.store.appendEvent).not.toHaveBeenCalled();
  });

  it('appends a record and emits version_up on a bump', async () => {
    const deps = makeFakeDeps({
      hookVersion: '0.2.0',
      now: () => '2026-06-15T00:00:00.000Z',
    });
    const state = makeSessionState({
      hookVersionHistory: [
        { version: '0.1.0', recordedAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
    const result = await checkHookVersionTransition('s1', state, deps);
    expect(result.hookVersionHistory).toStrictEqual([
      { version: '0.1.0', recordedAt: '2026-01-01T00:00:00.000Z' },
      { version: '0.2.0', recordedAt: '2026-06-15T00:00:00.000Z' },
    ]);
    expect(deps.store.appendEvent).toHaveBeenCalledWith('s1', {
      t: '2026-06-15T00:00:00.000Z',
      event: 'version_up',
      sessionId: 's1',
      prevHookVersion: '0.1.0',
      newHookVersion: '0.2.0',
    });
    expect(deps.store.saveSessionState).toHaveBeenCalledWith('s1', result);
  });

  it('throws on a downgrade (monotonic versioning violated)', async () => {
    const deps = makeFakeDeps({ hookVersion: '0.1.0' });
    const state = makeSessionState({
      hookVersionHistory: [
        { version: '0.2.0', recordedAt: '2026-06-15T00:00:00.000Z' },
      ],
    });
    await expect(checkHookVersionTransition('s1', state, deps)).rejects.toThrow(
      /monotonically non-decreasing/u,
    );
    expect(deps.store.saveSessionState).not.toHaveBeenCalled();
    expect(deps.store.appendEvent).not.toHaveBeenCalled();
  });
});
