import type { SessionWithRequests } from '../hooks/use-session-data.ts';

export type Bucket = 'recent' | 'oldish' | 'archived';

const HOURS_3_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Return a Date at the start of the local calendar day containing `date`.
 *
 * @param date - The reference Date.
 * @returns A new Date at 00:00:00.000 local time.
 */
function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Return a Date at the start of the ISO week (Monday 00:00 local) containing
 * `date`.
 *
 * @param date - The reference Date.
 * @returns A new Date at the start of that week.
 */
function startOfWeekMonday(date: Date): Date {
  const result = startOfDay(date);
  const day = result.getDay();
  const offset = day === 0 ? 6 : day - 1;
  result.setDate(result.getDate() - offset);
  return result;
}

/**
 * Classify a timestamp into a recency bucket.
 *
 * - `recent`: lastActive is on today's calendar day OR within the last 3 hours.
 * - `oldish`: lastActive is within this or last ISO calendar week, but not recent.
 * - `archived`: anything older, or missing/invalid.
 *
 * @param timestamp - ISO 8601 timestamp, or undefined.
 * @param now - The reference "now" Date.
 * @returns The bucket name.
 */
export function bucketFor(timestamp: string | undefined, now: Date): Bucket {
  if (timestamp === undefined) {
    return 'archived';
  }
  const stamp = new Date(timestamp);
  const stampMs = stamp.getTime();
  if (Number.isNaN(stampMs)) {
    return 'archived';
  }
  const todayStart = startOfDay(now).getTime();
  const last3hCutoff = now.getTime() - HOURS_3_MS;
  if (stampMs >= todayStart || stampMs >= last3hCutoff) {
    return 'recent';
  }
  const thisWeekStart = startOfWeekMonday(now).getTime();
  const lastWeekStart = thisWeekStart - 7 * DAY_MS;
  if (stampMs >= lastWeekStart) {
    return 'oldish';
  }
  return 'archived';
}

export type BucketedSessions = {
  recent: SessionWithRequests[];
  oldish: SessionWithRequests[];
  archived: SessionWithRequests[];
};

/**
 * Group sessions into recency buckets. Each session's `lastActiveAt` (with
 * fallback to `startedAt`) is run through {@link bucketFor}; the input order
 * within each bucket is preserved.
 *
 * @param sessions - Sessions in display order (most recently active first).
 * @param now - The reference "now" Date.
 * @returns Buckets keyed by name.
 */
export function bucketSessions(
  sessions: SessionWithRequests[],
  now: Date,
): BucketedSessions {
  const buckets: BucketedSessions = {
    recent: [],
    oldish: [],
    archived: [],
  };
  for (const session of sessions) {
    const stamp = session.lastActiveAt ?? session.startedAt;
    buckets[bucketFor(stamp, now)].push(session);
  }
  return buckets;
}
