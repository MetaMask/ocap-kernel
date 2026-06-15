// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { KernelApi } from '../types.ts';
import { useSessionData } from './use-session-data.ts';

function makeKernelApi(): KernelApi {
  return {
    listSessions: vi.fn().mockResolvedValue([]),
    listRequests: vi.fn().mockResolvedValue([]),
    listHistory: vi.fn().mockResolvedValue([]),
    decide: vi.fn().mockResolvedValue(undefined),
    launchSubcluster: vi.fn().mockResolvedValue(null as never),
    queueMessage: vi.fn().mockResolvedValue(null as never),
    getStatus: vi.fn().mockResolvedValue(null as never),
    getObjectRegistry: vi.fn().mockResolvedValue(null as never),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

describe('useSessionData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with loading=true', () => {
    const kernelApi = makeKernelApi();
    const { result } = renderHook(() => useSessionData(kernelApi));
    expect(result.current.loading).toBe(true);
  });

  it('sets loading=false after first fetch', async () => {
    const kernelApi = makeKernelApi();
    const { result } = renderHook(() => useSessionData(kernelApi));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.loading).toBe(false);
  });

  it('calls listSessions on mount', async () => {
    const kernelApi = makeKernelApi();
    renderHook(() => useSessionData(kernelApi));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(kernelApi.listSessions).toHaveBeenCalledTimes(1);
  });

  it('sets sessions from API', async () => {
    const kernelApi = makeKernelApi();
    vi.mocked(kernelApi.listSessions).mockResolvedValue([
      { sessionId: 'alice', ocapUrl: 'ocap://alice' },
    ]);
    vi.mocked(kernelApi.listRequests).mockResolvedValue([
      { token: 't0', description: 'x', reason: 'y' },
    ]);

    const { result } = renderHook(() => useSessionData(kernelApi));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0]?.requests).toHaveLength(1);
  });

  it('sorts sessions by lastActiveAt descending, undefined last', async () => {
    const kernelApi = makeKernelApi();
    vi.mocked(kernelApi.listSessions).mockResolvedValue([
      {
        sessionId: 'old',
        ocapUrl: 'ocap://old',
        startedAt: '2026-06-01T15:01:00.000Z',
        lastActiveAt: '2026-06-01T15:01:00.000Z',
      },
      { sessionId: 'no-time', ocapUrl: 'ocap://no-time' },
      {
        sessionId: 'started-old-but-active',
        ocapUrl: 'ocap://started-old-but-active',
        startedAt: '2026-06-02T00:00:00.000Z',
        lastActiveAt: '2026-06-12T09:00:00.000Z',
      },
      {
        sessionId: 'mid',
        ocapUrl: 'ocap://mid',
        startedAt: '2026-06-08T11:54:00.000Z',
        lastActiveAt: '2026-06-08T11:54:00.000Z',
      },
    ]);

    const { result } = renderHook(() => useSessionData(kernelApi));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(
      result.current.sessions.map((session) => session.sessionId),
    ).toStrictEqual(['started-old-but-active', 'mid', 'old', 'no-time']);
  });

  it('sets error when listSessions throws', async () => {
    const kernelApi = makeKernelApi();
    vi.mocked(kernelApi.listSessions).mockRejectedValue(
      new Error('network failure'),
    );

    const { result } = renderHook(() => useSessionData(kernelApi));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.error).toBe('network failure');
    expect(result.current.loading).toBe(false);
  });

  it('openDetail fetches history and sets detailSession', async () => {
    const kernelApi = makeKernelApi();
    const session = { sessionId: 'alice', ocapUrl: 'ocap://alice' };
    vi.mocked(kernelApi.listHistory).mockResolvedValue([
      {
        token: 't1',
        description: 'read',
        reason: 'needs read',
        guard: { body: '{}', slots: [] },
        queuedAt: '2026-01-01T00:00:00.000Z',
        status: 'pending',
      },
    ]);

    const { result } = renderHook(() => useSessionData(kernelApi));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      result.current.openDetail(session);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.detailSession).toStrictEqual(session);
    expect(kernelApi.listHistory).toHaveBeenCalledWith('alice');
  });

  it('closeDetail clears detailSession and detailHistory', async () => {
    const kernelApi = makeKernelApi();
    const session = { sessionId: 'alice', ocapUrl: 'ocap://alice' };
    vi.mocked(kernelApi.listHistory).mockResolvedValue([
      {
        token: 't1',
        description: 'read',
        reason: 'needs read',
        guard: { body: '{}', slots: [] },
        queuedAt: '2026-01-01T00:00:00.000Z',
        status: 'pending',
      },
    ]);

    const { result } = renderHook(() => useSessionData(kernelApi));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      result.current.openDetail(session);
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      result.current.closeDetail();
    });

    expect(result.current.detailSession).toBeNull();
    expect(result.current.detailHistory).toStrictEqual([]);
  });

  it('polls session list at POLL_INTERVAL_MS', async () => {
    const kernelApi = makeKernelApi();
    renderHook(() => useSessionData(kernelApi));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const callsAfterMount = vi.mocked(kernelApi.listSessions).mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(vi.mocked(kernelApi.listSessions).mock.calls.length).toBeGreaterThan(
      callsAfterMount,
    );
  });

  it('does not poll detail when no detail is open', async () => {
    const kernelApi = makeKernelApi();
    renderHook(() => useSessionData(kernelApi));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(kernelApi.listHistory).not.toHaveBeenCalled();
  });
});
