import { formatExpandedContent } from './format.ts';
import type { SessionHistoryEntry } from '../../types.ts';

/**
 * Number of terminal rows a single entry occupies when rendered, accounting
 * for lines that wrap because they exceed the effective content width.
 *
 * @param options - Options bag.
 * @param options.entry - The history entry.
 * @param options.expanded - Set of currently-expanded entry tokens.
 * @param options.columns - Terminal column count used to compute wrap boundaries.
 * @returns Row count for the entry.
 */
export function entryRowCount(options: {
  entry: SessionHistoryEntry;
  expanded: Set<string>;
  columns: number;
}): number {
  const { entry, expanded, columns } = options;
  if (!expanded.has(entry.token)) {
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
 * @param options - Options bag.
 * @param options.entries - All display entries.
 * @param options.offset - Index of the first visible entry.
 * @param options.expanded - Set of currently-expanded entry tokens.
 * @param options.maxRows - Maximum rows available for entries.
 * @param options.columns - Terminal column count passed through to {@link entryRowCount}.
 * @returns One past the index of the last visible entry.
 */
export function windowEndIdx(options: {
  entries: SessionHistoryEntry[];
  offset: number;
  expanded: Set<string>;
  maxRows: number;
  columns: number;
}): number {
  const { entries, offset, expanded, maxRows, columns } = options;
  if (entries.length === 0) {
    return 0;
  }
  const start = Math.max(0, Math.min(offset, entries.length - 1));
  let rows = 0;
  let i = start;
  while (i < entries.length) {
    const rowHeight = entryRowCount({
      entry: entries[i] as SessionHistoryEntry,
      expanded,
      columns,
    });
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
 * @param options - Options bag.
 * @param options.cursor - Index of the focused entry.
 * @param options.currentOffset - Current scroll offset.
 * @param options.entries - All display entries.
 * @param options.expanded - Set of currently-expanded entry tokens.
 * @param options.maxRows - Maximum rows available for entries.
 * @param options.columns - Terminal column count passed through to {@link windowEndIdx}.
 * @returns Adjusted scroll offset.
 */
export function clampScroll(options: {
  cursor: number;
  currentOffset: number;
  entries: SessionHistoryEntry[];
  expanded: Set<string>;
  maxRows: number;
  columns: number;
}): number {
  const { cursor, currentOffset, entries, expanded, maxRows, columns } =
    options;
  if (cursor < currentOffset) {
    return cursor;
  }
  if (
    cursor <
    windowEndIdx({ entries, offset: currentOffset, expanded, maxRows, columns })
  ) {
    return currentOffset;
  }
  let newOffset = currentOffset;
  while (newOffset < cursor) {
    newOffset += 1;
    if (
      cursor <
      windowEndIdx({ entries, offset: newOffset, expanded, maxRows, columns })
    ) {
      break;
    }
  }
  return newOffset;
}
