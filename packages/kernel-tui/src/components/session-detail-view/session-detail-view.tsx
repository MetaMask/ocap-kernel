import type { Provision } from '@metamask/kernel-utils/session';
import { argPatternDisplay } from '@metamask/kernel-utils/session';
import { Box, Text, useInput, useStdout } from 'ink';
import React, { useEffect, useMemo, useState } from 'react';

import {
  formatExpandedContent,
  formatProvisionCompact,
  formatTime,
  parseDescription,
} from './format.ts';
import { clampScroll, windowEndIdx } from './layout.ts';
import { ProvisionEditor } from './provision-editor.tsx';
import { ProvisionsPanel } from './provisions-panel.tsx';
import { deriveActiveProvisions } from './provisions.ts';
import type {
  KernelApi,
  SessionHistoryEntry,
  SessionSummary,
} from '../../types.ts';

type SessionDetailViewProps = {
  session: SessionSummary;
  entries: SessionHistoryEntry[];
  kernelApi: KernelApi;
  onBack: () => void;
  onDecided: () => void;
};

const STATUS_ICON: Record<SessionHistoryEntry['status'], string> = {
  pending: '…',
  accepted: '✓',
  rejected: '✗',
  provisioned: '→',
};

const STATUS_COLOR: Record<
  SessionHistoryEntry['status'],
  'yellow' | 'green' | 'red'
> = {
  pending: 'yellow',
  accepted: 'green',
  rejected: 'red',
  provisioned: 'green',
};

/**
 * Detail view for a single session showing a reverse-chronological timeline of
 * authorization requests (most recent at top). Each entry can be expanded with
 * the right arrow key and collapsed with the left arrow key. Left arrow on a
 * collapsed entry navigates back to the session list.
 *
 * Keybindings: ↑/↓ navigate, → expand, ← collapse/back, 1 accept, 2 grant with provision, 3 reject.
 *
 * @param props - Component props.
 * @param props.session - The session being viewed.
 * @param props.entries - Chronological history entries (oldest first).
 * @param props.kernelApi - Kernel API for deciding on pending entries.
 * @param props.onBack - Callback to return to the session list.
 * @param props.onDecided - Callback to trigger a refresh after a decision.
 * @returns The SessionDetailView component.
 */
