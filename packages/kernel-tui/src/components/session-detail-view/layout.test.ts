import { describe, expect, it } from 'vitest';

import { clampScroll, entryRowCount, windowEndIdx } from './layout.ts';
import type { SessionHistoryEntry } from '../../types.ts';

function makeEntry(
  token: string,
  overrides: Partial<SessionHistoryEntry> = {},
): SessionHistoryEntry {
  return {
    token,
    description: 'Allow Read({"file_path":"/x"})',
    reason: 'r',
    guard: { body: '#{}', slots: [] },
    queuedAt: '2026-01-01T00:00:00.000Z',
    status: 'pending',
    ...overrides,
  };
}

describe('entryRowCount', () => {
  it('returns 1 for a collapsed entry', () => {
    expect(
      entryRowCount({
        entry: makeEntry('t0'),
        expanded: new Set(),
        columns: 80,
      }),
    ).toBe(1);
  });

  it('counts header + one content row for an expanded short entry', () => {
    // Description renders as `file_path: /x` (13 chars) — 1 line, well under width.
    expect(
      entryRowCount({
        entry: makeEntry('t0'),
        expanded: new Set(['t0']),
        columns: 80,
      }),
    ).toBe(2);
  });

  it('adds one row when the entry is decided', () => {
    expect(
      entryRowCount({
        entry: makeEntry('t0', { decidedAt: '2026-01-01T00:00:01.000Z' }),
        expanded: new Set(['t0']),
        columns: 80,
      }),
    ).toBe(3);
  });

  it('adds one row when the guard body is non-trivial', () => {
    expect(
      entryRowCount({
        entry: makeEntry('t0', {
          guard: { body: '#{m:[]}', slots: [] },
        }),
        expanded: new Set(['t0']),
        columns: 80,
      }),
    ).toBe(3);
  });

  it('adds rows for provisions (header + one per pattern)', () => {
    const entry = makeEntry('t0', {
      status: 'accepted',
      provisions: [
        {
          tool: 'Bash',
          patterns: [
            { name: 'ls', argPatterns: [{ kind: 'wildcard' }] },
            { name: 'head', argPatterns: [{ kind: 'wildcard' }] },
          ],
        },
      ],
    });
    // 1 header + 1 content + 3 provision rows = 5
    expect(
      entryRowCount({
        entry,
        expanded: new Set(['t0']),
        columns: 80,
      }),
    ).toBe(5);
  });

  it('accounts for wrapped content rows in narrow terminals', () => {
    // columns - 6 = 14 effective width. content is 13 chars → still 1 row.
    expect(
      entryRowCount({
        entry: makeEntry('t0'),
        expanded: new Set(['t0']),
        columns: 20,
      }),
    ).toBe(2);
    // With a tiny terminal we clamp width to 20 so the same content fits in one row.
    expect(
      entryRowCount({
        entry: makeEntry('t0'),
        expanded: new Set(['t0']),
        columns: 5,
      }),
    ).toBe(2);
  });
});

describe('windowEndIdx', () => {
  it('returns 0 for an empty list', () => {
    expect(
      windowEndIdx({
        entries: [],
        offset: 0,
        expanded: new Set(),
        maxRows: 10,
        columns: 80,
      }),
    ).toBe(0);
  });

  it('includes all entries when they fit', () => {
    const entries = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
    expect(
      windowEndIdx({
        entries,
        offset: 0,
        expanded: new Set(),
        maxRows: 10,
        columns: 80,
      }),
    ).toBe(3);
  });

  it('stops when adding the next entry would exceed maxRows', () => {
    const entries = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
    expect(
      windowEndIdx({
        entries,
        offset: 0,
        expanded: new Set(),
        maxRows: 2,
        columns: 80,
      }),
    ).toBe(2);
  });

  it('always includes at least the first entry past the offset', () => {
    // A single expanded entry that exceeds maxRows on its own must still be included.
    const entries = [makeEntry('a', { decidedAt: '2026-01-01T00:00:01.000Z' })];
    expect(
      windowEndIdx({
        entries,
        offset: 0,
        expanded: new Set(['a']),
        maxRows: 1,
        columns: 80,
      }),
    ).toBe(1);
  });
});

describe('clampScroll', () => {
  const entries = [
    makeEntry('a'),
    makeEntry('b'),
    makeEntry('c'),
    makeEntry('d'),
    makeEntry('e'),
  ];

  it('snaps the offset down to the cursor when the cursor is above', () => {
    expect(
      clampScroll({
        cursor: 0,
        currentOffset: 2,
        entries,
        expanded: new Set(),
        maxRows: 3,
        columns: 80,
      }),
    ).toBe(0);
  });

  it('leaves the offset alone when the cursor is already visible', () => {
    expect(
      clampScroll({
        cursor: 1,
        currentOffset: 0,
        entries,
        expanded: new Set(),
        maxRows: 5,
        columns: 80,
      }),
    ).toBe(0);
  });

  it('scrolls forward by the minimum needed to reveal the cursor', () => {
    expect(
      clampScroll({
        cursor: 3,
        currentOffset: 0,
        entries,
        expanded: new Set(),
        maxRows: 2,
        columns: 80,
      }),
    ).toBe(2);
  });
});
