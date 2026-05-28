import type {
  ArgPattern,
  ParsedInvocation,
  Provision,
} from '@metamask/kernel-utils/session';
import {
  argInterval,
  argPatternDisplay,
  invocationToProvision,
} from '@metamask/kernel-utils/session';
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

/**
 * Render a Provision as a compact one-liner, e.g. `git log --oneline * | head *`.
 *
 * @param provision - The provision to format.
 * @returns Compact string representation.
 */
function formatProvisionCompact(provision: Provision): string {
  return provision.patterns
    .map((patt) =>
      [patt.name, ...patt.argPatterns.map(argPatternDisplay)].join(' '),
    )
    .join(' | ');
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
  const provisionRows = (entry.provisions ?? []).reduce(
    (sum, prov) => sum + 1 + prov.patterns.length,
    0,
  );
  const extras =
    (entry.decidedAt === undefined ? 0 : 1) +
    (entry.guard.body === '#{}' ? 0 : 1) +
    provisionRows;
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

type FlatArg = {
  invIdx: number;
  argIdx: number;
  value: string;
  interval: ArgPattern[];
};

type ProvisionEditorProps = {
  toolName: string;
  invocations: ParsedInvocation[];
  clauses?: ParsedInvocation[][];
  onSubmit: (provisions: Provision[]) => void;
  onCancel: () => void;
};

/**
 * Interactive editor that lets the user tune each arg in a pending invocation
 * to a wider pattern (prefix or wildcard) before granting a standing provision.
 *
 * Keybinds: ←/→ navigate args, ↑ widen, ↓ narrow, Enter submit, Esc cancel.
 *
 * @param props - Component props.
 * @param props.toolName - The tool name (e.g. "Bash").
 * @param props.invocations - The parsed invocations for the pending request (single-clause fallback).
 * @param props.clauses - Multi-clause breakdown — one Pipeline per &&/||/; operand.
 * @param props.onSubmit - Called with the resulting Provisions when Enter is pressed.
 * @param props.onCancel - Called when Esc is pressed.
 * @returns The ProvisionEditor component.
 */
function ProvisionEditor({
  toolName,
  invocations,
  clauses,
  onSubmit,
  onCancel,
}: ProvisionEditorProps): React.ReactElement {
  // Use clauses if provided, otherwise treat invocations as a single clause
  const effectiveClauses = useMemo(
    () => clauses ?? [invocations],
    [clauses, invocations],
  );

  const flatArgs = useMemo<FlatArg[]>(() => {
    const result: FlatArg[] = [];
    for (const clause of effectiveClauses) {
      for (let ii = 0; ii < clause.length; ii++) {
        const inv = clause[ii];
        if (inv === undefined) {
          continue;
        }
        for (let jj = 0; jj < inv.argv.length; jj++) {
          const value = inv.argv[jj];
          if (value !== undefined) {
            result.push({
              invIdx: ii,
              argIdx: jj,
              value,
              interval: argInterval(value),
            });
          }
        }
      }
    }
    return result;
  }, [effectiveClauses]);

  const [cursor, setCursor] = useState(0);
  const [sels, setSels] = useState<number[]>(() => flatArgs.map(() => 0));

  const currentFlatArg = flatArgs[cursor];
  const currentSel = sels[cursor] ?? 0;
  const currentPattern = currentFlatArg?.interval[currentSel];

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    } else if (key.return) {
      const provisions =
        flatArgs.length === 0
          ? effectiveClauses.map((clause) =>
              invocationToProvision(toolName, clause),
            )
          : buildProvisions(toolName, effectiveClauses, flatArgs, sels);
      onSubmit(provisions);
    } else if (key.rightArrow) {
      setCursor((idx) => Math.min(flatArgs.length - 1, idx + 1));
    } else if (key.leftArrow) {
      setCursor((idx) => Math.max(0, idx - 1));
    } else if (key.upArrow && currentFlatArg !== undefined) {
      setSels((prev) => {
        const next = [...prev];
        next[cursor] = Math.min(
          currentFlatArg.interval.length - 1,
          (next[cursor] ?? 0) + 1,
        );
        return next;
      });
    } else if (key.downArrow) {
      setSels((prev) => {
        const next = [...prev];
        next[cursor] = Math.max(0, (next[cursor] ?? 0) - 1);
        return next;
      });
    }
  });

  // Render clauses with && separators; each clause shows its pipeline with | separators.
  // Cursor arg is highlighted; widened args appear in a different color.
  let flatIdx = 0;
  const clauseLines = effectiveClauses.map((clause, clauseIdx) => {
    const pipelineNodes = clause.map((inv, invIdx) => {
      const argNodes = inv.argv.map((val, argIdx) => {
        const fi = flatIdx;
        flatIdx += 1;
        const sel = sels[fi] ?? 0;
        const interval = flatArgs[fi]?.interval ?? argInterval(val);
        const pat = interval[sel];
        const display = pat === undefined ? val : argPatternDisplay(pat);
        const isCursor = fi === cursor;
        const isWidened = sel > 0;
        let argColor: 'cyan' | 'yellow' | undefined;
        if (isCursor) {
          argColor = 'cyan';
        } else if (isWidened) {
          argColor = 'yellow';
        }
        return (
          <Text
            key={`${clauseIdx}-${invIdx}-${argIdx}`}
            {...(argColor === undefined ? {} : { color: argColor })}
            bold={isCursor}
          >
            {' '}
            {display}
          </Text>
        );
      });
      return (
        <React.Fragment key={`${clauseIdx}-${invIdx}`}>
          {invIdx > 0 && <Text dimColor> |</Text>}
          <Text bold>{inv.name}</Text>
          {argNodes}
        </React.Fragment>
      );
    });
    return (
      <Box key={clauseIdx} gap={1} flexWrap="wrap">
        {clauseIdx > 0 && <Text dimColor>&amp;&amp;</Text>}
        {pipelineNodes}
      </Box>
    );
  });

  return (
    <Box flexDirection="column" paddingLeft={4} marginTop={1}>
      {clauseLines}
      {currentFlatArg !== undefined && currentPattern !== undefined && (
        <Box paddingLeft={2} gap={1} marginTop={0}>
          <Text dimColor>↕</Text>
          <Text color="cyan">{argPatternDisplay(currentPattern)}</Text>
          <Text dimColor>
            ({currentFlatArg.interval.indexOf(currentPattern) + 1}/
            {currentFlatArg.interval.length})
          </Text>
        </Box>
      )}
      {flatArgs.length === 0 && (
        <Text dimColor>
          {' '}
          (no args — will match any invocation of {toolName})
        </Text>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          ←/→ navigate · ↑ widen · ↓ narrow · Enter grant · Esc cancel
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Build one Provision per clause from the editor's current selections.
 *
 * @param toolName - The tool name.
 * @param clauses - The original parsed clauses (each clause is a pipeline of invocations).
 * @param flatArgs - Flattened arg list with intervals (across all clauses in order).
 * @param sels - Per-flat-arg selection indices into each interval.
 * @returns An array of Provisions — one per clause.
 */
function buildProvisions(
  toolName: string,
  clauses: ParsedInvocation[][],
  flatArgs: FlatArg[],
  sels: number[],
): Provision[] {
  let flatIdx = 0;
  return clauses.map((clause) => ({
    tool: toolName,
    patterns: clause.map((inv) => ({
      name: inv.name,
      argPatterns: inv.argv.map((val) => {
        const fi = flatIdx;
        flatIdx += 1;
        const sel = sels[fi] ?? 0;
        const interval = flatArgs[fi]?.interval ?? argInterval(val);
        return interval[sel] ?? ({ kind: 'wildcard' } as const);
      }),
    })),
  }));
}

/**
 * Derive the list of unique active provisions from the session history.
 * Includes provisions from both user-granted (◆) and auto-accepted (→) entries.
 * Deduplicates by JSON-serialized content.
 *
 * @param entries - The full session history.
 * @returns Unique provisions, in the order they first appeared.
 */
function deriveActiveProvisions(entries: SessionHistoryEntry[]): Provision[] {
  const seen = new Set<string>();
  const result: Provision[] = [];
  for (const entry of entries) {
    for (const prov of entry.provisions ?? []) {
      const key = JSON.stringify(prov);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(prov);
      }
    }
  }
  return result;
}

/**
 * Panel listing the active standing provisions for a session.
 *
 * @param props - Component props.
 * @param props.provisions - The list of active provisions.
 * @param props.onClose - Callback to close the panel.
 * @returns The ProvisionsPanel component.
 */
function ProvisionsPanel({
  provisions,
  onClose,
}: {
  provisions: Provision[];
  onClose: () => void;
}): React.ReactElement {
  useInput((_input, key) => {
    if (key.escape) {
      onClose();
    }
  });

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box gap={1} marginBottom={0}>
        <Text bold color="cyan">
          Active provisions
        </Text>
        <Text dimColor>— Esc to close</Text>
      </Box>
      {provisions.length === 0 ? (
        <Text dimColor> No standing provisions yet.</Text>
      ) : (
        provisions.map((prov, idx) => (
          <Box key={idx} gap={1}>
            <Text dimColor>◆</Text>
            <Text color="yellow">{prov.tool}</Text>
            <Text>{formatProvisionCompact(prov)}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}

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
                      {...(entry.clauses !== undefined
                        ? { clauses: entry.clauses }
                        : {})}
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
