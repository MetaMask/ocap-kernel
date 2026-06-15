import { describe, it, expect } from 'vitest';

import { bucketFor, bucketSessions } from './session-buckets.ts';
import type { SessionWithRequests } from '../hooks/use-session-data.ts';

function makeSession(
  overrides: Partial<SessionWithRequests>,
): SessionWithRequests {
  return {
    sessionId: 'sess',
    ocapUrl: 'ocap://sess',
    requests: [],
    ...overrides,
  };
}

// A Tuesday at 14:00 local time, well clear of any DST edge.
const NOW = new Date(2026, 5, 16, 14, 0, 0); // 2026-06-16 (Tue)

describe('bucketFor', () => {
  it.each([
    { label: 'same day, hours earlier', offsetMs: -2 * 60 * 60 * 1000 },
    { label: 'same day, minutes earlier', offsetMs: -10 * 60 * 1000 },
    { label: 'exactly today midnight', offsetMs: -14 * 60 * 60 * 1000 },
  ])('classifies $label as recent', ({ offsetMs }) => {
    const stamp = new Date(NOW.getTime() + offsetMs).toISOString();
    expect(bucketFor(stamp, NOW)).toBe('recent');
  });

  it('classifies a late-night session from yesterday within the last 3 hours as recent', () => {
    // It's 02:00; lastActive was 23:30 yesterday — 2.5h ago.
    const earlyMorning = new Date(2026, 5, 17, 2, 0, 0);
    const lateLastNight = new Date(2026, 5, 16, 23, 30, 0).toISOString();
    expect(bucketFor(lateLastNight, earlyMorning)).toBe('recent');
  });

  it('classifies yesterday afternoon (more than 3h ago, before today) as oldish', () => {
    // NOW is Tuesday 14:00; yesterday 14:00 is 24h ago → not recent, but in this week.
    const yesterdayAfternoon = new Date(2026, 5, 15, 14, 0, 0).toISOString();
    expect(bucketFor(yesterdayAfternoon, NOW)).toBe('oldish');
  });

  it('classifies last calendar week as oldish', () => {
    // NOW is Tuesday 2026-06-16; previous Monday is 2026-06-08.
    const lastWeek = new Date(2026, 5, 9, 10, 0, 0).toISOString();
    expect(bucketFor(lastWeek, NOW)).toBe('oldish');
  });

  it('classifies two weeks ago as archived', () => {
    const twoWeeksAgo = new Date(2026, 5, 2, 10, 0, 0).toISOString();
    expect(bucketFor(twoWeeksAgo, NOW)).toBe('archived');
  });

  it('classifies an undefined timestamp as archived', () => {
    expect(bucketFor(undefined, NOW)).toBe('archived');
  });

  it('classifies an unparseable timestamp as archived', () => {
    expect(bucketFor('not-a-date', NOW)).toBe('archived');
  });
});

describe('bucketSessions', () => {
  it('groups sessions by lastActiveAt with fallback to startedAt', () => {
    const recent = makeSession({
      sessionId: 'r',
      lastActiveAt: new Date(NOW.getTime() - 10 * 60 * 1000).toISOString(),
    });
    const earlier = makeSession({
      sessionId: 'e',
      lastActiveAt: new Date(2026, 5, 15, 10, 0, 0).toISOString(),
    });
    const old = makeSession({
      sessionId: 'o',
      // no lastActiveAt, falls back to startedAt
      startedAt: new Date(2026, 5, 1, 10, 0, 0).toISOString(),
    });
    expect(bucketSessions([recent, earlier, old], NOW)).toStrictEqual({
      recent: [recent],
      oldish: [earlier],
      archived: [old],
    });
  });

  it('preserves input order within each bucket', () => {
    const first = makeSession({
      sessionId: 'a',
      lastActiveAt: new Date(NOW.getTime() - 10 * 60 * 1000).toISOString(),
    });
    const second = makeSession({
      sessionId: 'b',
      lastActiveAt: new Date(NOW.getTime() - 30 * 60 * 1000).toISOString(),
    });
    const grouped = bucketSessions([first, second], NOW);
    expect(grouped.recent.map((sess) => sess.sessionId)).toStrictEqual([
      'a',
      'b',
    ]);
  });
});
