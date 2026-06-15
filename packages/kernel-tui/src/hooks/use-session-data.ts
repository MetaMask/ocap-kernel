import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  KernelApi,
  PendingRequest,
  SessionHistoryEntry,
  SessionSummary,
} from '../types.ts';

export type SessionWithRequests = SessionSummary & {
  requests: PendingRequest[];
};

const POLL_INTERVAL_MS = 2000;

/**
 * Compare two sessions so the most recently active sorts first. Uses
 * `lastActiveAt` when present, otherwise falls back to `startedAt`. Sessions
 * with neither timestamp sort after every dated session.
 *
 * @param left - Left-hand session.
 * @param right - Right-hand session.
 * @returns Standard compareFn result.
 */
function byLastActiveDesc(
  left: SessionWithRequests,
  right: SessionWithRequests,
): number {
  const leftStamp = left.lastActiveAt ?? left.startedAt;
  const rightStamp = right.lastActiveAt ?? right.startedAt;
  if (leftStamp === undefined && rightStamp === undefined) {
    return 0;
  }
  if (leftStamp === undefined) {
    return 1;
  }
  if (rightStamp === undefined) {
    return -1;
  }
  return rightStamp.localeCompare(leftStamp);
}

export type SessionDataState = {
  sessions: SessionWithRequests[];
  /** True only until the first response arrives (shows initial loading spinner). */
  loading: boolean;
  error: string | null;
  detailSession: SessionSummary | null;
  detailHistory: SessionHistoryEntry[];
  openDetail: (session: SessionSummary) => void;
  closeDetail: () => void;
  /** Silently re-fetch the session list (and detail history if open). */
  refresh: () => void;
  /** Call after a decision is made — refreshes both list and open detail. */
  onDecided: () => void;
};

/**
 * Manages all session data fetching and detail-drill state.
 *
 * Owns two polling intervals: one for the session list, one for the open
 * detail view (started/stopped automatically as detail opens/closes).
 * Components consume the returned state and callbacks without knowing about
 * the fetch lifecycle.
 *
 * @param kernelApi - Kernel API for session operations.
 * @returns Session data state and action callbacks.
 */
export function useSessionData(kernelApi: KernelApi): SessionDataState {
  const [sessions, setSessions] = useState<SessionWithRequests[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailSession, setDetailSession] = useState<SessionSummary | null>(
    null,
  );
  const [detailHistory, setDetailHistory] = useState<SessionHistoryEntry[]>([]);
  const mountedRef = useRef(true);

  const refresh = useCallback((): void => {
    kernelApi
      .listSessions()
      .then(async (summaries) => {
        const withRequests = await Promise.all(
          summaries.map(async (summary) => {
            const requests = await kernelApi.listRequests(summary.sessionId);
            return { ...summary, requests };
          }),
        );
        withRequests.sort(byLastActiveDesc);
        if (mountedRef.current) {
          setSessions(withRequests);
          setLoading(false);
          setError(null);
        }
        return undefined;
      })
      .catch((caught: Error) => {
        if (mountedRef.current) {
          setError(caught.message);
          setLoading(false);
        }
      });
  }, [kernelApi]);

  const refreshDetail = useCallback((): void => {
    if (detailSession === null) {
      return;
    }
    kernelApi
      .listHistory(detailSession.sessionId)
      .then((history) => {
        if (mountedRef.current) {
          setDetailHistory(history);
        }
        return undefined;
      })
      .catch(() => undefined);
  }, [kernelApi, detailSession]);

  const openDetail = useCallback(
    (session: SessionSummary): void => {
      kernelApi
        .listHistory(session.sessionId)
        .then((history) => {
          if (mountedRef.current) {
            setDetailHistory(history);
            setDetailSession(session);
          }
          return undefined;
        })
        .catch(() => undefined);
    },
    [kernelApi],
  );

  const closeDetail = useCallback((): void => {
    setDetailSession(null);
    setDetailHistory([]);
  }, []);

  const onDecided = useCallback((): void => {
    refresh();
    refreshDetail();
  }, [refresh, refreshDetail]);

  // Session list polling.
  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [refresh]);

  // Detail history polling — active only while a detail is open.
  useEffect(() => {
    if (detailSession === null) {
      return () => undefined;
    }
    const interval = setInterval(refreshDetail, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [detailSession, refreshDetail]);

  return {
    sessions,
    loading,
    error,
    detailSession,
    detailHistory,
    openDetail,
    closeDetail,
    refresh,
    onDecided,
  };
}
