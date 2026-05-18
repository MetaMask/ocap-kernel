import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { homedir } from 'node:os';
import React, { useState } from 'react';

import { useSessionData } from '../hooks/use-session-data.ts';
import type { KernelApi, SessionSummary } from '../types.ts';
import {
  formatExpandedContent,
  parseDescription,
  SessionDetailView,
} from './session-detail-view.tsx';

type SessionsViewProps = {
  kernelApi: KernelApi;
};

/**
 * Tildefy an absolute path by replacing the home directory prefix with `~`.
 *
 * @param dir - Absolute path.
 * @returns Tildefied path string.
 */
function tildify(dir: string): string {
  const home = homedir();
  return home.length > 0 && dir.startsWith(home)
    ? `~${dir.slice(home.length)}`
    : dir;
}

/**
 * Format an ISO 8601 timestamp as `YYYY.MM.DD..HH:mm`.
 *
 * @param iso - ISO 8601 string.
 * @returns Formatted date-time string.
 */
function formatStartedAt(iso: string): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${year}.${mo}.${day}..${hour}:${min}`;
}

/**
 * Renders session metadata as a parenthesised suffix string.
 *
 * @param session - The session summary.
 * @returns Formatted metadata string, or empty string if none.
 */
function sessionMetaSuffix(session: SessionSummary): string {
  const meta: string[] = [];
  if (session.cwd !== undefined) {
    meta.push(tildify(session.cwd));
  }
  if (session.startedAt !== undefined) {
    meta.push(formatStartedAt(session.startedAt));
  }
  return meta.length > 0 ? ` (${meta.join(' ')})` : '';
}

/**
 * View showing all sessions and their pending authorization requests.
 *
 * Top-level navigation: ↑/↓ between sessions, → to drill into a session.
 * Session detail navigation: ↑/↓ between timeline entries, → expand, ← collapse/back.
 *
 * Data fetching is delegated to {@link useSessionData}; this component owns
 * only the cursor position.
 *
 * @param props - Component props.
 * @param props.kernelApi - Kernel API for session operations.
 * @returns The SessionsView component.
 */
export function SessionsView({
  kernelApi,
}: SessionsViewProps): React.ReactElement {
  const [cursor, setCursor] = useState(0);
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);
  const {
    sessions,
    loading,
    error,
    detailSession,
    detailHistory,
    openDetail,
    closeDetail,
    refresh,
    onDecided,
  } = useSessionData(kernelApi);

  useInput((input, key) => {
    if (detailSession !== null) {
      return;
    }
    if (key.upArrow) {
      setCursor((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setCursor((prev) => Math.min(sessions.length - 1, prev + 1));
    } else if (key.rightArrow) {
      const focused = sessions[cursor];
      if (focused !== undefined) {
        openDetail(focused);
      }
    } else if ((input === '1' || input === '3') && !deciding) {
      const session = sessions[cursor];
      const oldest = session?.requests[0];
      if (session === undefined || oldest === undefined) {
        return;
      }
      const verdict = input === '1' ? 'accept' : 'reject';
      setDecideError(null);
      setDeciding(true);
      kernelApi
        .decide(session.sessionId, oldest.token, verdict)
        .then(() => {
          onDecided();
          return undefined;
        })
        .catch((caught: Error) => {
          setDecideError(caught.message);
        })
        .finally(() => {
          setDeciding(false);
        });
    } else if (input === 'R') {
      refresh();
    }
  });

  if (detailSession !== null) {
    return (
      <SessionDetailView
        session={detailSession}
        entries={detailHistory}
        kernelApi={kernelApi}
        onBack={closeDetail}
        onDecided={onDecided}
      />
    );
  }

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

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Sessions</Text>
      {deciding && (
        <Text dimColor color="yellow">
          (submitting…)
        </Text>
      )}
      {decideError !== null && <Text color="red">{decideError}</Text>}
      {sessions.map((session, idx) => {
        const isFocused = idx === cursor;
        const pendingCount = session.requests.length;
        const metaSuffix = sessionMetaSuffix(session);
        const oldest = session.requests[0];

        let pendingSection: React.ReactElement;
        if (pendingCount === 0) {
          pendingSection = <Text dimColor>(no pending requests)</Text>;
        } else if (!isFocused || oldest === undefined) {
          pendingSection = <Text color="yellow">{pendingCount} pending</Text>;
        } else {
          const requestLabel = parseDescription(oldest.description).label;
          const requestLines = formatExpandedContent(oldest.description).split(
            '\n',
          );
          pendingSection = (
            <>
              <Box gap={1}>
                <Text color="yellow">…</Text>
                <Text>{requestLabel}</Text>
              </Box>
              {requestLines.map((line, lineIdx) => (
                <Box key={`${oldest.token}-${lineIdx}`} paddingLeft={2}>
                  <Text dimColor wrap="wrap">
                    {line}
                  </Text>
                </Box>
              ))}
              {pendingCount > 1 && (
                <Text dimColor>+{pendingCount - 1} more pending</Text>
              )}
            </>
          );
        }

        return (
          <Box key={session.sessionId} flexDirection="column" marginTop={1}>
            <Box gap={1}>
              <Text>{isFocused ? '►' : ' '}</Text>
              <Text bold color="cyan">
                {session.sessionId}
              </Text>
              {metaSuffix.length > 0 && <Text dimColor>{metaSuffix}</Text>}
            </Box>
            <Box paddingLeft={3} flexDirection="column">
              {pendingSection}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
