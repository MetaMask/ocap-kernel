import { Box, Text, useInput, useStdout } from 'ink';
import React, { useEffect, useMemo, useState } from 'react';

import type {
  KernelApi,
  SessionHistoryEntry,
  SessionSummary,
} from '../types.ts';

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
};

const STATUS_COLOR: Record<
  SessionHistoryEntry['status'],
  'yellow' | 'green' | 'red'
> = {
  pending: 'yellow',
  accepted: 'green',
  rejected: 'red',
};

/**
 * Format an ISO timestamp as `HH:mm:ss`.
 *
 * @param iso - ISO 8601 string.
 * @returns Formatted time string.
 */
function formatTime(iso: string): string {
  const date = new Date(iso);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

/**
 * Split a shell command string on ` && `, ` | `, and ` ; ` into segments,
 * keeping each operator as a prefix on its following segment so the parts
 * can be rendered as a list.
 *
 * @param command - The raw shell command string.
 * @returns Array of segments, e.g. `['cmd1', '&& cmd2', '| cmd3']`.
 */
function splitShellCommand(command: string): string[] {
  const operatorPattern = / (&&|\|(?!\|)|;) /gu;
  const parts: string[] = [];
  let lastCut = 0;
  let match: RegExpExecArray | null;
  while ((match = operatorPattern.exec(command)) !== null) {
    parts.push(command.slice(lastCut, match.index).trim());
    lastCut = match.index + 1; // operator starts right after the leading space
  }
  parts.push(command.slice(lastCut).trim());
  return parts.filter(Boolean);
}

type ParsedDescription = {
  /** The part before the opening `(`, e.g. `"Allow Bash"`. */
  label: string;
  /** The JSON object parsed from inside the parens, or `null` if absent/unparseable. */
  params: Record<string, unknown> | null;
};

/**
 * Attempt to parse a string as a JSON object (not an array or primitive).
 *
 * @param str - String to parse.
 * @returns The parsed object, or `null` if parsing fails or the result is not a plain object.
 */
function tryParseJsonObject(str: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(str);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Escape literal control characters (newlines, tabs, etc.) that appear inside
 * JSON string values, while leaving structural whitespace outside strings
 * untouched.  A bare `replace(/[\x00-\x1f]/g, …)` would corrupt structural
 * whitespace in pretty-printed JSON, making it unparseable.
 *
 * @param str - Raw params string, potentially with unescaped control chars.
 * @returns String with control chars inside JSON strings properly escaped.
 */
function escapeControlCharsInStrings(str: string): string {
  let out = '';
  let inString = false;
  let i = 0;
  while (i < str.length) {
    const ch = str[i];
    if (ch === '\\' && inString) {
      // Consume the escape sequence as-is.
      out += ch;
      i += 1;
      if (i < str.length) {
        out += str[i];
        i += 1;
      }
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      i += 1;
      continue;
    }
    if (inString && ch !== undefined) {
      const code = ch.charCodeAt(0);
      if (code < 32) {
        if (ch === '\n') {
          out += '\\n';
        } else if (ch === '\r') {
          out += '\\r';
        } else if (ch === '\t') {
          out += '\\t';
        } else {
          out += `\\u${code.toString(16).padStart(4, '0')}`;
        }
        i += 1;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Split a description of the form `Label({...json...})` into a short label and
 * a params object. Extracts the label even when JSON parsing fails.
 *
 * @param description - Raw entry description string.
 * @returns Parsed label and params.
 */
export function parseDescription(description: string): ParsedDescription {
  const parenIdx = description.indexOf('(');
  if (parenIdx === -1) {
    return { label: description, params: null };
  }
  // Always extract the label before `(`, even if JSON parsing below fails.
  const label = description.slice(0, parenIdx).trim();
  if (!description.endsWith(')')) {
    return { label, params: null };
  }
  const paramsStr = description.slice(parenIdx + 1, -1);

  // Fast path: properly encoded JSON (compact or pretty-printed with valid whitespace).
  const direct = tryParseJsonObject(paramsStr);
  if (direct !== null) {
    return { label, params: direct };
  }

  // Slow path: escape literal control chars inside string values only, then retry.
  const fallback = tryParseJsonObject(escapeControlCharsInStrings(paramsStr));
  return { label, params: fallback };
}

const MAX_STRING_LENGTH = 200;

/**
 * Extract top-level string-valued fields from a potentially-invalid JSON object
 * string. Useful when the outer JSON fails to parse (e.g. due to unescaped
 * double quotes inside a string value). Non-string fields are skipped.
 *
 * @param raw - Raw params string, e.g. `{"cmd":"...","desc":"..."}`.
 * @returns `[key, value]` pairs found, or `null` if the input is not object-shaped.
 */
function extractStringFields(raw: string): [string, string][] | null {
  if (!raw.startsWith('{')) {
    return null;
  }
  const fields: [string, string][] = [];
  // Match: "key" : " (opening of a string value; skips non-string fields)
  const keyRegex = /"([^"\\]+)"\s*:\s*"/gu;
  let match: RegExpExecArray | null;
  while ((match = keyRegex.exec(raw)) !== null) {
    const key = match[1];
    if (key === undefined) {
      continue;
    }
    let value = '';
    let idx = keyRegex.lastIndex;
    while (idx < raw.length) {
      const ch = raw[idx];
      if (ch === '\\') {
        idx += 1;
        const next = raw[idx];
        if (next === 'n') {
          value += '\n';
        } else if (next === 't') {
          value += '\t';
        } else if (next === 'r') {
          value += '\r';
        } else if (next !== undefined) {
          value += next;
        }
        idx += 1;
      } else if (ch === '"') {
        idx += 1;
        break;
      } else if (ch === undefined) {
        break;
      } else {
        value += ch;
        idx += 1;
      }
    }
    keyRegex.lastIndex = idx;
    fields.push([key, value]);
  }
  return fields.length > 0 ? fields : null;
}

/**
 * Format an entry description as compact plain text suitable for inline display.
 *
 * For Bash entries: shows just the command, split into one line per shell
 * operator segment (or per heredoc line) so the terminal stays readable.
 * For all other entries: shows `key: value` pairs, one per line.
 * Falls back to truncated raw params when JSON parsing and lenient extraction
 * both fail.
 *
 * @param description - The raw description string from the history entry or pending request.
 * @returns Newline-separated string for display.
 */
export function formatExpandedContent(description: string): string {
  const { label, params } = parseDescription(description);

  // Extract the raw params string (content inside the outer parens).
  const parenIdx = description.indexOf('(');
  const raw =
    parenIdx !== -1 && description.endsWith(')')
      ? description.slice(parenIdx + 1, -1)
      : description;

  // Resolve the best available field set: parsed JSON first, lenient extraction second.
  let fields: Record<string, unknown> | null = params;
  if (fields === null) {
    const extracted = extractStringFields(raw);
    if (extracted !== null) {
      fields = Object.fromEntries(extracted);
    }
  }

  if (fields === null) {
    // Last resort: truncated raw string
    return raw.length > MAX_STRING_LENGTH * 2
      ? `${raw.slice(0, MAX_STRING_LENGTH * 2)}…`
      : raw;
  }

  // For Bash: show only the command, split into readable segments.
  // Split BEFORE truncating so each segment is limited independently —
  // a long command with short segments must not be cut mid-segment.
  if (label.includes('Bash') && typeof fields.command === 'string') {
    const segments = fields.command.includes('\n')
      ? fields.command.split('\n').filter(Boolean)
      : splitShellCommand(fields.command);
    return segments
      .map((segment) =>
        segment.length > MAX_STRING_LENGTH
          ? `${segment.slice(0, MAX_STRING_LENGTH)}…`
          : segment,
      )
      .join('\n');
  }

  // Generic: compact `key: value` pairs, one per line.
  return Object.entries(fields)
    .map(([key, value]) => {
      if (typeof value === 'string') {
        const truncated =
          value.length > MAX_STRING_LENGTH
            ? `${value.slice(0, MAX_STRING_LENGTH)}…`
            : value;
        return `${key}: ${truncated}`;
      }
      const json = JSON.stringify(value);
      const truncated =
        json.length > MAX_STRING_LENGTH
          ? `${json.slice(0, MAX_STRING_LENGTH)}…`
          : json;
      return `${key}: ${truncated}`;
    })
    .join('\n');
}

/**
 * Number of terminal rows a single entry occupies when rendered, accounting
 * for lines that wrap because they exceed the effective content width.
 *
 * @param entry - The history entry.
 * @param exp - Set of currently-expanded entry tokens.
 * @param columns - Terminal column count used to compute wrap boundaries.
 * @returns Row count for the entry.
 */
function entryRowCount(
  entry: SessionHistoryEntry,
  exp: Set<string>,
  columns: number,
): number {
  if (!exp.has(entry.token)) {
    return 1;
  }
  // paddingX={1} on outer box (2 chars) + paddingLeft={4} on content box = 6 chars overhead.
  const effectiveWidth = Math.max(20, columns - 6);
  const contentLines = formatExpandedContent(entry.description).split('\n');
  const contentRows = contentLines.reduce((sum, line) => {
    return sum + Math.max(1, Math.ceil(line.length / effectiveWidth));
  }, 0);
  const extras =
    (entry.decidedAt === undefined ? 0 : 1) +
    (entry.guard.body === '#{}' ? 0 : 1);
  return 1 + contentRows + extras;
}

/**
 * Exclusive end index of the visible window that begins at `offset` and fits
 * within `maxRows` terminal rows.
 *
 * @param entries - All display entries.
 * @param offset - Index of the first visible entry.
 * @param exp - Set of currently-expanded entry tokens.
 * @param maxRows - Maximum rows available for entries.
 * @param columns - Terminal column count passed through to {@link entryRowCount}.
 * @returns One past the index of the last visible entry.
 */
function windowEndIdx(
  entries: SessionHistoryEntry[],
  offset: number,
  exp: Set<string>,
  maxRows: number,
  columns: number,
): number {
  if (entries.length === 0) {
    return 0;
  }
  const start = Math.max(0, Math.min(offset, entries.length - 1));
  let rows = 0;
  let i = start;
  while (i < entries.length) {
    const rowHeight = entryRowCount(
      entries[i] as SessionHistoryEntry,
      exp,
      columns,
    );
    if (rows + rowHeight > maxRows && i > start) {
      break;
    }
    rows += rowHeight;
    i += 1;
  }
  return i;
}

/**
 * Minimum scroll offset that keeps the cursor entry within the visible window.
 *
 * @param cursor - Index of the focused entry.
 * @param currentOffset - Current scroll offset.
 * @param entries - All display entries.
 * @param exp - Set of currently-expanded entry tokens.
 * @param maxRows - Maximum rows available for entries.
 * @param columns - Terminal column count passed through to {@link windowEndIdx}.
 * @returns Adjusted scroll offset.
 */
function clampScroll(
  cursor: number,
  currentOffset: number,
  entries: SessionHistoryEntry[],
  exp: Set<string>,
  maxRows: number,
  columns: number,
): number {
  if (cursor < currentOffset) {
    return cursor;
  }
  if (cursor < windowEndIdx(entries, currentOffset, exp, maxRows, columns)) {
    return currentOffset;
  }
  let newOffset = currentOffset;
  while (newOffset < cursor) {
    newOffset += 1;
    if (cursor < windowEndIdx(entries, newOffset, exp, maxRows, columns)) {
      break;
    }
  }
  return newOffset;
}

/**
 * Detail view for a single session showing a reverse-chronological timeline of
 * authorization requests (most recent at top). Each entry can be expanded with
 * the right arrow key and collapsed with the left arrow key. Left arrow on a
 * collapsed entry navigates back to the session list.
 *
 * Keybindings: ↑/↓ navigate, → expand, ← collapse/back, 1 accept, 3 reject.
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
      clampScroll(cursorIdx, off, displayEntries, expanded, maxRows, columns),
    );
  }, [cursorIdx, displayEntries, expanded, maxRows, columns]);

  const focused = displayEntries[cursorIdx];

  const visEnd = windowEndIdx(
    displayEntries,
    scrollOffset,
    expanded,
    maxRows,
    columns,
  );
  const visibleEntries = displayEntries.slice(scrollOffset, visEnd);
  const countAbove = scrollOffset;
  const countBelow = displayEntries.length - visEnd;

  useInput((input, key) => {
    if (key.upArrow) {
      const nextIdx = Math.max(0, cursorIdx - 1);
      setFocusedToken(displayEntries[nextIdx]?.token ?? null);
      setScrollOffset((off) =>
        clampScroll(nextIdx, off, displayEntries, expanded, maxRows, columns),
      );
    } else if (key.downArrow) {
      const nextIdx = Math.min(displayEntries.length - 1, cursorIdx + 1);
      setFocusedToken(displayEntries[nextIdx]?.token ?? null);
      setScrollOffset((off) =>
        clampScroll(nextIdx, off, displayEntries, expanded, maxRows, columns),
      );
    } else if (key.rightArrow && focused !== undefined) {
      const next = new Set([...expanded, focused.token]);
      setExpanded(next);
      setScrollOffset((off) =>
        clampScroll(cursorIdx, off, displayEntries, next, maxRows, columns),
      );
    } else if (key.leftArrow) {
      if (focused !== undefined && expanded.has(focused.token)) {
        const next = new Set(expanded);
        next.delete(focused.token);
        setExpanded(next);
        setScrollOffset((off) =>
          clampScroll(cursorIdx, off, displayEntries, next, maxRows, columns),
        );
      } else {
        onBack();
      }
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

      {countAbove > 0 && <Text dimColor>↑ {countAbove} more</Text>}

      {displayEntries.length === 0 ? (
        <Text dimColor>No requests yet.</Text>
      ) : (
        visibleEntries.map((entry) => {
          const idx = displayEntries.indexOf(entry);
          const isFocused = idx === cursorIdx;
          const isExpanded = expanded.has(entry.token);
          const icon = STATUS_ICON[entry.status];
          const color = STATUS_COLOR[entry.status];

          const { label } = parseDescription(entry.description);

          const expandedLines = isExpanded
            ? formatExpandedContent(entry.description).split('\n')
            : [];

          return (
            <Box key={entry.token} flexDirection="column" marginTop={0}>
              <Box gap={1}>
                <Text>{isFocused ? '►' : ' '}</Text>
                <Text color={color}>{icon}</Text>
                <Text color="cyan" dimColor>
                  {formatTime(entry.queuedAt)}
                </Text>
                <Text bold={isFocused}>{label}</Text>
              </Box>
              {expandedLines.map((line, lineIdx) => (
                <Box key={`${entry.token}-${lineIdx}`} paddingLeft={4}>
                  <Text dimColor wrap="wrap">
                    {line}
                  </Text>
                </Box>
              ))}
              {isExpanded && entry.decidedAt !== undefined && (
                <Box paddingLeft={4}>
                  <Text dimColor>decided {formatTime(entry.decidedAt)}</Text>
                </Box>
              )}
              {isExpanded && entry.guard.body !== '#{}' && (
                <Box paddingLeft={4}>
                  <Text dimColor>guard: {entry.guard.body}</Text>
                </Box>
              )}
            </Box>
          );
        })
      )}

      {countBelow > 0 && <Text dimColor>↓ {countBelow} more</Text>}
    </Box>
  );
}