export function SessionDetailView({
  session,
  entries,
  kernelApi,
  onBack,
  onDecided,
}: SessionDetailViewProps): React.ReactElement {
  const [focusedToken, setFocusedToken] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(
    () =>
      new Set(
        entries
          .filter((entry) => entry.status === 'pending')
          .map((entry) => entry.token),
      ),
  );
  const [scrollOffset, setScrollOffset] = useState(0);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingProvision, setEditingProvision] = useState(false);
  const [showProvisions, setShowProvisions] = useState(false);

  const activeProvisions = useMemo(
    () => deriveActiveProvisions(entries),
    [entries],
  );

  const { stdout } = useStdout();
  const columns = stdout.columns ?? 80;
  // StatusBar uses borderStyle="single" (3 rows). LogView uses height={maxLines+2}={6} rows.
  // Session header (1) + scroll indicators (2) = 3 more. Total overhead = 12.
  const maxRows = Math.max(4, (stdout.rows ?? 24) - 12);

  // Auto-expand any pending entries that arrive after the initial render (via polling).
  useEffect(() => {
    const pendingTokens = entries
      .filter((entry) => entry.status === 'pending')
      .map((entry) => entry.token);
    if (pendingTokens.length > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        let changed = false;
        for (const token of pendingTokens) {
          if (!next.has(token)) {
            next.add(token);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [entries]);

  // Reverse so newest (including all pending) appears at the top.
  const displayEntries = useMemo(() => [...entries].reverse(), [entries]);

  // Derive the cursor index from the focused token — survives new items
  // arriving above the current focus without shifting what's highlighted.
  const cursorIdx = useMemo(() => {
    if (focusedToken === null || displayEntries.length === 0) {
      return 0;
    }
    const idx = displayEntries.findIndex(
      (entry) => entry.token === focusedToken,
    );
    return idx === -1 ? 0 : idx;
  }, [focusedToken, displayEntries]);

  // Lock onto the first visible entry on arrival so the cursor is stable.
  useEffect(() => {
    if (focusedToken === null && displayEntries.length > 0) {
      setFocusedToken(displayEntries[0]?.token ?? null);
    }
  }, [displayEntries, focusedToken]);

  // Re-clamp scroll whenever the effective cursor position changes (new
  // items arriving, terminal resize, or item expansion).
  useEffect(() => {
    setScrollOffset((off) =>
      clampScroll({
        cursor: cursorIdx,
        currentOffset: off,
        entries: displayEntries,
        expanded,
        maxRows,
        columns,
      }),
    );
  }, [cursorIdx, displayEntries, expanded, maxRows, columns]);

  const focused = displayEntries[cursorIdx];

  const visEnd = windowEndIdx({
    entries: displayEntries,
    offset: scrollOffset,
    expanded,
    maxRows,
    columns,
  });
  const visibleEntries = displayEntries.slice(scrollOffset, visEnd);
  const countAbove = scrollOffset;
  const countBelow = displayEntries.length - visEnd;

  useInput((input, key) => {
    if (editingProvision) {
      return; // ProvisionEditor handles its own input
    }
    if (showProvisions) {
      return; // ProvisionsPanel handles its own input
    }
    if (input === 'P') {
      setShowProvisions(true);
      return;
    }
    if (key.upArrow) {
      const nextIdx = Math.max(0, cursorIdx - 1);
      setFocusedToken(displayEntries[nextIdx]?.token ?? null);
      setScrollOffset((off) =>
        clampScroll({
          cursor: nextIdx,
          currentOffset: off,
          entries: displayEntries,
          expanded,
          maxRows,
          columns,
        }),
      );
    } else if (key.downArrow) {
      const nextIdx = Math.min(displayEntries.length - 1, cursorIdx + 1);
      setFocusedToken(displayEntries[nextIdx]?.token ?? null);
      setScrollOffset((off) =>
        clampScroll({
          cursor: nextIdx,
          currentOffset: off,
          entries: displayEntries,
          expanded,
          maxRows,
          columns,
        }),
      );
    } else if (key.rightArrow && focused !== undefined) {
      const next = new Set([...expanded, focused.token]);
      setExpanded(next);
      setScrollOffset((off) =>
        clampScroll({
          cursor: cursorIdx,
          currentOffset: off,
          entries: displayEntries,
          expanded: next,
          maxRows,
          columns,
        }),
      );
    } else if (key.leftArrow) {
      if (focused !== undefined && expanded.has(focused.token)) {
        const next = new Set(expanded);
        next.delete(focused.token);
        setExpanded(next);
        setScrollOffset((off) =>
          clampScroll({
            cursor: cursorIdx,
            currentOffset: off,
            entries: displayEntries,
            expanded: next,
            maxRows,
            columns,
          }),
        );
      } else {
        onBack();
      }
    } else if (input === '2' && !deciding) {
      if (focused === undefined || focused.status !== 'pending') {
        return;
      }
      setEditingProvision(true);
    } else if ((input === '1' || input === '3') && !deciding) {
      if (focused === undefined || focused.status !== 'pending') {
        return;
      }
      const verdict = input === '1' ? 'accept' : 'reject';
      setDeciding(true);
      kernelApi
        .decide(session.sessionId, focused.token, verdict)
        .then(() => {
          onDecided();
          return undefined;
        })
        .catch((caught: Error) => {
          setError(caught.message);
        })
        .finally(() => {
          setDeciding(false);
        });
    }
  });

  const handleProvisionSubmit = (provisions: Provision[]): void => {
    if (focused === undefined || focused.status !== 'pending') {
      return;
    }
    setEditingProvision(false);
    setDeciding(true);
    kernelApi
      .decide(session.sessionId, focused.token, 'accept', provisions)
      .then(() => {
        onDecided();
        return undefined;
      })
      .catch((caught: Error) => {
        setError(caught.message);
      })
      .finally(() => {
        setDeciding(false);
      });
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={1}>
        <Text dimColor>←</Text>
        <Text bold color="cyan">
          {session.sessionId}
        </Text>
        {deciding && <Text color="yellow"> (submitting…)</Text>}
      </Box>
      {error !== null && <Text color="red">{error}</Text>}

      {showProvisions ? (
        <ProvisionsPanel
          provisions={activeProvisions}
          onClose={() => setShowProvisions(false)}
          onRevoke={async (provision) => {
            await kernelApi.revoke(session.sessionId, provision);
            onDecided();
          }}
        />
      ) : (
        <>
          {countAbove > 0 && <Text dimColor>↑ {countAbove} more</Text>}

          {displayEntries.length === 0 ? (
            <Text dimColor>No requests yet.</Text>
          ) : (
            visibleEntries.map((entry) => {
              const idx = displayEntries.indexOf(entry);
              const isFocused = idx === cursorIdx;
              const isExpanded = expanded.has(entry.token);
              const isEditingThis =
                editingProvision && isFocused && entry.status === 'pending';
              const icon =
                entry.status === 'accepted' &&
                entry.provisions !== undefined &&
                entry.provisions.length > 0
                  ? '◆'
                  : STATUS_ICON[entry.status];
              const color = STATUS_COLOR[entry.status];
              const isDimStatus = entry.status === 'provisioned';

              const { label } = parseDescription(entry.description);

              const expandedLines =
                isExpanded && !isEditingThis
                  ? formatExpandedContent(entry.description).split('\n')
                  : [];

              // Extract the tool name from the description label, e.g. "Allow Bash" → "Bash"
              const toolName = label.startsWith('Allow ')
                ? label.slice('Allow '.length)
                : label;

              return (
                <Box key={entry.token} flexDirection="column" marginTop={0}>
                  <Box gap={1}>
                    <Text>{isFocused ? '►' : ' '}</Text>
                    <Text color={color} dimColor={isDimStatus}>
                      {icon}
                    </Text>
                    <Text color="cyan" dimColor>
                      {formatTime(entry.queuedAt)}
                    </Text>
                    <Text bold={isFocused}>
                      {label}
                      {isEditingThis && (
                        <Text color="yellow"> (grant with provision…)</Text>
                      )}
                    </Text>
                  </Box>
                  {isEditingThis && (
                    <ProvisionEditor
                      toolName={toolName}
                      invocations={entry.invocations ?? []}
                      {...(entry.clauses === undefined
                        ? {}
                        : { clauses: entry.clauses })}
                      onSubmit={handleProvisionSubmit}
                      onCancel={() => setEditingProvision(false)}
                    />
                  )}
                  {expandedLines.map((line, lineIdx) => (
                    <Box key={`${entry.token}-${lineIdx}`} paddingLeft={4}>
                      <Text dimColor wrap="wrap">
                        {line}
                      </Text>
                    </Box>
                  ))}
                  {isExpanded &&
                    !isEditingThis &&
                    entry.provisions !== undefined &&
                    entry.status !== 'provisioned' && (
                      <Box paddingLeft={4} flexDirection="column">
                        <Text dimColor>provisions:</Text>
                        {entry.provisions.map((prov, provIdx) => (
                          <Box key={provIdx} flexDirection="column">
                            {prov.patterns.map((pattern, patIdx) => (
                              <Box
                                key={patIdx}
                                paddingLeft={2}
                                gap={1}
                                flexWrap="wrap"
                              >
                                <Text color="yellow">{pattern.name}</Text>
                                {pattern.argPatterns.map((argPat, argIdx) => (
                                  <Text key={argIdx} dimColor>
                                    {argPatternDisplay(argPat)}
                                  </Text>
                                ))}
                              </Box>
                            ))}
                          </Box>
                        ))}
                      </Box>
                    )}
                  {isExpanded &&
                    !isEditingThis &&
                    entry.status === 'provisioned' && (
                      <Box paddingLeft={4} flexDirection="column">
                        {entry.provisions === undefined ||
                        entry.provisions.length === 0 ? (
                          <Text dimColor>→ standing provision</Text>
                        ) : (
                          entry.provisions.map((prov, provIdx) => (
                            <Text key={provIdx} dimColor>
                              → by provision: {formatProvisionCompact(prov)}
                            </Text>
                          ))
                        )}
                      </Box>
                    )}
                  {isExpanded &&
                    !isEditingThis &&
                    entry.decidedAt !== undefined &&
                    entry.status !== 'provisioned' && (
                      <Box paddingLeft={4}>
                        <Text dimColor>
                          decided {formatTime(entry.decidedAt)}
                        </Text>
                      </Box>
                    )}
                  {isExpanded &&
                    !isEditingThis &&
                    entry.guard.body !== '#{}' && (
                      <Box paddingLeft={4}>
                        <Text dimColor>guard: {entry.guard.body}</Text>
                      </Box>
                    )}
                </Box>
              );
            })
          )}

          {countBelow > 0 && <Text dimColor>↓ {countBelow} more</Text>}
        </>
      )}
    </Box>
  );
}
