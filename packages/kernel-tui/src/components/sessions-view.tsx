import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { KernelApi, PendingRequest, SessionSummary } from '../types.ts';

type SessionWithRequests = SessionSummary & { requests: PendingRequest[] };

type FlatRequest = { sessionId: string; request: PendingRequest };

type SessionsViewProps = {
  kernelApi: KernelApi;
};

const POLL_INTERVAL_MS = 2000;

/**
 * View showing all sessions and their pending authorization requests.
 * Navigation: ↑/↓ to move between requests, a=accept, r=reject, R=refresh.
 *
 * @param props - Component props.
 * @param props.kernelApi - Kernel API for session operations.
 * @returns The SessionsView component.
 */
export function SessionsView({
  kernelApi,
}: SessionsViewProps): React.ReactElement {
  const [sessions, setSessions] = useState<SessionWithRequests[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [deciding, setDeciding] = useState(false);
  const mountedRef = useRef(true);

  const allRequests: FlatRequest[] = sessions.flatMap((session) =>
    session.requests.map((request) => ({
      sessionId: session.sessionId,
      request,
    })),
  );

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

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [refresh]);

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setCursor((prev) => Math.min(allRequests.length - 1, prev + 1));
    } else if (input === 'R') {
      setLoading(true);
      refresh();
    } else if ((input === 'a' || input === 'r') && !deciding) {
      const focused = allRequests[cursor];
      if (focused === undefined) {
        return;
      }
      const verdict = input === 'a' ? 'accept' : 'reject';
      setDeciding(true);
      kernelApi
        .decide(focused.sessionId, focused.request.token, verdict)
        .then(() => {
          if (mountedRef.current) {
            setCursor((prev) => Math.max(0, prev - 1));
            refresh();
          }
          return undefined;
        })
        .catch((caught: Error) => {
          if (mountedRef.current) {
            setError(caught.message);
          }
        })
        .finally(() => {
          if (mountedRef.current) {
            setDeciding(false);
          }
        });
    }
  });

  if (loading && sessions.length === 0) {
    return (
      <Box paddingX={1}>
        <Text>
          <Spinner type="dots" /> Loading sessions...
        </Text>
      </Box>
    );
  }

  if (error) {
    const isMethodMissing =
      error.includes('not exist') || error.includes('not available');
    return (
      <Box paddingX={1} flexDirection="column">
        <Text color="red">Error: {error}</Text>
        {isMethodMissing && (
          <Text dimColor>
            Session RPCs are not available on this daemon. Rebuild and restart
            with the sessions branch.
          </Text>
        )}
      </Box>
    );
  }

  if (sessions.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>
          No sessions — use `ocap session create` to start one
        </Text>
      </Box>
    );
  }

  let requestIndex = 0;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Sessions</Text>
      {deciding && (
        <Text color="yellow">
          <Spinner type="dots" /> Submitting decision...
        </Text>
      )}
      {sessions.map((session) => (
        <Box key={session.sessionId} flexDirection="column" marginTop={1}>
          <Text bold color="cyan">
            {session.sessionId}
          </Text>
          {session.requests.length === 0 ? (
            <Text dimColor>{'  '}(no pending requests)</Text>
          ) : (
            session.requests.map((req) => {
              const isFocused = requestIndex === cursor;
              const idx = requestIndex;
              requestIndex += 1;
              return (
                <Box
                  key={`${session.sessionId}:${req.token}`}
                  flexDirection="column"
                  paddingLeft={2}
                >
                  <Text
                    {...(isFocused
                      ? { color: 'yellow' as const, bold: true }
                      : {})}
                  >
                    {isFocused ? '► ' : '  '}[{idx}] {req.description}
                  </Text>
                  <Text dimColor>
                    {'     '}
                    {req.reason}
                  </Text>
                </Box>
              );
            })
          )}
        </Box>
      ))}
    </Box>
  );
}
